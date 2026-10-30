/**
 * The board's one binding to its shared document, for the member's canvas
 * and the guest's view, both ways: the document's copies onto the scene, and
 * the scene's changes into the document. Excalidraw folds a change left out
 * of history into the person's next step, so an undo took back teammates'
 * work (e2e/boardUndo.spec.ts): the document's copies go on with NEVER.
 */

import type { SceneData } from "@excalidraw/excalidraw/types"

/** Excalidraw's CaptureUpdateAction (its import loads the library); pinned by the test. */
export const CAPTURE = {
  IMMEDIATELY: "IMMEDIATELY",
  NEVER: "NEVER",
  /** Joins the person's next undo step (Excalidraw takes it with the next IMMEDIATELY): a change that follows theirs. */
  EVENTUALLY: "EVENTUALLY",
} as const satisfies Record<string, NonNullable<SceneData["captureUpdate"]>>

/** The origin of this tab's own writes to the document, so its observers skip their echo. */
export const LOCAL_ORIGIN = "board-local"

export interface BoardElement {
  id: string
  version?: number
  versionNonce?: number
  isDeleted?: boolean
}

/**
 * A deep copy: Excalidraw mutates elements in place, so one shared with Yjs
 * would alias it. Elements are JSON (what Yjs holds), so a walk of their
 * objects and arrays does it, about five times faster than structuredClone
 * (22 Oct, node, an element of a note's shape: 1.6 against 8.5 µs). It runs
 * for every element a board opens with, and for each one an edit sends.
 */
export function cloneElement<T>(el: T): T {
  if (el === null || typeof el !== "object") return el
  if (Array.isArray(el)) {
    const copy = new Array(el.length)
    for (let i = 0; i < el.length; i++) copy[i] = cloneElement(el[i])
    return copy as T
  }
  const copy: Record<string, unknown> = {}
  for (const k in el) copy[k] = cloneElement((el as Record<string, unknown>)[k])
  return copy as T
}

/**
 * Whether the document's copy replaces the scene's: it is newer, or a tie
 * the document settled another way (another nonce, or a deletion an older
 * client wrote at the same version). A tie goes to the document.
 */
function takes(cur: BoardElement, remote: BoardElement): boolean {
  const cv = cur.version ?? 0
  const rv = remote.version ?? 0
  return !(cv > rv || (cv === rv && cur.versionNonce === remote.versionNonce && !cur.isDeleted === !remote.isDeleted))
}

/** An element's fractional index: where Excalidraw stacks it. */
const indexOf = (el: BoardElement): unknown => (el as { index?: unknown }).index

/** Excalidraw's stacking rule (its orderByFractionalIndex): by index, ties by id. */
function stackOrder(a: BoardElement, b: BoardElement): number {
  const ai = indexOf(a) as string
  const bi = indexOf(b) as string
  if (ai !== bi) return ai < bi ? -1 : 1
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
}

/**
 * The elements in stacking order. Excalidraw takes the array's order as the
 * truth and re-numbers an element whose index disagrees, bumping its version,
 * which the next edit then sends to everyone: a teammate's "send to back"
 * undone, and a board whose writers were several re-stacked by who wrote
 * what. Boards drawn before indices (an element without one) keep their order.
 */
function stacked<T extends BoardElement>(elements: T[]): T[] {
  for (const el of elements) if (typeof indexOf(el) !== "string") return elements
  for (let i = 1; i < elements.length; i++) if (stackOrder(elements[i - 1], elements[i]) > 0) return elements.sort(stackOrder)
  return elements
}

/**
 * The scene with the document's copies taken: newer or tied versions
 * replace the scene's (copied), new ones are added, and one the scene shows
 * already (same version, nonce and deletion) is left as it is, all in
 * stacking order. `adopted` 0 means nothing to put on the canvas. Pure.
 */
export function mergeShared<T extends BoardElement>(scene: readonly T[], shared: Iterable<T>): { elements: T[]; adopted: number } {
  const merged = new Map<string, T>()
  for (const el of scene) merged.set(el.id, el)
  let adopted = 0
  for (const remote of shared) {
    const cur = merged.get(remote.id)
    if (cur && !takes(cur, remote)) continue
    merged.set(remote.id, cloneElement(remote))
    adopted++
  }
  const elements = Array.from(merged.values())
  return { elements: adopted > 0 ? stacked(elements) : elements, adopted }
}

/** Below this many changed ids a merge finds each by a walk; at it or above, by one index of the scene. */
const FIND_BY_WALK = 8

/**
 * The scene with the document's copies of `ids` taken, by mergeShared's rule:
 * a teammate's change arrives as the keys it touched, so only those are read
 * and only those replaced. Every other element stays the very object it was
 * (Excalidraw caches each one's drawing by object). New elements and ones
 * whose index changed go to their place in the stack. Null when nothing is
 * taken. Pure.
 */
export function mergeChanged<T extends BoardElement>(
  scene: readonly T[],
  ids: Iterable<string>,
  read: (id: string) => T | undefined,
): { elements: T[]; adopted: number } | null {
  const wanted = [...new Set(ids)]
  let at: (id: string) => number
  if (wanted.length < FIND_BY_WALK) {
    at = (id) => scene.findIndex((el) => el.id === id)
  } else {
    const pos = new Map<string, number>()
    scene.forEach((el, i) => pos.set(el.id, i))
    at = (id) => pos.get(id) ?? -1
  }
  let next: T[] | null = null
  let restack = false
  let adopted = 0
  for (const id of wanted) {
    const remote = read(id)
    if (!remote || typeof remote !== "object") continue
    const i = at(id)
    const cur = i >= 0 ? scene[i] : undefined
    if (cur && !takes(cur, remote)) continue
    const copy = cloneElement(remote)
    next ??= scene.slice()
    if (cur) {
      if (indexOf(cur) !== indexOf(copy)) restack = true
      next[i] = copy
    } else {
      next.push(copy)
      restack = true
    }
    adopted++
  }
  if (!next) return null
  return { elements: restack ? stacked(next) : next, adopted }
}

