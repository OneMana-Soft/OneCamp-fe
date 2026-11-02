/**
 * A veil over a board: everything on it fades back behind the veil but the
 * elements it keeps, on this screen only, and nothing is written to the
 * drawing. The tag filter keeps the notes with its tags (miro-07 5); Find
 * keeps its matches while it dims the rest (V-271). These are the veil's
 * holes, pure so they are tested; components/board/boardVeil draws them.
 */
import { sceneToLocal, type BoardView } from "@/lib/board/viewport"

/** What a veil reads of an element. Excalidraw turns an element about its middle; a line's or an arrow's x and y are its first point. */
export interface VeilElement {
  type: string
  x: number
  y: number
  width: number
  height: number
  angle?: unknown
  points?: readonly (readonly number[])[]
}

/** How far the clear space runs past a kept element's edge, in screen pixels, so it reads whole against the veil. */
export const VEIL_MARGIN = 6

/** An element's box on the board: its own, or a line's or an arrow's, its points'. Pure. */
export function veilBox(el: VeilElement): { x: number; y: number; width: number; height: number } {
  if (!el.points?.length) return { x: el.x, y: el.y, width: el.width, height: el.height }
  const xs = el.points.map((p) => p[0])
  const ys = el.points.map((p) => p[1])
  const left = Math.min(...xs)
  const top = Math.min(...ys)
  return { x: el.x + left, y: el.y + top, width: Math.max(...xs) - left, height: Math.max(...ys) - top }
}

/**
 * The veil's holes: an outline for each element it keeps, turned as the
 * element is, in canvas pixels from the board's view, a little past its
 * edges. `above` is what of an element shows above its box on the page,
 * whatever the zoom (a frame's name), so its hole runs up over that too.
 * Each is its own shape, drawn black in the veil's mask, so two kept
 * elements that overlap stay clear where they meet (one path filled even-odd
 * painted the overlap again). Pure.
 */
export function veilHoles(
  view: Pick<BoardView, "scrollX" | "scrollY" | "zoom" | "width" | "height">,
  kept: readonly VeilElement[],
  margin = VEIL_MARGIN,
  above: (el: VeilElement) => number = () => 0,
): string[] {
  const round = (n: number) => Math.round(n * 10) / 10
  const parts: string[] = []
  for (const el of kept) {
    const box = veilBox(el)
    const cx = box.x + box.width / 2
    const cy = box.y + box.height / 2
    const pad = margin / view.zoom
    const hw = box.width / 2 + pad
    const hh = box.height / 2 + pad
    const up = hh + above(el) / view.zoom
    const angle = typeof el.angle === "number" ? el.angle : 0
    const cos = Math.cos(angle)
    const sin = Math.sin(angle)
    const corners = [
      [-hw, -up],
      [hw, -up],
      [hw, hh],
      [-hw, hh],
    ].map(([dx, dy]) => sceneToLocal(view as BoardView, cx + dx * cos - dy * sin, cy + dx * sin + dy * cos))
    parts.push(`M${corners.map((c) => `${round(c.left)} ${round(c.top)}`).join("L")}Z`)
  }
  return parts
}
