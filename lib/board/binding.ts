/**
 * The board's one binding to its shared document, for the member's canvas
 * and the guest's view. Excalidraw folds a change left out of history into
 * the person's next step, so an undo took back teammates' work (e2e/
 * boardUndo.spec.ts): the document's copies go on with NEVER.
 */

import type { SceneData } from "@excalidraw/excalidraw/types"

/** Excalidraw's CaptureUpdateAction (its import loads the library); pinned by the test. */
export const CAPTURE = {
  IMMEDIATELY: "IMMEDIATELY",
  NEVER: "NEVER",
} as const satisfies Record<string, NonNullable<SceneData["captureUpdate"]>>

export interface BoardElement {
  id: string
  version?: number
  versionNonce?: number
  isDeleted?: boolean
}

/** A deep copy: Excalidraw mutates elements in place, so one shared with Yjs would alias it. */
export function cloneElement<T>(el: T): T {
  try {
    return structuredClone(el)
  } catch {
    return JSON.parse(JSON.stringify(el)) as T
  }
}

/**
 * The scene with the document's copies taken: newer or tied versions
 * replace the scene's (copied), new ones are added, and one the scene shows
 * already (same version, nonce and deletion) is left as it is. `adopted` 0
 * means nothing to put on the canvas. Pure.
 */
export function mergeShared<T extends BoardElement>(scene: readonly T[], shared: Iterable<T>): { elements: T[]; adopted: number } {
  const merged = new Map<string, T>()
  for (const el of scene) merged.set(el.id, el)
  let adopted = 0
  for (const remote of shared) {
    const cur = merged.get(remote.id)
    if (cur) {
      const cv = cur.version ?? 0
      const rv = remote.version ?? 0
      if (cv > rv || (cv === rv && cur.versionNonce === remote.versionNonce && !cur.isDeleted === !remote.isDeleted)) continue
    }
    merged.set(remote.id, cloneElement(remote))
    adopted++
  }
  return { elements: Array.from(merged.values()), adopted }
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
