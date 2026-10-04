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

/** A point on the page (a click), in the scene. */
export function clientToScene(v: BoardView, clientX: number, clientY: number) {
  return { x: (clientX - v.offsetLeft) / v.zoom - v.scrollX, y: (clientY - v.offsetTop) / v.zoom - v.scrollY }
}

/** The scene point in the middle of what this view shows. */
export function viewCentre(v: Pick<BoardView, "scrollX" | "scrollY" | "zoom" | "width" | "height">) {
  return { x: -v.scrollX + v.width / 2 / v.zoom, y: -v.scrollY + v.height / 2 / v.zoom }
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
