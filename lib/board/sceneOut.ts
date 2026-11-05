// The board as it may leave this tab (miro-25). Every path but the frame's own sync that sends a board's words
// anywhere (AI's clustering, a saved template, Make tasks) reads the scene here, never raw: while private mode
// runs, each note its author holds goes veiled (privateNotesHost's `outward`), and while a round runs and that
// code is still coming, nothing goes. Its callers load it as they send, so it is never on a board's first load
// (lib/board/sceneOut.test.ts guards every board file that reads the scene and sends).

import { privateViews } from "@/lib/board/privateMode"

type SceneReader = { getSceneElements(): readonly unknown[] }
type Outward = { outward<T>(scene: readonly T[]): T[] }

/** The scene as it may leave this tab now; null while a round runs and private mode's code is still coming. */
export function outwardNow<T>(api: SceneReader): T[] | null {
  const view = privateViews.get(api)
  if (view?.holds()) return null
  const scene = api.getSceneElements() as readonly T[]
  const handle = view?.handle.current as Outward | null | undefined
  return handle ? handle.outward(scene) : [...scene]
}

/** outwardNow, once private mode's code is in: it waits up to `waitMs`, then throws, and nothing is sent. */
export async function outwardScene<T>(api: SceneReader, waitMs = 10_000): Promise<T[]> {
  for (const start = Date.now(); ; ) {
    const scene = outwardNow<T>(api)
    if (scene) return scene
    if (Date.now() - start >= waitMs) throw new Error("Private mode's code didn't come, so the board stays in this tab")
    await new Promise((r) => setTimeout(r, 100))
  }
}

type Words = { id: string; type: string; text?: string; isDeleted?: boolean }

/** Each text's words, once, up to `max`, as they may leave this tab: a note's are its bound text. AI's clustering. */
export async function outwardTexts(api: SceneReader, max: number): Promise<{ id: string; text: string }[]> {
  const items: { id: string; text: string }[] = []
  const seen = new Set<string>()
  for (const e of await outwardScene<Words>(api)) {
    if (e.isDeleted || e.type !== "text") continue
    const text = (e.text || "").trim()
    if (!text || seen.has(e.id)) continue
    seen.add(e.id)
    items.push({ id: e.id, text })
    if (items.length >= max) break
  }
  return items
}