export interface SceneApi {
  getSceneElementsIncludingDeleted(): readonly unknown[]
  updateScene(scene: SceneData): void
}

/** Puts the document's elements on the scene, outside undo. Returns how many it took (0: the scene is untouched). */
export function applyShared(api: SceneApi, shared: Iterable<BoardElement>): number {
  const { elements, adopted } = mergeShared(api.getSceneElementsIncludingDeleted() as BoardElement[], shared)
  if (adopted > 0) api.updateScene({ elements: elements as never, captureUpdate: CAPTURE.NEVER })
  return adopted
}

/**
 * The document's elements: Yjs's map of them, or a stand-in. The scene writes
 * into it (storeScene) and follows it (followShared); each asks only for what
 * it uses.
 */
export interface SharedElements {
  get(id: string): BoardElement | undefined
  set(id: string, el: BoardElement): void
  values(): Iterable<BoardElement>
  observe(f: SharedObserver): void
  unobserve(f: SharedObserver): void
}
type SharedObserver = (event: { keysChanged: Set<string> }, transaction: { origin: unknown }) => void

/**
 * Writes the scene's changes into the document, each as a copy (Excalidraw
 * mutates its own in place): a new element, a newer version, a change at the
 * same version (another nonce), and any change of deletion, so an erase and
 * its undo always reach the document. A deleted element the document doesn't
 * have stays out: the server pruned it, or it never synced, and writing it
 * back would grow the document again. Call it inside the document's
 * transaction (LOCAL_ORIGIN). Returns how many it wrote.
 */
export function storeScene(shared: Pick<SharedElements, "get" | "set">, scene: readonly BoardElement[]): number {
  const changed = changedElements(shared, scene)
  for (const el of changed) shared.set(el.id, cloneElement(el))
  return changed.length
}

/**
 * The scene's elements storeScene writes to the document, by its rule, in the scene's order: a frame's changes, so
 * work for a change (a note's maker) goes over them, not over every element on the board. Pure.
 */
export function changedElements<T extends BoardElement>(shared: Pick<SharedElements, "get">, scene: readonly T[]): T[] {
  const changed: T[] = []
  for (const el of scene) {
    const existing = shared.get(el.id)
    const deleted = el.isDeleted ?? false
    if (!existing && deleted) continue
    const ev = existing?.version ?? -1
    const elv = el.version ?? 0
    if (!existing || ev < elv || (ev === elv && existing.versionNonce !== el.versionNonce) || deleted !== (existing.isDeleted ?? false)) changed.push(el)
  }
  return changed
}

export interface FollowOptions {
  /** After the canvas took elements from the document: how many. */
  onMerged?: (adopted: number) => void
  /** The next animation frame, and its cancel (tests pass their own). */
  frame?: (cb: () => void) => number
  cancel?: (id: number) => void
}

/**
 * Follows the document onto the canvas, outside undo: the whole of it now,
 * then each change as the keys it touched (mergeChanged), never the whole
 * document again, and never this tab's own writes (LOCAL_ORIGIN). A change
 * merges at once when none has this frame; changes that come after it in the
 * same frame (a teammate's drag sends one a pointer move) wait for the next
 * frame and merge together, so Excalidraw replaces its scene at most once a
 * frame. Returns stop: a frame still booked then draws nothing.
 */
export function followShared(api: SceneApi, shared: Omit<SharedElements, "set">, opts: FollowOptions = {}): { stop(): void } {
  const frame = opts.frame ?? ((cb: () => void) => requestAnimationFrame(cb))
  const cancel = opts.cancel ?? ((id: number) => cancelAnimationFrame(id))
  let pending = new Set<string>()
  let booked: number | null = null
  let stopped = false
  const flush = () => {
    const ids = pending
    pending = new Set()
    const out = mergeChanged(api.getSceneElementsIncludingDeleted() as BoardElement[], ids, (id) => shared.get(id))
    if (!out) return
    api.updateScene({ elements: out.elements as never, captureUpdate: CAPTURE.NEVER })
    opts.onMerged?.(out.adopted)
  }
  // After a merge the rest of the frame's changes wait for the next one.
  const tick = () => {
    booked = null
    if (stopped || pending.size === 0) return
    flush()
    booked = frame(tick)
  }
  const onChange: SharedObserver = (event, transaction) => {
    if (stopped || transaction.origin === LOCAL_ORIGIN) return
    event.keysChanged.forEach((k) => pending.add(k))
    if (booked !== null) return
    flush()
    booked = frame(tick)
  }
  shared.observe(onChange)
  const first = applyShared(api, shared.values())
  if (first > 0) opts.onMerged?.(first)
  return {
    stop() {
      stopped = true
      shared.unobserve(onChange)
      if (booked !== null) cancel(booked)
      booked = null
      pending.clear()
    },
  }
}

/** How many elements a person sees. Pure. */
export function liveCount(elements: Iterable<BoardElement>): number {
  let n = 0
  for (const el of elements) if (!el.isDeleted) n++
  return n
}

/** A changed copy every screen takes as new: the version is what the binding merges on. */
export function bumped<T extends BoardElement>(el: T, change: Partial<T>): T {
  return { ...el, ...change, version: (el.version ?? 0) + 1, versionNonce: Math.floor(Math.random() * 2 ** 31), updated: Date.now() }
}
