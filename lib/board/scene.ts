/**
 * Facts about an Excalidraw scene that the board's sync and its bars need,
 * kept pure so they can be tested without a canvas.
 */

interface Versioned {
  version?: number
  versionNonce?: number
}

/**
 * A cheap fingerprint of a scene's elements: how many, and their versions.
 * Excalidraw bumps an element's version (and draws a new nonce) on every
 * change to it, deletion included, and calls onChange for camera moves too,
 * once a frame while someone pans. Comparing fingerprints tells a pan (same
 * fingerprint: nothing to send) from an edit, without walking the shared
 * document for every element on every frame.
 */
export function sceneSignature(elements: readonly Versioned[]): string {
  let versions = 0
  let nonces = 0
  for (const el of elements) {
    versions += el.version ?? 0
    nonces = (nonces + (el.versionNonce ?? 0)) | 0
  }
  return `${elements.length}:${versions}:${nonces}`
}

/**
 * Calls onReady once the scene has finished loading, checking once a frame.
 * Returns a function that stops waiting.
 *
 * WHY. Excalidraw loads its own scene asynchronously after it mounts (its
 * initialData), and when that finishes it replaces every element with what it
 * loaded: for a board, nothing. A board whose drawing arrived from the
 * collaboration server before that moment was painted and then wiped, and
 * opened blank, with the "Start from a template" card over a board that had
 * a drawing. Anything put on the scene has to wait for this.
 */
export function whenSceneReady(
  isLoading: () => boolean,
  onReady: () => void,
  frame: (cb: () => void) => number = (cb) => requestAnimationFrame(cb),
  cancel: (id: number) => void = (id) => cancelAnimationFrame(id),
): () => void {
  let id = 0
  let stopped = false
  const check = () => {
    if (stopped) return
    if (!isLoading()) {
      stopped = true
      onReady()
      return
    }
    id = frame(check)
  }
  check()
  return () => {
    stopped = true
    if (id) cancel(id)
  }
}

/** Below this many lookups a reader walks the scene; at it or above, it uses the scene's index. */
const FEW = 8
const sceneIndexes = new WeakMap<readonly object[], Map<string, number>>()

export interface SceneFinder<T> {
  /** An element's place in the scene, -1 when it isn't there. */
  at(id: string): number
  get(id: string): T | undefined
  /** The scene's index, when the finder uses one. */
  index?: Map<string, number>
}

/**
 * Finds elements by id in a scene array: by a walk when a reader looks for
 * a few, else through one index of where each element sits, built once per
 * array. Excalidraw hands the same array until the scene changes, so every
 * reader of one change (the selection, the notes bar) shares that index.
 */
export function sceneFinder<T extends { id: string }>(elements: readonly T[], expected: number): SceneFinder<T> {
  if (expected < FEW) {
    const at = (id: string) => elements.findIndex((el) => el.id === id)
    return { at, get: (id) => elements[at(id)] }
  }
  let index = sceneIndexes.get(elements)
  if (!index) {
    index = new Map()
    for (let i = 0; i < elements.length; i++) index.set(elements[i].id, i)
    sceneIndexes.set(elements, index)
  }
  const map = index
  const at = (id: string) => map.get(id) ?? -1
  return { at, get: (id) => elements[at(id)], index: map }
}

/**
 * Whether the person moves elements by hand right now, by Excalidraw's own
 * marks: a drag, a resize or a turn. Excalidraw marks a drag on its first
 * movement (its threshold is for arrows), so a reader that must let a click
 * pass measures the pointer's travel too (the board's drag signal). Pure.
 */
export function movingByHand(appState: unknown): boolean {
  const s = appState as { selectedElementsAreBeingDragged?: boolean; isResizing?: boolean; isRotating?: boolean } | null | undefined
  return !!(s?.selectedElementsAreBeingDragged || s?.isResizing || s?.isRotating)
}

/**
 * The live elements a selection names, in the scene's order. With nothing
 * selected, as on most changes, the scene isn't read at all. Pure.
 */
export function selectedIn<T extends { id: string; isDeleted?: boolean }>(elements: readonly T[], ids: readonly string[]): T[] {
  if (ids.length === 0) return []
  const find = sceneFinder(elements, ids.length)
  const places: number[] = []
  for (const id of new Set(ids)) {
    const i = find.at(id)
    if (i >= 0 && !elements[i].isDeleted) places.push(i)
  }
  return places.sort((a, b) => a - b).map((i) => elements[i])
}

export interface Box {
  x: number
  y: number
  width: number
  height: number
}

type Drawn = { x: number; y: number; width: number; height: number; isDeleted?: boolean; points?: readonly (readonly [number, number])[] }

/**
 * The box round some drawn elements, in the board's coordinates: a line's or
 * an arrow's own points count, as they can run left of or above where it
 * starts, and deleted ones don't. Null when there are none. The one box rule:
 * the board's map (all of it), the notes bar (a selection) and a paste
 * (what's pasted). Pure.
 */
export function drawnBox(elements: readonly Drawn[]): Box | null {
  let x0 = Infinity
  let y0 = Infinity
  let x1 = -Infinity
  let y1 = -Infinity
  for (const el of elements) {
    if (el.isDeleted) continue
    if (el.points && el.points.length > 0) {
      for (const [px, py] of el.points) {
        x0 = Math.min(x0, el.x + px)
        y0 = Math.min(y0, el.y + py)
        x1 = Math.max(x1, el.x + px)
        y1 = Math.max(y1, el.y + py)
      }
    } else {
      x0 = Math.min(x0, el.x)
      y0 = Math.min(y0, el.y)
      x1 = Math.max(x1, el.x + el.width)
      y1 = Math.max(y1, el.y + el.height)
    }
  }
  return Number.isFinite(x0) ? { x: x0, y: y0, width: x1 - x0, height: y1 - y0 } : null
}
