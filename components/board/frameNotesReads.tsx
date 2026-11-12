"use client"

// Presenter notes' read and write (miro-28 2a), on the shared core the board page already ships, so the lazy pieces
// that draw them (the Frames panel's row and the presenter's slides, through components/board/slideNotes) import none
// of it: the page passes this in, as it does Add from OneCamp's reads (components/board/addWorkReads). `may` is the
// one gate (lib/board/frameNotes frameNotesUrl): whoever may present the board (its edit right) reads; a follower, a
// view-only member, a share-link guest or a call's guest never asks (the server refuses them too).

import * as React from "react"
import { ErrorRow } from "@/components/ui/error-row"
import { SkeletonRows } from "@/components/ui/skeletonRows"
import { useFetch } from "@/hooks/useFetch"
import { usePost } from "@/hooks/usePost"
import { OWN_ERRORS } from "@/lib/axiosInstance"
import { NOTE_MAX, frameNotesUrl, notesByFrame, noteSaved, staleNote, type FrameNote } from "@/lib/board/frameNotes"
import { isAppOffline, subscribeConnectivity } from "@/lib/connectivity"
import { apiErrorStatus, refusalReason } from "@/lib/utils/apiError"
import { BoardsPost } from "@/services/endpoints/boards"

/** How a save went: saved (null once emptied, its soft delete), stale (the note as it now is), offline, or refused. */
export type NoteSave = { saved: FrameNote | null } | { stale: FrameNote | null } | { offline: true } | { refused: string }

export interface FrameNotesReads {
  /** Each frame's note, once read. */
  notes: Map<string, FrameNote> | undefined
  /** No notes yet: what to draw for them (loading, offline, or a failed read with Try again), else null. */
  waiting: React.ReactNode
  max: number
  save(frame: string, body: string, version: number): Promise<NoteSave>
}

export type FrameNotesSource = React.ComponentType<{ board: string; may: boolean; children: (reads: FrameNotesReads) => React.ReactNode }>

const notOffline = () => false

function useFrameNotesReads(board: string, may: boolean): FrameNotesReads {
  const res = useFetch<{ data?: FrameNote[] }>(frameNotesUrl(board, may), undefined, undefined, OWN_ERRORS)
  const { makeRequest } = usePost()
  const offline = React.useSyncExternalStore(subscribeConnectivity, isAppOffline, notOffline)
  // An answer that isn't a list is no notes, and a save over it a list of one (lib/board/frameNotes' one check).
  const notes = React.useMemo(() => (res.data ? notesByFrame(res.data.data) : undefined), [res.data])
  const { mutate } = res
  const keep = React.useCallback(
    (frame: string, note: FrameNote | null) => void mutate((d) => ({ ...d, data: noteSaved(d?.data, frame, note) }), { revalidate: false }),
    [mutate],
  )
  const save = React.useCallback(
    async (frame: string, body: string, version: number): Promise<NoteSave> => {
      try {
        const r = await makeRequest<object, FrameNote | { data: null }>({ apiEndpoint: BoardsPost.SaveFrameNote, payload: { board_uuid: board, frame_id: frame, body, version }, quiet: true })
        // An emptied note answers {data: null}, which usePost hands back as the whole envelope.
        const saved = r && "frame_id" in r ? r : null
        keep(frame, saved)
        return { saved }
      } catch (e) {
        const stale = staleNote(e)
        if (stale) {
          keep(frame, stale.current)
          return { stale: stale.current }
        }
        return apiErrorStatus(e) === 0 ? { offline: true } : { refused: refusalReason(e) ?? "Try again in a moment." }
      }
    },
    [board, makeRequest, keep],
  )
  const waiting = notes ? null : offline ? (
    <p className="px-1 py-2 text-ui-sm text-ink-3">You&apos;re offline: the notes load when you&apos;re back.</p>
  ) : res.isError ? (
    <ErrorRow subject="the notes" detail={refusalReason(res.isError)} onRetry={() => void mutate()} />
  ) : (
    <div role="status" aria-label="Loading the notes" className="py-1">
      <SkeletonRows rows={2} />
    </div>
  )
  return { notes, waiting, max: NOTE_MAX, save }
}

/** Held where notes may show: the Frames panel and the presenter's slides render inside. */
export default function WithFrameNotes({ board, may, children }: { board: string; may: boolean; children: (reads: FrameNotesReads) => React.ReactNode }) {
  return <>{children(useFrameNotesReads(board, may))}</>
}
