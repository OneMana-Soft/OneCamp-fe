"use client"

/**
 * The board's Call button (miro-27, calls with the board), for whoever is signed in on the board, viewers too: a
 * popover on a computer and a sheet with its footer pinned on a phone (components/ui/popover: a phone's overlays are
 * drawers). It reads the board's calls as it opens (lib/calls/boardCall: the server answers only the calls whose
 * conversation its reader may open, never one they were only let into by its invite) and lists them:
 *   - On a call now: a call going on with the board, where, who put it up, and Join, its conversation's own call page
 *     (the call's door decides who may come in);
 *   - Calls with this board: the newest first, when and for how long, where, who showed it, what it kept (the one
 *     list, components/recording/callArtefactList: the recording and transcript open in the one player by
 *     the conversation's own routes, lib/calls/playerUrls, which ask again; its notes; its recap's conversation), and
 *     its chat, where the call's message is.
 * A failed read says so with Try again and never signs anyone out (a 401 is the client's own session rule); offline,
 * it keeps the last answer and says so. Its own chunk, which reaches none of the shared core: the page hands it its
 * client, the one player's opener and what a board no call showed says. It opens with Start a call in...
 * (components/board/boardCallStart): where the board was called before, then the app's one search.
 */

import * as React from "react"
import Link from "next/link"
import type { AxiosInstance } from "axios"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { OverlayBody, OverlayFooter, OverlayHeader, useSheetMode } from "@/components/ui/overlay"
import { Button } from "@/components/ui/button"
import { StatusDot } from "@/components/ui/statusWord"
import { ClusterButton } from "@/components/board/boardChrome"
import { CallArtefacts, type CallToPlay } from "@/components/recording/callArtefactList"
import { HubError } from "@/components/activity/hubEmpty"
import { MessageSquare, Video, WifiOff } from "@/lib/icons"
import { OWN_ERRORS } from "@/lib/http/ownErrors"
import { isAppOffline, subscribeConnectivity } from "@/lib/connectivity"
import { lengthOf, readBoardCalls, whereOf, type BoardCall, type BoardCalls } from "@/lib/calls/boardCall"
import { conversationCallPath } from "@/lib/calls/conversationCallPath"
import { playerUrls } from "@/lib/calls/playerUrls"
import { recordingFileName } from "@/lib/calls/recordingFileName"
import { chatRef, route } from "@/lib/conversation/route"
import { shortDateTime } from "@/lib/utils/date/shortDate"
import { sectionTitle } from "@/lib/ui/fieldRow"
import { BoardCallsGet } from "@/services/endpoints/boards.calls"
import { BoardCallStart } from "@/components/board/boardCallStart"

/** What the one player (components/dialog/RecordingPlayerDialog) opens with, as the recordings lists hand it. */
export interface BoardCallPlayer {
  egressId: string
  mediaGetUrl: string
  transcriptGetUrl: string
  fileSize: number
  fileName: string
  recordedAt: string
}

export interface BoardCallProps {
  board: string
  selfUUID: string
  /** The page's own client: this chunk takes none of the shared core. */
  http: Pick<AxiosInstance, "get" | "post">
  /** Opens the one player. */
  onPlay: (player: BoardCallPlayer) => void
  /** What a board no call showed says: the page's EmptyState (components/board/noBoardCalls), as this chunk takes none. */
  empty: React.ReactNode
  /** The board's editor, who may put it up on the call they start (the call's server checks again); a reader may still start one. */
  hasEditAccess: boolean
}

// "missed": no answer while the app is online, a failed read that leaves a list on screen as it was (lib/http/loadFailure).
type ReadState = "idle" | "loading" | "ready" | "failed" | "missed" | "offline"

const noOffline = () => false

/** The conversation a call belongs to, as a link opens it; null for a DM the reader isn't known in. */
function chatOf(call: BoardCall, selfUUID: string): string | null {
  const ref = call.ref.kind === "dm" ? chatRef(call.ref.id, selfUUID) : { kind: call.ref.kind, id: call.ref.id }
  return ref ? route({ conversation: ref }) : null
}

