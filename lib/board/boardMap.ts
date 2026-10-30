/**
 * A small map of the board (miro-04 3): everything drawn, shrunk to fit a
 * small card, with the part this screen shows marked on it, so a big board
 * can be crossed in one press. These are its rules, pure so they are tested;
 * components/board/boardMap draws them.
 */
import type { Box } from "./scene"

/** The part of the board a screen shows: Excalidraw draws a point at (x + scrollX) * zoom. Pure. */
export function shownBox(view: { scrollX: number; scrollY: number; zoom: number; width: number; height: number }): Box {
  return { x: -view.scrollX, y: -view.scrollY, width: view.width / view.zoom, height: view.height / view.zoom }
}

/** How the board sits on the map: a board point (x, y) is at (ox + x * scale, oy + y * scale). */
export interface MapFrame {
  scale: number
  ox: number
  oy: number
}

/**
 * The map's frame: the drawing and the part shown, both whole, as large as
 * fits a `w` by `h` map less `pad` all round, in its middle. Pure.
 */
export function mapFrame(drawn: Box | null, shown: Box, w: number, h: number, pad = 8): MapFrame {
  const x0 = Math.min(shown.x, drawn?.x ?? shown.x)
  const y0 = Math.min(shown.y, drawn?.y ?? shown.y)
  const x1 = Math.max(shown.x + shown.width, drawn ? drawn.x + drawn.width : -Infinity)
  const y1 = Math.max(shown.y + shown.height, drawn ? drawn.y + drawn.height : -Infinity)
  const bw = Math.max(x1 - x0, 1)
  const bh = Math.max(y1 - y0, 1)
  const scale = Math.min((w - 2 * pad) / bw, (h - 2 * pad) / bh)
  return { scale, ox: (w - bw * scale) / 2 - x0 * scale, oy: (h - bh * scale) / 2 - y0 * scale }
}

/** A board point on the map. Pure. */
export const toMap = (f: MapFrame, x: number, y: number) => ({ x: f.ox + x * f.scale, y: f.oy + y * f.scale })

/** A map point on the board. Pure. */
export const fromMap = (f: MapFrame, mx: number, my: number) => ({ x: (mx - f.ox) / f.scale, y: (my - f.oy) / f.scale })
