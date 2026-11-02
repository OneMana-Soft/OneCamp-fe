/**
 * What of the board Find's panel leaves in view, and whether a match's words are
 * all in it. Only the Find panel (components/board/findPanel), which the board
 * loads when Find opens, imports this module, so the board's first load never
 * carries it; lib/board/viewport keeps what every board needs. Pure.
 */
import { isFrame } from "@/lib/board/findOnBoard"
import { viewAboveSheet, type BoardView } from "@/lib/board/viewport"

/** Whether all of a box on the canvas (its corners as sceneToLocal gives them) is in view: where Find leaves a match. */
export function boxAllInView(v: Pick<BoardView, "width" | "height">, left: number, top: number, right: number, bottom: number) {
  return left >= 0 && top >= 0 && right <= v.width && bottom <= v.height
}

/**
 * The room a frame's name takes above the frame on the page, whatever the zoom: Excalidraw 0.18.1 writes the name over
 * its canvas (#<app>-frame-name-<frame id>), its foot 3 px above the frame's top edge (FRAME_STYLE.nameOffsetY), in
 * 14 px words on a 1.25 line, and a little air above it (V-270).
 */
export const FRAME_NAME_ROOM = Math.ceil(3 + 14 * 1.25) + 3

/**
 * What of an element is outside its box, above it, on the page: a frame's name, which is the words Find matches on a
 * frame. Find counts it in, so a match on a frame's name comes into view with its words, not only the frame they name.
 */
export function roomAbove(el: { type: string }): number {
  return isFrame(el) ? FRAME_NAME_ROOM : 0
}

/**
 * What of the board Find's panel leaves in view, given the panel's edge that faces the board, on the page, once it is
 * laid out: on a computer, where the panel floats over the board's right side, the canvas left of its left edge; on a
 * phone the canvas above its sheet's top, wherever the sheet's height puts it (a half sheet is at least 20rem, so more
 * than half of a short screen). Find on board judges whether a match is in view, and lands one, in it.
 *
 * viewAboveSheet's rule stands in before the panel is laid out, and on a phone whose sheet leaves under a quarter of
 * the canvas above it (a short screen, or a phone on its side): there is no room there to show a match worth reading,
 * and fitting a note into the sliver would zoom the board out to its least.
 */
export function viewBesidePanel<V extends BoardView>(v: V, sheet: boolean, edge?: number, below?: number): V {
  if (edge === undefined) return viewAboveSheet(v, sheet)
  if (!sheet) return { ...v, width: Math.max(0, Math.min(v.width, edge - v.offsetLeft)) }
  // On a phone what is open starts under what floats over the board's top (below: the tool row's foot on the page), as
  // a view of its own: its own top on the page, and the scroll that keeps every scene point where it is drawn.
  const top = Math.max(v.offsetTop, below ?? v.offsetTop)
  const open = Math.min(v.offsetTop + v.height, edge) - top
  if (open < v.height / 4) return viewAboveSheet(v, true)
  return { ...v, offsetTop: top, height: open, scrollY: v.scrollY - (top - v.offsetTop) / v.zoom }
}

/**
 * The canvasOffsets that keep Excalidraw's scrollToContent inside an open view of the whole canvas (viewBesidePanel),
 * with `above` kept over the content for what of it is drawn above its box (roomAbove).
 */
export function offsetsOf(whole: BoardView, open: BoardView, above = 0) {
  return {
    top: open.offsetTop - whole.offsetTop + above,
    left: open.offsetLeft - whole.offsetLeft,
    right: whole.offsetLeft + whole.width - (open.offsetLeft + open.width),
    bottom: whole.offsetTop + whole.height - (open.offsetTop + open.height),
  }
}
