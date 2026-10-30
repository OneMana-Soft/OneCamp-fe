// Counting React renders in a test, as scripts/fluidity/lib.mjs counts them
// in a browser (fluid-06's budgets): through the hook React DevTools uses, a
// component that did work in a commit (PerformedWork) counts once; a subtree
// React skipped is not walked. Import this module before anything that loads
// react-dom, so React finds the hook when it starts.

type Fiber = {
  tag: number
  flags: number
  type: unknown
  child: Fiber | null
  sibling: Fiber | null
  alternate: Fiber | null
}

/** Function, class, forwardRef, memo and simple memo components: what the harness counts. */
const COMPONENT = new Set([0, 1, 11, 14, 15])

const nameOf = (t: unknown): string => {
  if (!t) return "?"
  if (typeof t === "string") return t
  const f = t as { displayName?: string; name?: string; render?: { displayName?: string; name?: string }; type?: unknown }
  return f.displayName || f.name || f.render?.displayName || f.render?.name || (f.type ? nameOf(f.type) : "anonymous")
}

const counts = new Map<string, number>()
let total = 0

function tally(f: Fiber) {
  total++
  const n = nameOf(f.type)
  counts.set(n, (counts.get(n) ?? 0) + 1)
}
function mount(f: Fiber) {
  if (COMPONENT.has(f.tag)) tally(f)
  for (let c = f.child; c; c = c.sibling) mount(c)
}
function update(next: Fiber, prev: Fiber) {
  if (COMPONENT.has(next.tag) && (next.flags & 1) === 1) tally(next)
  if (next.child === prev.child) return
  for (let c = next.child; c; c = c.sibling) {
    if (c.alternate) update(c, c.alternate)
    else mount(c)
  }
}

const g = globalThis as unknown as { __REACT_DEVTOOLS_GLOBAL_HOOK__?: unknown }
if (!g.__REACT_DEVTOOLS_GLOBAL_HOOK__) {
  const renderers = new Map<number, unknown>()
  g.__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
    renderers,
    supportsFiber: true,
    isDisabled: false,
    inject(renderer: unknown) {
      const id = renderers.size + 1
      renderers.set(id, renderer)
      return id
    },
    checkDCE() {},
    onScheduleFiberRoot() {},
    onCommitFiberUnmount() {},
    onPostCommitFiberRoot() {},
    onCommitFiberRoot(_id: number, root: { current: Fiber }) {
      const next = root.current
      if (next.alternate) update(next, next.alternate)
      else mount(next)
    },
  }
}

/** Starts counting from zero. */
export function resetRenders() {
  counts.clear()
  total = 0
}

/** Renders since the last reset: all of them, and by component name. */
export function renders(): { total: number; of: (name: string) => number; top: (n?: number) => Array<[string, number]> } {
  const snapshot = new Map(counts)
  return {
    total,
    // A memo's inner function may carry the bundler's suffix ("TreeRow2").
    of: (name) => [...snapshot.entries()].reduce((n, [k, v]) => (k === name || new RegExp(`^${name}\\d+$`).test(k) ? n + v : n), 0),
    top: (n = 12) => [...snapshot.entries()].sort((a, b) => b[1] - a[1]).slice(0, n),
  }
}