export default function BoardCall({ board, selfUUID, http, onPlay, empty, hasEditAccess }: BoardCallProps) {
  const [open, setOpen] = React.useState(false)
  const [calls, setCalls] = React.useState<BoardCalls | null>(null)
  const [state, setState] = React.useState<ReadState>("idle")
  const offline = React.useSyncExternalStore(subscribeConnectivity, isAppOffline, noOffline)
  const sheet = useSheetMode()
  const asked = React.useRef(0)

  // Read afresh on every open: who may see a call is the server's, asked each time.
  const read = React.useCallback(() => {
    const n = ++asked.current
    if (isAppOffline()) {
      setState("offline")
      return
    }
    setState("loading")
    http
      .get(`${BoardCallsGet.GetBoardCalls}/${board}`, OWN_ERRORS)
      .then((res) => {
        if (n !== asked.current) return
        setCalls(readBoardCalls(res.data))
        setState("ready")
      })
      .catch((err: { response?: unknown }) => {
        if (n !== asked.current) return
        // Offline is the app's one rule (lib/connectivity): the last list stays, said to be the last. Any refusal drops it.
        if (isAppOffline()) return setState("offline")
        if (err?.response) setCalls(null)
        setState(err?.response ? "failed" : "missed")
      })
  }, [board, http])

  // Back online while it is open on an offline read: read again.
  React.useEffect(() => {
    if (open && !offline && state === "offline") read()
  }, [open, offline, state, read])

  const onOpenChange = (next: boolean) => {
    setOpen(next)
    if (next) read()
  }

  const play = (call: BoardCall, a: CallToPlay) => {
    const urls = playerUrls(call.ref, selfUUID)
    onPlay({ egressId: a.key, mediaGetUrl: urls.media, transcriptGetUrl: a.transcript ? urls.transcript : "", fileSize: 0, fileName: recordingFileName(call.startedAt), recordedAt: call.startedAt })
    setOpen(false)
  }
  const close = () => setOpen(false)

  const body =
    state === "failed" || (state === "missed" && !calls) ? (
      <HubError text="Couldn't load this board's calls." onRetry={read} />
    ) : !calls && (state === "loading" || state === "idle") ? (
      <div aria-busy="true" data-board-calls-loading="" className="flex flex-col gap-2">
        <span className="sr-only">Loading calls…</span>
        {[0, 1, 2].map((i) => (
          <div key={i} aria-hidden="true" className="h-14 animate-pulse rounded-lg bg-sunken" />
        ))}
      </div>
    ) : !calls ? (
      <HubError text="You're offline. This board's calls show once you're back." onRetry={read} />
    ) : (
      <div className="flex flex-col gap-4">
        {offline && (
          <p role="status" data-board-calls-offline="" className="flex items-center gap-2 rounded-lg bg-sunken px-3 py-2 text-xs text-ink-2">
            <WifiOff className="size-3.5 shrink-0" aria-hidden />
            {"You're offline: these are the calls as they were when you last looked."}
          </p>
        )}
        {calls.live.length > 0 && (
          <section aria-label="On a call now" className="flex flex-col gap-2">
            <h3 className={sectionTitle}>On a call now</h3>
            <ul className="flex flex-col gap-2">
              {calls.live.map((call) => {
                const join = conversationCallPath(call.ref, selfUUID)
                return (
                  <li key={call.session} data-board-call-live={call.session} className="flex items-center gap-3 rounded-lg border border-border/60 px-3 py-2.5">
                    <StatusDot tone="success" className="size-2" />
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-sm text-foreground">{whereOf(call.ref)}</span>
                      <span className="truncate text-xs text-muted-foreground">
                        {call.shownBy ? (call.onStage ? `${call.shownBy} put it up` : `${call.shownBy} showed it earlier`) : call.onStage ? "On its stage now" : "Showed it earlier"}
                        {call.people ? ` · ${call.people} ${call.people === 1 ? "person" : "people"}` : ""}
                      </span>
                    </span>
                    {join && (
                      <Button asChild size="sm" variant="secondary">
                        <Link href={join} onClick={close}>
                          Join
                        </Link>
                      </Button>
                    )}
                  </li>
                )
              })}
            </ul>
          </section>
        )}
        {calls.live.length + calls.past.length === 0 ? (
          // The title says Calls: no list heading over it.
          <div data-board-calls-empty="">{empty}</div>
        ) : (
          <section aria-label="Calls with this board" className="flex flex-col gap-2">
            <h3 className={sectionTitle}>Calls with this board</h3>
            {calls.past.length === 0 ? (
              <p data-board-calls-ended-none="" className="text-sm text-muted-foreground">
                No call with this board has ended yet.
              </p>
            ) : (
              <ul className="flex flex-col gap-3">
                {calls.past.map((call) => {
                  const length = lengthOf(call)
                  const chat = chatOf(call, selfUUID)
                  return (
                    <li key={call.session} data-board-call-past={call.session} className="flex flex-col gap-2">
                      <div className="flex items-start gap-2">
                        <span className="flex min-w-0 flex-1 flex-col">
                          <span className="text-sm font-medium text-foreground">{`${shortDateTime(new Date(call.startedAt))}${length ? ` · ${length}` : ""}`}</span>
                          <span className="text-xs text-muted-foreground">{`${whereOf(call.ref)}${call.shownBy ? ` · shown by ${call.shownBy}` : ""}`}</span>
                        </span>
                        {chat && (
                          <Button asChild size="sm" variant="ghost">
                            <Link href={chat} onClick={close}>
                              <MessageSquare className="size-4" aria-hidden />
                              Its chat
                            </Link>
                          </Button>
                        )}
                      </div>
                      {call.artefacts.length > 0 && <CallArtefacts calls={call.artefacts} selfUUID={selfUUID} underCall={{ chat }} onPlay={(a) => play(call, a)} onLeave={close} />}
                    </li>
                  )
                })}
              </ul>
            )}
          </section>
        )}
      </div>
    )

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <ClusterButton label="Calls with this board" data-board-call="">
          <Video />
        </ClusterButton>
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={8} aria-label="Calls with this board" data-board-calls="" className="content-float flex w-[22rem] flex-col rounded-xl p-0 shadow-e3">
        <OverlayHeader className="px-4 pb-2 pt-3.5">
          <h2 className="text-ui font-semibold text-ink">Calls</h2>
        </OverlayHeader>
        <OverlayBody className="mx-0 flex flex-1 flex-col gap-4 overflow-y-auto px-4 pb-3">
          <BoardCallStart board={board} selfUUID={selfUUID} http={http} calls={calls} hasEditAccess={hasEditAccess} offline={offline} onStarted={close} />
          {body}
        </OverlayBody>
        {sheet && (
          <OverlayFooter className="px-4 py-3">
            <Button type="button" variant="secondary" className="h-11 w-full" onClick={close}>
              Done
            </Button>
          </OverlayFooter>
        )}
      </PopoverContent>
    </Popover>
  )
}
