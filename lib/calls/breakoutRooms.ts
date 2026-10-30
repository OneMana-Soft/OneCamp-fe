// Where someone may go among a call's breakout rooms, and how long is left:
// for the screens that move people (loaded with the rooms, never at first).

import type { BreakoutRoom, CallBreakouts } from "./breakouts"

/** Someone's room: the one they're assigned to, or none. Pure. */
export function myBreakout(b: CallBreakouts, identity: string): BreakoutRoom | undefined {
  const n = b.assigned[identity]
  return b.rooms.find((r) => r.n === n)
}

/** The rooms someone may go to now, as the server's MayTakeRoom allows. Pure. */
export function breakoutChoices(b: CallBreakouts, identity: string, runsCall: boolean): BreakoutRoom[] {
  if (!b.open) return []
  if (b.choose || runsCall) return b.rooms
  const mine = myBreakout(b, identity)
  return mine ? [mine] : []
}

/** Whole seconds until a moment (ms), never below none; nothing without one. Pure. */
export function secondsUntil(at: number | undefined, now: number): number | undefined {
  if (at === undefined) return undefined
  return Math.max(0, Math.ceil((at - now) / 1000))
}

/**
 * Whom the rooms panel names and places: everyone in your room now, then
 * everyone in one of the call's rooms whom this screen has seen in the call
 * (their name from when they were in your room). Someone never seen stays
 * unnamed, and the panel counts them. Never you. Pure.
 */
export function panelPeople<P extends { identity: string }>(here: readonly P[], seen: ReadonlyMap<string, P>, b: CallBreakouts | undefined, me: string): P[] {
  const out = here.filter((p) => p.identity !== me)
  const listed = new Set(out.map((p) => p.identity))
  for (const identity of Object.keys(b?.assigned ?? {})) {
    const p = seen.get(identity)
    if (p && identity !== me && !listed.has(identity)) {
      out.push(p)
      listed.add(identity)
    }
  }
  return out
}
