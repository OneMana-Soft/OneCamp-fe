"use client"

/**
 * "Start a call in..." at the head of a board's Call (miro-27, calls with the board), for whoever is signed in on the
 * board, readers too. Where the board was called before comes first (lib/calls/boardCallStart, from the board's own
 * calls: only conversations the reader may open), then the app's one search over people, channels and groups
 * (lib/search/userAndChannel): one person is their DM, several a group of them, made the chat's own way (Add people,
 * chat A9: the server opens the group of exactly them, or the one there is), a channel or a group itself. Start opens
 * the conversation's own call page (lib/calls/conversationCallPath); an editor's board goes with it through a one-shot
 * handoff in the tab (lib/calls/boardHandoff), never the URL, and the call puts it up through Call Control, whose server
 * checks again that they may. Offline it says so and starts nothing. In the board's Call chunk: it takes the page's
 * client and none of the shared core.
 */

import * as React from "react"
import { useRouter } from "next/navigation"
import type { AxiosInstance } from "axios"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { MultiSelectSearch } from "@/components/multiSelectSearch/multiSelectSearch"
import { Hash, User, Users, Video, WifiOff } from "@/lib/icons"
import { OWN_ERRORS } from "@/lib/http/ownErrors"
import { apiErrorMessage } from "@/lib/utils/apiError"
import { whereOf, type BoardCalls, type ConversationCallRef } from "@/lib/calls/boardCall"
import { pastPlaces, startOf } from "@/lib/calls/boardCallStart"
import { handOffBoard } from "@/lib/calls/boardHandoff"
import { callRefOf } from "@/lib/calls/callRef"
import { conversationCallPath } from "@/lib/calls/conversationCallPath"
import { conversationPath } from "@/lib/conversation/conversationPath"
import { searchPlacesOf, type SearchPlace } from "@/lib/search/userAndChannel"
import { shortDateTime } from "@/lib/utils/date/shortDate"
import { sectionTitle } from "@/lib/ui/fieldRow"
import { PostEndpointUrl } from "@/services/endPoints"

export interface BoardCallStartProps {
  board: string
  selfUUID: string
  http: Pick<AxiosInstance, "post">
  /** The board's calls as last read, or null before the first answer. */
  calls: BoardCalls | null
  /** Only a board editor puts the board up; a reader may still start the call. */
  hasEditAccess: boolean
  offline: boolean
  /** Closes the Call as the call's page opens. */
  onStarted: () => void
}

const LABEL = "Search people, channels or groups"
const KIND_WORD: Record<SearchPlace["type"], string> = { user: "Person", channel: "Channel", groupChat: "Group chat" }
const KIND_ICON: Record<SearchPlace["type"], typeof User> = { user: User, channel: Hash, groupChat: Users }

function placeRow(item: SearchPlace) {
  const Icon = KIND_ICON[item.type]
  return (
    <span className="flex min-w-0 items-center gap-2">
      <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      <span className="truncate text-sm font-medium">{item.name}</span>
      <span className="shrink-0 text-xs text-muted-foreground">{KIND_WORD[item.type]}</span>
    </span>
  )
}

