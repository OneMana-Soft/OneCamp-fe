import type { Box } from "@/lib/board/sticky"
import { clientToScene, type BoardView } from "@/lib/board/viewport"
import { CONTAINER, TOOL_ROW, ZOOM_CLUSTER } from "@/components/board/excalidrawPart"

/**
 * What floats over a board's canvas: Excalidraw's islands (its tool row, its zoom cluster, the MobileMenu's footer)
 * and the board's own chrome ([data-board-chrome]: its clusters, bars and side panel). The bar that follows a
 * selection ([data-following-bar]) moves with the selection, so islandsOver never counts it.
 */
export const ISLANDS = [`${CONTAINER} .Island`, TOOL_ROW, ZOOM_CLUSTER, "[data-board-chrome]"].join(", ")

/**
 * Where what floats over a board's canvas is (ISLANDS), as boxes in its scene: where a card laid from a list never
 * goes (components/board/addWorkPanel). What isn't drawn has no box and doesn't count.
 */
export function islandsOver(view: BoardView, root: ParentNode = document): Box[] {
  const out: Box[] = []
  root.querySelectorAll<HTMLElement>(ISLANDS).forEach((el) => {
    if (el.closest("[data-following-bar]")) return
    const r = el.getBoundingClientRect()
    if (!(r.width > 0 && r.height > 0)) return
    // Its corners, read as a click is.
    const a = clientToScene(view, r.left, r.top)
    const b = clientToScene(view, r.right, r.bottom)
    out.push({ x: a.x, y: a.y, width: b.x - a.x, height: b.y - a.y })
  })
  return out
}
