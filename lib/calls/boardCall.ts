/**
 * A board's calls (miro-27, calls with the board): every call that put the board on its stage, as
 * GET /board/getBoardCalls/{board} answers whoever may read the board and the call's conversation (never someone only
 * let into the call by its invite), at most 30, the latest shown first. A call going on now is listed to join; one
 * that ended, with what it kept (lib/calls/callArtefacts). Pure: components/board/boardCall presents it.
 */

import { artefactsOf, type CallArtefact } from "@/lib/calls/callArtefacts"
import type { CallRef } from "@/lib/calls/callRef"
import { callLength } from "@/lib/calls/callLength"

/** A conversation's call: a board lists no instant meeting's (it keeps no chat, transcript or recording). */
export type ConversationCallRef = CallRef & { kind: "channel" | "dm" | "group" }

export interface BoardCall {
  session: string
  ref: ConversationCallRef
  startedAt: string
  endedAt?: string
  live: boolean
  /** The board is on the call's stage now. */
  onStage: boolean
  /** Who first put the board on its stage, by the name the call knew them by; "" when it didn't say. */
  shownBy: string
  shownAt: string
  people: number
  artefacts: CallArtefact[]
}

export interface BoardCalls {
  /** Calls going on now, the latest to show the board first. */
  live: BoardCall[]
  /** Calls that ended, the newest first. */
  past: BoardCall[]
}

const KINDS = new Set(["channel", "dm", "group"])
const text = (v: unknown): string => (typeof v === "string" ? v.trim() : "")
const when = (v: unknown): string => {
  const s = text(v)
  return s && !Number.isNaN(Date.parse(s)) ? s : ""
}
const newestFirst = (field: "startedAt" | "shownAt") => (a: BoardCall, b: BoardCall) => Date.parse(b[field] || b.startedAt) - Date.parse(a[field] || a.startedAt)

/** The calls in the answer, live and past, leaving out anything malformed. Pure. */
export function readBoardCalls(body: unknown): BoardCalls {
  const list = ((body as { data?: { calls?: unknown } } | null | undefined)?.data?.calls ?? null) as unknown
  const out: BoardCalls = { live: [], past: [] }
  if (!Array.isArray(list)) return out
  const seen = new Set<string>()
  for (const raw of list) {
    const r = (raw ?? {}) as Record<string, unknown>
    const session = text(r.session_id)
    const kind = text(r.kind)
    const id = text(r.conversation)
    const startedAt = when(r.started_at)
    if (!session || seen.has(session) || !KINDS.has(kind) || !id || !startedAt) continue
    seen.add(session)
    const endedAt = when(r.ended_at)
    // A call with an end is over, whatever else it says.
    const live = r.live === true && !endedAt
    const call: BoardCall = {
      session,
      ref: { kind, id } as ConversationCallRef,
      startedAt,
      live,
      onStage: live && r.on_stage === true,
      shownBy: text(r.shown_by),
      shownAt: when(r.shown_at),
      people: typeof r.people === "number" && r.people > 0 ? Math.floor(r.people) : 0,
      artefacts: live ? [] : artefactsOf(r.artefacts),
    }
    if (endedAt) call.endedAt = endedAt
    ;(live ? out.live : out.past).push(call)
  }
  out.live.sort(newestFirst("shownAt"))
  out.past.sort(newestFirst("startedAt"))
  return out
}

/** Where a call was, in words: its conversation's kind. Pure. */
export function whereOf(ref: ConversationCallRef): string {
  return ref.kind === "channel" ? "In a channel" : ref.kind === "dm" ? "In a direct message" : "In a group chat"
}

/** How long a call that ended ran ("42 min", "1 h 5 min"), or "" when it didn't say. Pure. */
export function lengthOf(call: Pick<BoardCall, "startedAt" | "endedAt">): string {
  const seconds = call.endedAt ? (Date.parse(call.endedAt) - Date.parse(call.startedAt)) / 1000 : NaN
  return seconds >= 0 ? callLength(seconds) : ""
}