export function BoardCallStart({ board, selfUUID, http, calls, hasEditAccess, offline, onStarted }: BoardCallStartProps) {
  const router = useRouter()
  const [expanded, setExpanded] = React.useState(false)
  const [picked, setPicked] = React.useState<SearchPlace[]>([])
  const [putUp, setPutUp] = React.useState(true)
  const [busy, setBusy] = React.useState(false)
  const [failure, setFailure] = React.useState("")
  const [searchFailed, setSearchFailed] = React.useState(false)
  const past = React.useMemo(() => pastPlaces(calls), [calls])
  const target = startOf(picked, selfUUID)

  const search = React.useCallback(
    async (query: string): Promise<SearchPlace[]> => {
      if (!query.trim()) return []
      try {
        const res = await http.post(PostEndpointUrl.SearchUserAndChannel, { search_text: query }, OWN_ERRORS)
        setSearchFailed(false)
        const body = res.data as { data?: unknown } | null
        return searchPlacesOf((body?.data ?? null) as never)
      } catch {
        setSearchFailed(true)
        return []
      }
    },
    [http],
  )

  const go = (ref: ConversationCallRef) => {
    const path = conversationCallPath(ref, selfUUID)
    if (!path) return
    // The call's room is its conversation's id: the call reads the board for that room alone.
    if (hasEditAccess && putUp) handOffBoard(ref.id, board)
    onStarted()
    router.push(path)
  }

  const start = async () => {
    if (!target || busy) return
    if ("ref" in target) return go(target.ref)
    setBusy(true)
    setFailure("")
    try {
      // Several people: Add people from the DM with the first opens the group of exactly them, or the one there is.
      const [first, ...rest] = target.people
      const dm = callRefOf("chat", first, selfUUID)
      if (!dm) return
      const res = await http.post(conversationPath("dm", dm.id, "people"), { people: rest, share: "none" }, OWN_ERRORS)
      const opened = (res.data as { data?: { kind?: unknown; id?: unknown } } | null)?.data
      if (opened?.kind !== "group" || typeof opened.id !== "string" || !opened.id) throw new Error("no group")
      go({ kind: "group", id: opened.id })
    } catch (e) {
      setFailure(apiErrorMessage(e, "Couldn't start the group's call. Try again."))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section aria-label="Start a call" data-board-call-start="" className="flex flex-col gap-2.5">
      {!expanded ? (
        <Button type="button" variant="secondary" aria-expanded={false} className="h-9 w-full justify-start gap-2 [@media(pointer:coarse)]:h-11" onClick={() => setExpanded(true)}>
          <Video className="size-4" aria-hidden />
          Start a call in…
        </Button>
      ) : (
        <>
          <h3 className={sectionTitle}>Start a call in…</h3>
          {offline ? (
            <p role="status" data-board-call-start-offline="" className="flex items-center gap-2 rounded-lg bg-sunken px-3 py-2 text-xs text-ink-2">
              <WifiOff className="size-3.5 shrink-0" aria-hidden />
              {"You're offline: a call starts once you're back."}
            </p>
          ) : (
            <>
              {hasEditAccess && (
                // The app's own box, its whole row the press (44 px under a finger), as the board's other ticked rows are.
                <label className="flex min-h-8 cursor-pointer items-center gap-2.5 text-sm text-foreground [@media(pointer:coarse)]:min-h-11">
                  <Checkbox checked={putUp} onCheckedChange={(v) => setPutUp(v === true)} />
                  Put this board up when the call starts
                </label>
              )}
              {past.length > 0 && (
                <ul aria-label="Called with this board before" className="flex flex-col gap-1.5">
                  {past.map((p) => (
                    <li key={`${p.ref.kind}:${p.ref.id}`}>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => go(p.ref)}
                        data-board-call-start-past={p.ref.id}
                        className="flex w-full items-center gap-3 rounded-lg border border-border/60 px-3 py-2 text-left hover:bg-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60 [@media(pointer:coarse)]:min-h-11"
                      >
                        <span className="flex min-w-0 flex-1 flex-col">
                          <span className="truncate text-sm text-foreground">{whereOf(p.ref)}</span>
                          <span className="truncate text-xs text-muted-foreground">{`Last called ${shortDateTime(new Date(p.at))}`}</span>
                        </span>
                        <Video className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <MultiSelectSearch onSearch={search} onSelect={setPicked} renderItem={placeRow} placeholder={`${LABEL}…`} inputLabel={LABEL} />
              {searchFailed && (
                <p role="alert" className="text-xs text-danger-ink">
                  {"Search didn't answer. Check your connection and try again."}
                </p>
              )}
              {picked.length > 1 && !target && <p className="text-xs text-muted-foreground">Pick one channel or group, or people.</p>}
              {failure && (
                <p role="alert" className="text-xs text-danger-ink">
                  {failure}
                </p>
              )}
              <Button type="button" className="h-9 w-full [@media(pointer:coarse)]:h-11" disabled={!target} busy={busy} onClick={() => void start()}>
                Start the call
              </Button>
            </>
          )}
        </>
      )}
    </section>
  )
}
