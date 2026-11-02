"use client"

/**
 * A board's signals (components/board/boardSignals, miro-24) as a lazy piece: their reading, toasts and rise layer come
 * in a chunk of their own, drawn on demand (components/board/boardSignalsLater), and hand what Here now's control
 * offers (a reaction, this tab's hand, an editor's lower) back once they are in.
 */
import * as React from "react"
import { useBoardSignals, type Live, type SignalsOpened } from "@/components/board/boardSignals"

/** What the signals give Here now's control (presence/control). */
export type BoardSignalActions = Pick<ReturnType<typeof useBoardSignals>, "react" | "hand" | "lower">

export default function BoardSignalsPiece({
  awareness,
  editable,
  opened,
  onActions,
}: {
  awareness: Live
  editable: boolean
  /** What was there as the board opened, at its first sync: the piece shows what came since (useBoardSignals). */
  opened: SignalsOpened
  onActions: (actions: BoardSignalActions) => void
}) {
  const { react, hand, lower, layer } = useBoardSignals(awareness, editable, opened)
  React.useEffect(() => onActions({ react, hand, lower }), [onActions, react, hand, lower])
  return layer
}
