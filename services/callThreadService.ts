// The call's chat's requests (calls CALLS-3b). A member asks as themselves,
// through the signed-in axios instance; a guest asks with the call token they
// joined with, by plain fetch, as their hand and feedback do. Only the chat
// panel loads this, when it opens.

import axiosInstance, { OWN_ERRORS } from "@/lib/axiosInstance"
import { publicCall, publicTrouble, sendFailedText } from "@/services/publicApi"
import { apiErrorCode, apiErrorMessage, apiErrorStatus } from "@/lib/utils/apiError"
import type { CallThreadRead, CallThreadTarget } from "@/lib/calls/callThread"

/**
 * What a read found: the chat; nothing new since the last read (the server's
 * empty 204); no chat there (404: its message isn't written yet, or the call
 * is over or you're out of it); a refusal that stays (any other 4xx, a call
 * token refused); or a trouble that passes (busy: 429; unreachable: nothing
 * answered, or 5xx).
 */
export type ThreadAnswer =
  | { kind: "thread"; thread: CallThreadRead }
  | { kind: "unchanged" }
  | { kind: "missing" }
  | { kind: "refused" }
  | { kind: "busy" }
  | { kind: "unreachable" }

/** A failed read's status as the chat reads it (publicTrouble's rule, with 404 its own). Pure. */
export function failedRead(status: number): ThreadAnswer {
  if (status === 404) return { kind: "missing" }
  const t = publicTrouble(status)
  return { kind: t === "gone" ? "refused" : t }
}

const threadPath = (target: CallThreadTarget) => ("sessionId" in target ? `/calls/${encodeURIComponent(target.sessionId)}/thread` : "/guest/calls/thread")

export async function readCallThread(target: CallThreadTarget, since?: string): Promise<ThreadAnswer> {
  const path = threadPath(target) + (since ? `?since=${encodeURIComponent(since)}` : "")
  if ("sessionId" in target) {
    try {
      const res = await axiosInstance.get(path, OWN_ERRORS)
      if (res.status === 204) return { kind: "unchanged" }
      const thread = (res.data as { data?: CallThreadRead } | undefined)?.data
      return thread ? { kind: "thread", thread } : { kind: "unreachable" }
    } catch (e) {
      return failedRead(apiErrorStatus(e))
    }
  }
  const res = await publicCall<CallThreadRead | undefined>(path, { headers: { Authorization: `Bearer ${target.callToken}` } })
  if (res.ok) return res.data ? { kind: "thread", thread: res.data } : { kind: "unchanged" }
  return failedRead(res.status)
}

/**
 * What a write found: sent, or why not in the server's words; readOnly when
 * the reader may only read, held while the people running the call hold its
 * chat (meet-12), gone when the chat is.
 */
export type WriteAnswer = { ok: true } | { ok: false; msg: string; readOnly: boolean; held: boolean; gone: boolean }

/** A refused write's answer, from its status and the server's code. Pure. */
function refusedWrite(status: number, code: string | undefined, msg: string): WriteAnswer {
  const held = status === 403 && code === "chat_held"
  return { ok: false, msg, readOnly: status === 403 && !held, held, gone: status === 404 }
}

export async function writeInCallThread(target: CallThreadTarget, text: string): Promise<WriteAnswer> {
  if ("sessionId" in target) {
    try {
      await axiosInstance.post(threadPath(target), { text }, OWN_ERRORS)
      return { ok: true }
    } catch (e) {
      return refusedWrite(apiErrorStatus(e), apiErrorCode(e), apiErrorMessage(e, "Your message couldn't be sent. Try again."))
    }
  }
  const res = await publicCall<unknown>(threadPath(target), {
    method: "POST",
    headers: { Authorization: `Bearer ${target.callToken}` },
    body: JSON.stringify({ text }),
  })
  if (res.ok) return { ok: true }
  return refusedWrite(res.status, res.code, sendFailedText(res))
}
