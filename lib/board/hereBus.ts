/**
 * A board's own bus for its presence stack (miro-04 4), in a leaf of its own: the board's page names its stack's key
 * with it, and so loads none of Here now's rules (lib/board/hereNow), which come with Here now itself.
 */
import type { DocCommandBus } from "@/components/docEditor/registry/types"

/** A board's own bus for its presence stack: no commands, only the key its list and the board share. Pure. */
export function boardBusOf(boardId: string): DocCommandBus {
  const key = `board:${boardId}`
  return { docId: key, key, emit() {}, on: () => () => {} }
}
