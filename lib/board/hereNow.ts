/**
 * "Here now" on a board (miro-04 4): Jump to and Follow go to a person's tab,
 * never their name (N50), as a doc's do. A board's tabs share their name and
 * pointer on the collaboration's awareness (components/board/boardPresence):
 * a pointer is in the board's own coordinates. Who is here is grouped by the
 * doc's own rules (components/docEditor/presence/people); these are the
 * board's rules for where to look, pure so they are tested.
 * components/board/boardHereNow uses them.
 */
import type { DocCommandBus } from "@/components/docEditor/registry/types"

/** A board's own bus for its presence stack: no commands, only the key its list and the board share. Pure. */
export function boardBusOf(boardId: string): DocCommandBus {
  const key = `board:${boardId}`
  return { docId: key, key, emit() {}, on: () => () => {} }
}

/** Where a tab is pointing on the board, or null when it hasn't pointed at it. Pure. */
export function pointerOf(states: ReadonlyMap<number, unknown>, client: number): { x: number; y: number } | null {
  const p = (states.get(client) as { pointer?: { x: number; y: number } | null } | undefined)?.pointer
  return p && Number.isFinite(p.x) && Number.isFinite(p.y) ? { x: p.x, y: p.y } : null
}

/**
 * The scroll that puts a board point in the middle of the canvas, at the
 * zoom it's at: Excalidraw draws a point at (x + scrollX) * zoom. Pure.
 */
export function centreOn(view: { width: number; height: number; zoom: number }, point: { x: number; y: number }): { scrollX: number; scrollY: number } {
  return { scrollX: view.width / (2 * view.zoom) - point.x, scrollY: view.height / (2 * view.zoom) - point.y }
}
