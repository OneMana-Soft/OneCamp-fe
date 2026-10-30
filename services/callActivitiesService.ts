// A call's polls and questions' requests (calls package A, "Ask the room").
// A member asks as themselves, through the signed-in axios instance; a guest
// asks with the call token they joined with, by plain fetch, as their chat,
// hand and feedback do. Only the Activities panel loads this, when it opens.

import axiosInstance, { OWN_ERRORS } from "@/lib/axiosInstance"
import { publicCall, publicTrouble, sendFailedText } from "@/services/publicApi"
import { apiErrorCode, apiErrorMessage, apiErrorStatus } from "@/lib/utils/apiError"
import type { Asker } from "@/components/livekit/handsRunner"
import type { Activity, CallActivities } from "@/lib/calls/activities"

/**
 * What a read found: the activities; a refusal that stays (you're not in the
 * call, or it isn't open to you: any 4xx but 429, a call token refused); or a
 * trouble that passes (busy: 429; unreachable: nothing answered, or 5xx).
 */
export type ActivitiesAnswer = { kind: "read"; activities: CallActivities } | { kind: "refused" } | { kind: "busy" } | { kind: "unreachable" }

/** A failed read's status as the panel reads it (publicTrouble's rule). Pure. */
export function failedActivitiesRead(status: number): ActivitiesAnswer {
  const t = publicTrouble(status)
  return { kind: t === "gone" ? "refused" : t }
}

const path = (who: Asker) => ("sessionId" in who ? `/calls/${encodeURIComponent(who.sessionId)}/activities` : "/guest/calls/activities")

export async function readActivities(who: Asker): Promise<ActivitiesAnswer> {
  if ("sessionId" in who) {
    try {
      const res = await axiosInstance.get(path(who), OWN_ERRORS)
      const activities = (res.data as { data?: CallActivities } | undefined)?.data
      return activities ? { kind: "read", activities } : { kind: "unreachable" }
    } catch (e) {
      return failedActivitiesRead(apiErrorStatus(e))
    }
  }
  const res = await publicCall<CallActivities>(path(who), { headers: { Authorization: `Bearer ${who.callToken}` } })
  if (res.ok) return res.data ? { kind: "read", activities: res.data } : { kind: "unreachable" }
  return failedActivitiesRead(res.status)
}

/**
 * What doing something found: done (with the id of a poll started or a
 * question asked), or why not in the server's words. tooFast is the server's
 * per-person limit (429); gone is a call you're no longer in, or one that
 * ended. A poll or question that went (404) is neither: the panel reads again.
 */
export type ActivityAnswer = { ok: true; id: string } | { ok: false; msg: string; tooFast: boolean; gone: boolean }

/** A refused activity's answer, from its status and the server's code. Pure. */
export function refusedActivity(status: number, code: string | undefined, msg: string): ActivityAnswer {
  return { ok: false, msg, tooFast: status === 429, gone: code === "not_in_call" || code === "call_over" }
}

export async function doActivity(who: Asker, a: Activity): Promise<ActivityAnswer> {
  if ("sessionId" in who) {
    try {
      const res = await axiosInstance.post(path(who), a, OWN_ERRORS)
      return { ok: true, id: (res.data as { data?: { id?: string } } | undefined)?.data?.id ?? "" }
    } catch (e) {
      return refusedActivity(apiErrorStatus(e), apiErrorCode(e), apiErrorMessage(e, "That didn't go through. Try again."))
    }
  }
  const res = await publicCall<{ id?: string }>(path(who), {
    method: "POST",
    headers: { Authorization: `Bearer ${who.callToken}` },
    body: JSON.stringify(a),
  })
  if (res.ok) return { ok: true, id: res.data?.id ?? "" }
  return refusedActivity(res.status, res.code, sendFailedText(res))
}
