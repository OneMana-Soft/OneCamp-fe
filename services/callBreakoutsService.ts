// A call's breakout rooms, for whoever goes to one (calls package C): the
// token for room n of the call. A member asks as themselves; a guest asks
// with the call token they joined with, by plain fetch. The main room needs
// no ask: its token is the one the call was joined with. Loaded with the rooms.

import axiosInstance, { OWN_ERRORS } from "@/lib/axiosInstance"
import { apiErrorMessage } from "@/lib/utils/apiError"
import { publicCall, sendFailedText } from "@/services/publicApi"
import type { Asker } from "@/components/livekit/handsRunner"
import { actInCall } from "@/services/callService"

/** A room's token, or why there's none, in the server's words. */
export type RoomTokenAnswer = { ok: true; token: string; n: number; name: string } | { ok: false; msg: string }

type RoomToken = { token?: string; number?: number; name?: string }

function answerOf(t: RoomToken | undefined, n: number): RoomTokenAnswer {
  return t?.token ? { ok: true, token: t.token, n: t.number || n, name: t.name ?? "" } : { ok: false, msg: "That room couldn't be opened. Try again." }
}

export async function breakoutToken(who: Asker, n: number, language?: string): Promise<RoomTokenAnswer> {
  const body = { room: n, language: language ?? "" }
  if ("sessionId" in who) {
    try {
      const res = await axiosInstance.post(`/calls/${encodeURIComponent(who.sessionId)}/breakout-token`, body, OWN_ERRORS)
      return answerOf((res.data as { data?: RoomToken } | undefined)?.data, n)
    } catch (e) {
      return { ok: false, msg: apiErrorMessage(e, "That room couldn't be opened. Try again.") }
    }
  }
  const res = await publicCall<RoomToken>("/guest/calls/breakout-token", {
    method: "POST",
    headers: { Authorization: `Bearer ${who.callToken}` },
    body: JSON.stringify(body),
  })
  return res.ok ? answerOf(res.data, n) : { ok: false, msg: sendFailedText(res) }
}

/**
 * Tells the server a member chose room n (0: the main room), so whoever runs
 * the call sees where they are; whether it heard. A guest has no say here:
 * the server counts the room they take a token for.
 */
export async function chooseBreakout(who: Asker, n: number): Promise<boolean> {
  if (!("sessionId" in who)) return false
  return actInCall(who.sessionId, { action: "breakout_choose", room: n }).then(
    () => true,
    () => false,
  )
}
