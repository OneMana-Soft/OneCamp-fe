"use client"

/**
 * The board on a call's stage (calls package B): the live board everyone in
 * the call sees, editable as the collaboration server allows this person
 * (the call grant in the one board authoriser: members draw while its
 * presenter lets everyone; guests only once guests may); its presenter's
 * name; and the presenter's bar for exactly who may use it
 * (lib/calls/control's boardControls), which names the guests who drew on it
 * as the collaboration server records them (guestAuthors). A guest's own stage
 * is CallGuestBoardStage. Loaded when a board first goes up, so no call
 * route's first load carries the canvas.
 */

import * as React from "react"
import type * as Y from "yjs"
import BoardCanvas from "@/components/board/boardCanvas"
import { CanvasPending } from "@/components/guest/canvasPending"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useCollaborationProvider } from "@/hooks/useCollaborationProvider"
import { useFetchOnlyOnce } from "@/hooks/useFetch"
import { ChevronDown, Pencil, Undo2 } from "@/lib/icons"
import type { BoardControls } from "@/lib/calls/control"
import { displayNameOf } from "@/lib/personName"
import { generateColorFromUUID } from "@/lib/utils/generateColorFromUUID"
import { GetEndpointUrl } from "@/services/endPoints"
import type { UserProfileInterface } from "@/types/user"
import type { CallAct } from "./callHosting"
import { asGuest } from "./callLevels"
import type { CallBoard } from "./callState"
import { STAGE_BOARD_FRAME, boardBarClass, useBoardCompact, useToolRowEdgeFade } from "./boardFrame"
import { CALL_SURFACE, STAGE_OVERLAY } from "./callSurface"

/** Who changed an element last, when a call's guest did: the collaboration server's record. */
interface GuestAuthor {
  id: string
  name: string
  at: number
}

/** How many guests the menu names before it counts the rest. */
const NAMED_GUESTS = 3

/** "Lee (guest) and Priya (guest)": the guests who drew, most recent first, each once, the rest counted. Pure. */
function guestsWhoDrew(authors: Iterable<GuestAuthor>): string {
  const latest = new Map<string, GuestAuthor>()
  for (const a of authors) if ((latest.get(a.id)?.at ?? -1) < a.at) latest.set(a.id, a)
  const names = [...latest.values()].sort((a, b) => b.at - a.at).map((a) => asGuest(a.id, a.name))
  if (names.length > NAMED_GUESTS) return `${names.slice(0, NAMED_GUESTS).join(", ")} and ${names.length - NAMED_GUESTS} more`
  return names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names.at(-1)}` : (names[0] ?? "")
}

/** The guests who drew on the board, as its document records them, kept current. */
function useGuestsWhoDrew(doc: Y.Doc | undefined): string {
  const [who, setWho] = React.useState("")
  React.useEffect(() => {
    if (!doc) return
    const authors = doc.getMap<GuestAuthor>("guestAuthors")
    const read = () => setWho(guestsWhoDrew(authors.values()))
    read()
    authors.observe(read)
    return () => authors.unobserve(read)
  }, [doc])
  return who
}

export default function CallBoardStage({
  board,
  presenter,
  controls,
  guestsInCall,
  act,
}: {
  board: CallBoard
  /** The presenter's name, as the call shows it. */
  presenter: string
  controls: BoardControls
  /** Whether anyone in the call is a guest: only then are guests' switch and undo offered. */
  guestsInCall: boolean
  act: CallAct
}) {
  const me = useFetchOnlyOnce<UserProfileInterface>(GetEndpointUrl.SelfProfile).data?.data
  const name = displayNameOf(me) || "Anonymous"
  const collaboration = React.useMemo(
    () =>
      me
        ? { enabled: true, documentId: `board:${board.uuid}`, username: name, userId: me.user_uuid, color: generateColorFromUUID(me.user_uuid), profileKey: me.user_profile_object_key }
        : undefined,
    [board.uuid, me, name],
  )
  const { provider, synced, readOnly, openError } = useCollaborationProvider(collaboration)
  const drewHere = useGuestsWhoDrew(provider?.document)
  // As on a phone (the canvas's own rule), its tools take the board's top
  // row, so the pills get a row of their own above it.
  const frameRef = React.useRef<HTMLDivElement>(null)
  const compact = useBoardCompact(frameRef)
  // A phone's tool row scrolls inside the frame, and fades as every strip does.
  useToolRowEdgeFade(frameRef)

  const canvas = openError ? (
    <div className="grid h-full place-items-center p-6 text-center">
      <div className="flex max-w-[36ch] flex-col gap-1">
        <p className="text-ui font-medium text-ink">This board can&apos;t be opened</p>
        <p className="text-meta text-ink-3">It may have been deleted, or it has left the call&apos;s stage.</p>
      </div>
    </div>
    ) : provider && me ? (
    <BoardCanvas
      provider={provider}
      boardId={board.uuid}
      synced={synced}
      editable={!readOnly}
      user={{ id: me.user_uuid, name, profileKey: me.user_profile_object_key }}
      // The call's stage is dark whatever the app's theme: one theme for the
      // board's chrome too, or its light islands took the call's light ink.
      theme="dark"
    />
    ) : (
    <CanvasPending />
    )

  return (
    <div
      ref={frameRef}
      className={STAGE_BOARD_FRAME}
      data-call-board={board.uuid}
      data-board-view-only={readOnly ? "" : undefined}
    >
      <div className={boardBarClass(compact, "justify-between")} data-board-bar={compact ? "row" : "overlay"}>
        <span className={`${STAGE_OVERLAY} truncate px-2 py-1 text-ui-sm font-medium`} data-board-presenter="">
          {presenter}&apos;s board
        </span>
        {controls.run || controls.stop ? (
          <div role="toolbar" aria-label="Board controls" className="pointer-events-auto flex shrink-0 items-center gap-1.5">
            {controls.run ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button type="button" className={`${STAGE_OVERLAY} flex h-8 items-center gap-1.5 px-2.5 text-ui-sm focus-visible:outline-2 focus-visible:outline-brand [&_svg]:size-4`}>
                    <Pencil aria-hidden />
                    Who can draw
                    <ChevronDown aria-hidden />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className={`${CALL_SURFACE} w-64`}>
                  <DropdownMenuCheckboxItem checked={board.draw === "everyone"} onCheckedChange={(on) => void act("board_draw", { draw: on ? "everyone" : "presenter" })}>
                    Teammates can draw
                  </DropdownMenuCheckboxItem>
                  {guestsInCall || drewHere ? (
                    <>
                      <DropdownMenuCheckboxItem checked={board.guests} onCheckedChange={(on) => void act("board_guests", { on })}>
                        Guests can draw
                      </DropdownMenuCheckboxItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuLabel className="text-meta font-normal text-ink-3">
                        {drewHere ? `${drewHere} drew on it` : "No guest has drawn on it yet"}
                      </DropdownMenuLabel>
                      <DropdownMenuItem disabled={!drewHere} onSelect={() => void act("undo_guests")}>
                        <Undo2 aria-hidden />
                        Undo guests&apos; drawing
                      </DropdownMenuItem>
                    </>
                  ) : null}
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}
            {controls.stop ? (
              <Button size="sm" onClick={() => void act("stop_board")}>
                {controls.mine ? "Stop presenting" : "Take the board down"}
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
      <div className="relative min-h-0 flex-1">{canvas}</div>
    </div>
  )
}
