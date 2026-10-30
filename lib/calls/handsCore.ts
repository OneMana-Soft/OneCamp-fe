// A call's hands and feedback as the server tells the room (lib/calls/hands.ts
// has the rest, loaded with what uses it). Pure.

export const HAND_ATTRIBUTE = "oc.hand"
export const FEEDBACK_ATTRIBUTE = "oc.feedback"

export type CallFeedback = "yes" | "no" | "slow_down" | "away"
export const CALL_FEEDBACK: readonly CallFeedback[] = ["yes", "no", "slow_down", "away"]

type Attributes = Readonly<Record<string, string>> | undefined

/** When someone's hand went up (Unix ms), or null while it is down. */
export function handOf(attributes: Attributes): number | null {
  const at = Number(attributes?.[HAND_ATTRIBUTE] || 0)
  return Number.isFinite(at) && at > 0 ? at : null
}

/** Someone's feedback, or null; anything the server doesn't name is none. */
export function feedbackOf(attributes: Attributes): CallFeedback | null {
  const raw = attributes?.[FEEDBACK_ATTRIBUTE] ?? ""
  return (CALL_FEEDBACK as readonly string[]).includes(raw) ? (raw as CallFeedback) : null
}
