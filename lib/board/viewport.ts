/**
 * Where the board is looking, and moving between scene and screen. Excalidraw
 * draws a scene point at (sceneX + scrollX) * zoom from the canvas's corner;
 * these are that formula and its inverse, so overlays (comment pins, vote
 * dots) and follow-the-presenter share one copy. Pure.
 */

export interface BoardView {
  scrollX: number
  scrollY: number
  zoom: number
  /** The canvas's size on screen, in CSS pixels. */
  width: number
  height: number
  /** Where the canvas sits on the page. */
  offsetLeft: number
  offsetTop: number
}

/** A scene point, relative to the canvas's top-left corner. */
export function sceneToLocal(v: BoardView, sceneX: number, sceneY: number) {
  return { left: (sceneX + v.scrollX) * v.zoom, top: (sceneY + v.scrollY) * v.zoom }
}

/** Whether any of a box on the canvas (its corners as sceneToLocal gives them) is in view. */
export function boxInView(v: Pick<BoardView, "width" | "height">, left: number, top: number, right: number, bottom: number) {
  return right >= 0 && bottom >= 0 && left <= v.width && top <= v.height
}

/** A point on the page (a click), in the scene. */
export function clientToScene(v: BoardView, clientX: number, clientY: number) {
  return { x: (clientX - v.offsetLeft) / v.zoom - v.scrollX, y: (clientY - v.offsetTop) / v.zoom - v.scrollY }
}

/** The scene point in the middle of what this view shows. */
export function viewCentre(v: Pick<BoardView, "scrollX" | "scrollY" | "zoom" | "width" | "height">) {
  return { x: -v.scrollX + v.width / 2 / v.zoom, y: -v.scrollY + v.height / 2 / v.zoom }
}

/**
 * What of the board its own panel leaves in view: on a phone the upper half, as
 * the board's panels open there as half sheets over the lower half
 * (boardSidePanel's "half" detent); on a computer, where they float at the
 * side, all of it. Add from OneCamp lays a card in its middle, and Find on board
 * goes to a match there.
 */
export function viewAboveSheet<V extends { height: number }>(v: V, sheet: boolean): V {
  return sheet ? { ...v, height: v.height / 2 } : v
}

/**
 * The scroll and zoom that show what a presenter sees, on a canvas of another
 * size: the same middle point, and a zoom that fits the presenter's width or
 * height, whichever is tighter, so nothing they show falls off a small screen.
 */
export function followView(
  presenter: Pick<BoardView, "scrollX" | "scrollY" | "zoom" | "width" | "height">,
  mine: { width: number; height: number },
) {
  const c = viewCentre(presenter)
  const fit = Math.min(mine.width / (presenter.width / presenter.zoom), mine.height / (presenter.height / presenter.zoom))
  const zoom = Math.min(30, Math.max(0.1, Number.isFinite(fit) && fit > 0 ? fit : presenter.zoom))
  return { scrollX: mine.width / 2 / zoom - c.x, scrollY: mine.height / 2 / zoom - c.y, zoom }
}

/**
 * The camera that makes this screen (`now`) show `view`, fitted to it (followView), in the shape Excalidraw's
 * updateScene takes; null when the screen shows it already, within half a pixel and a thousandth of zoom, so
 * nothing is set. Following a presenter, a held follower's way back and a bring all move the board by it.
 */
export function followScene(
  view: Pick<BoardView, "scrollX" | "scrollY" | "zoom" | "width" | "height">,
  now: Pick<BoardView, "scrollX" | "scrollY" | "zoom" | "width" | "height">,
) {
  const f = followView(view, now)
  if (Math.abs(f.scrollX - now.scrollX) < 0.5 && Math.abs(f.scrollY - now.scrollY) < 0.5 && Math.abs(f.zoom - now.zoom) < 0.001) return null
  // Excalidraw brands its zoom (NormalizedZoomValue); followView keeps it within the 0.1 to 30 it allows.
  return { scrollX: f.scrollX, scrollY: f.scrollY, zoom: { value: f.zoom as never } }
}
