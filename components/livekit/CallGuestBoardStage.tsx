"use client"

/**
 * The board on a call's stage, for a call's guest (calls package B): opened
 * with the guest's own call token (POST /guest/calls/board-token), never a
 * member's session, and asked again on every connect, so it opens nothing
 * once the board leaves the stage, the guest leaves or the call ends. The
 * guest draws while its presenter lets everyone draw and "Guests can draw" is
 * on; the collaboration server has the last word, and names their strokes
 * "Name (guest)". Its pictures come through the board's token. Loaded when a
 * board first goes up, so no call route's first load carries the canvas.
 */

import * as React from "react"
import { GuestBoardViewer } from "@/components/guest/GuestBoardViewer"
import { publicCall } from "@/services/publicApi"
import { asGuest } from "./callLevels"
import type { CallBoard } from "./callState"
import { STAGE_BOARD_FRAME, boardBarClass, useBoardCompact, useToolRowEdgeFade } from "./boardFrame"
import { STAGE_OVERLAY } from "./callSurface"

/** What the server answers a guest's ask for the board on their call's stage. */
interface BoardToken {
  collab_token: string
  document_name: string
  board: string
}

export default function CallGuestBoardStage({
  board,
  presenter,
  callToken,
  me,
}: {
  board: CallBoard
  /** The presenter's name, as the call shows it. */
  presenter: string
  /** The call token the guest joined with. */
  callToken: string
  /** The guest, as the call knows them: their identity and LiveKit name. */
  me: { identity: string; name: string }
}) {
  // The board's token, which also lets the guest's pictures load; refreshed on every connect.
  const [token, setToken] = React.useState("")
  const tokenFetcher = React.useCallback(async () => {
    const res = await publicCall<BoardToken>("/guest/calls/board-token", { method: "POST", headers: { Authorization: `Bearer ${callToken}` } })
    if (!res.ok) throw new Error(res.msg)
    setToken(res.data.collab_token)
    return res.data.collab_token
  }, [callToken])
  const canDraw = board.draw === "everyone" && board.guests
  // As on a phone (the canvas's own rule), its tools take the board's top
  // row, so the pills get a row of their own above it.
  const frameRef = React.useRef<HTMLDivElement>(null)
  const compact = useBoardCompact(frameRef)
  // A drawing guest's phone tool row scrolls and fades as the member's does (CallBoardStage).
  useToolRowEdgeFade(frameRef)

  return (
    <div ref={frameRef} className={STAGE_BOARD_FRAME} data-call-board={board.uuid} data-board-view-only={canDraw ? undefined : ""}>
      <div className={boardBarClass(compact)} data-board-bar={compact ? "row" : "overlay"}>
        <span className={`${STAGE_OVERLAY} truncate px-2 py-1 text-ui-sm font-medium`} data-board-presenter="">
          {presenter}&apos;s board
        </span>
        {canDraw ? <span className={`${STAGE_OVERLAY} shrink-0 px-2 py-1 text-ui-sm`}>You can draw</span> : null}
      </div>
      <div className="relative min-h-0 flex-1">
        <GuestBoardViewer
          documentName={`board:${board.uuid}`}
          boardId={board.uuid}
          token={token}
          tokenFetcher={tokenFetcher}
          canDraw={canDraw}
          user={{ id: me.identity, name: asGuest(me.identity, me.name) }}
          // The call's stage is dark: one theme for the board's chrome too.
          theme="dark"
        />
      </div>
    </div>
  )
}
