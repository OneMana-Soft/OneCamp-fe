// Your hand and feedback reaching the server, and a raised hand lowering
// itself once you've spoken for three seconds (calls CALLS-3a). Loaded the
// first time you use them or your hand is up (useHands), not with the call.

import { ParticipantEvent, type LocalParticipant } from "livekit-client"
import { speakingLowersHand, type CallFeedback } from "@/lib/calls/hands"
import { actInCall } from "@/services/callService"
import { publicCall } from "@/services/publicApi"
import { apiErrorMessage } from "@/lib/utils/apiError"
import { showCallFailure } from "./VideoControls"
import { callToast } from "./callSurface"

type OwnAction = { action: "raise_hand" | "lower_hand" | "set_feedback"; feedback?: string }

/** Who you are to the server: your session's call, or the call token a guest joined with. */
export type Asker = { sessionId: string } | { callToken: string }

async function send(asker: Asker, a: OwnAction): Promise<void> {
  if ("sessionId" in asker) {
    await actInCall(asker.sessionId, a)
    return
  }
  const res = await publicCall<{ affected: number }>("/guest/calls/act", {
    method: "POST",
    headers: { Authorization: `Bearer ${asker.callToken}` },
    body: JSON.stringify(a),
  })
  if (!res.ok) throw new Error(res.msg)
}

function ask(asker: Asker, a: OwnAction, failure: string) {
  send(asker, a).catch((e) => showCallFailure({ title: failure, description: apiErrorMessage(e, "Try again in a moment.") }))
}

export function toggleHand(asker: Asker, raised: boolean) {
  ask(asker, { action: raised ? "lower_hand" : "raise_hand" }, raised ? "Couldn't lower your hand" : "Couldn't raise your hand")
}

export function setFeedback(asker: Asker, f: CallFeedback | null) {
  ask(asker, { action: "set_feedback", feedback: f ?? "" }, "Couldn't change that")
}

/** Lowers your raised hand once you've spoken for three seconds since raising it. Answers its stop. */
export function lowerWhenSpoken(asker: Asker, me: LocalParticipant, raisedAt: number): () => void {
  let since: number | null = me.isSpeaking ? Date.now() : null
  let timer: ReturnType<typeof setTimeout> | undefined
  const check = () => {
    if (!speakingLowersHand(raisedAt, since, Date.now())) return
    ask(asker, { action: "lower_hand" }, "Couldn't lower your hand")
    callToast({ title: "Hand lowered", description: "You spoke, so your hand came down." })
  }
  const onSpeaking = (speaking: boolean) => {
    clearTimeout(timer)
    since = speaking ? Date.now() : null
    if (speaking) timer = setTimeout(check, 3000)
  }
  if (since !== null) timer = setTimeout(check, 3000)
  me.on(ParticipantEvent.IsSpeakingChanged, onSpeaking)
  return () => {
    clearTimeout(timer)
    me.off(ParticipantEvent.IsSpeakingChanged, onSpeaking)
  }
}
