// Raised hands and nonverbal feedback in a call (calls CALLS-3a). The server
// keeps them and tells the room as attributes only it sets (handsCore.ts), so
// every screen, a guest's too, draws the same queue. Pure, no LiveKit import.

import { handOf, type CallFeedback } from "./handsCore"

export { CALL_FEEDBACK, FEEDBACK_ATTRIBUTE, HAND_ATTRIBUTE, feedbackOf, handOf, type CallFeedback } from "./handsCore"

/** How long someone speaks before their raised hand lowers itself, as Meet and Teams do. */
export const LOWER_AFTER_SPEAKING_MS = 3000

/** One person as the queue reads them. */
export interface HandHolder {
  identity: string
  attributes?: Readonly<Record<string, string>>
}

/**
 * The raised hands, in the order they went up (the same on every screen:
 * the server's time, then the identity). Pure.
 */
export function handQueue(people: readonly HandHolder[]): string[] {
  return people
    .map((p) => ({ identity: p.identity, at: handOf(p.attributes) }))
    .filter((p): p is { identity: string; at: number } => p.at !== null)
    .sort((a, b) => a.at - b.at || a.identity.localeCompare(b.identity))
    .map((p) => p.identity)
}

/** Someone's place in the queue, 1 for next, or null with their hand down. Pure. */
export function placeIn(queue: readonly string[], identity: string): number | null {
  const i = queue.indexOf(identity)
  return i < 0 ? null : i + 1
}

/** The words for a piece of feedback, for its chip and the screen reader. Pure. */
export function feedbackLabel(f: CallFeedback): string {
  switch (f) {
    case "yes":
      return "Yes"
    case "no":
      return "No"
    case "slow_down":
      return "Slow down"
    case "away":
      return "Away"
  }
}

/** What a screen reader hears when the queue changes, once per change: "Jo raised their hand, 2nd in line", "You lowered your hand". Pure. */
export function handAnnouncement(name: string, raised: boolean, place: number | null, you: boolean): string {
  const who = you ? "You raised your hand" : `${name} raised their hand`
  if (!raised) return you ? "You lowered your hand" : `${name} lowered their hand`
  return place && place > 1 ? `${who}, ${ordinal(place)} in line` : who
}

function ordinal(n: number): string {
  const s = n % 100 >= 11 && n % 100 <= 13 ? "th" : ({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[n % 10] ?? "th"
  return `${n}${s}`
}

/**
 * Whether a raised hand should lower itself now: its owner has been speaking
 * for LOWER_AFTER_SPEAKING_MS since it went up. speakingSince is when their
 * current stretch of speaking began (null while quiet). Pure.
 */
export function speakingLowersHand(raisedAt: number | null, speakingSince: number | null, now: number): boolean {
  if (raisedAt === null || speakingSince === null) return false
  return now - Math.max(raisedAt, speakingSince) >= LOWER_AFTER_SPEAKING_MS
}
