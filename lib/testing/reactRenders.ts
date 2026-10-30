/**
 * The components React rendered, counted as React DevTools counts them: on
 * each commit, every function, class, forwardRef and memo component that did
 * work. For budgets on what a scroll, a hover or an edit costs (the tables
 * grid and phone list, a message's toolbar).
 *
 * React DOM looks for the DevTools hook once, as it loads, so import this
 * before anything that loads it: a test file's first import. A count read
 * before React DOM joined throws, so a budget can't pass on a count of zero.
 */

type Fiber = { tag: number; flags: number; type: unknown; child: Fiber | null; sibling: Fiber | null; alternate: Fiber | null }
type Named = { displayName?: string; name?: string; type?: unknown; render?: unknown }

/** React's tags for components: function 0, class 1, forwardRef 11, memo 14, simple memo 15. */
const COMPONENT = new Set([0, 1, 11, 14, 15])
/** The flag React sets on a fiber that did work in a commit (PerformedWork). */
const PERFORMED_WORK = 1

const nameOf = (t: unknown): string =>
  typeof t === "function" ? (t as Named).displayName || t.name || "?" : t && typeof t === "object" ? nameOf((t as Named).type || (t as Named).render) : "?"

const seen = { fibers: 0, byName: {} as Record<string, number>, joined: 0, missed: undefined as unknown }

// A fiber new in this commit (no alternate) rendered; one kept rendered if it did work.
function walk(next: Fiber, prev: Fiber | null) {
  if (COMPONENT.has(next.tag) && (prev === null || (next.flags & PERFORMED_WORK) === PERFORMED_WORK)) {
    seen.fibers++
    const n = nameOf(next.type)
    seen.byName[n] = (seen.byName[n] || 0) + 1
  }
  if (prev !== null && next.child === prev.child) return
  for (let child = next.child; child; child = child.sibling) walk(child, prev === null ? null : child.alternate)
}

const renderers = new Map<number, unknown>()
;(globalThis as unknown as { __REACT_DEVTOOLS_GLOBAL_HOOK__: object }).__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
  renderers,
  supportsFiber: true,
  isDisabled: false,
  inject(r: unknown) {
    const id = renderers.size + 1
    renderers.set(id, r)
    seen.joined++
    return id
  },
  onScheduleFiberRoot() {},
  // React drops what its hook throws, so a commit the walk couldn't count is
  // kept and thrown by the count: a budget can't pass on a short count.
  onCommitFiberRoot(_id: number, root: { current: Fiber }) {
    try {
      walk(root.current, root.current.alternate)
    } catch (e) {
      seen.missed ??= e
    }
  },
  onCommitFiberUnmount() {},
  onPostCommitFiberRoot() {},
  checkDCE() {},
}

export const renders = {
  /** Starts the count again from zero. */
  reset() {
    seen.fibers = 0
    seen.byName = {}
    seen.missed = undefined
  },
  /** Components rendered since the last reset. */
  get count(): number {
    if (!seen.joined) throw new Error("React DOM loaded before lib/testing/reactRenders: import it first")
    if (seen.missed !== undefined) throw new Error("lib/testing/reactRenders couldn't count a commit", { cause: seen.missed })
    return seen.fibers
  },
  /** The components rendered most since the last reset, as "Name n, ...", for a failure's message. */
  top(n = 12): string {
    return Object.entries(seen.byName)
      .sort((a, b) => b[1] - a[1])
      .slice(0, n)
      .map(([name, k]) => `${name} ${k}`)
      .join(", ")
  },
}
