/**
 * Guests' answers (calendar A2) in words and order: who is coming, as the
 * event card, the panel and the guest's own page say it. The organiser is
 * going to their own event, so they count as going and come first. Pure.
 */

export type GuestResponse = "needs_action" | "accepted" | "declined" | "tentative"

/** A guest as the answers read one: a member by uuid, or someone invited by email. */
export interface AnsweringGuest {
  user_uuid?: string
  email?: string
  name?: string
  response: string
  note?: string
}

/** Each answer in a sentence's words: "Maya Chen, going". */
export const ANSWER_WORD: Record<GuestResponse, string> = {
  accepted: "going",
  tentative: "maybe",
  declined: "not going",
  needs_action: "no answer yet",
}

/** An answer as one of the four; anything else is no answer yet. */
export function responseOf(r: string | undefined): GuestResponse {
  return r === "accepted" || r === "declined" || r === "tentative" ? r : "needs_action"
}

/** Someone's own answer among the guests (by their uuid), or nothing when they aren't one. */
export function answerOfMe<T extends AnsweringGuest>(guests: T[] | undefined, selfId: string | undefined): T | undefined {
  if (!selfId) return undefined
  return guests?.find((g) => g.user_uuid === selfId)
}

export interface AnswerCounts {
  going: number
  maybe: number
  no: number
  waiting: number
}

/** How many said each, the organiser among the going when they are named. */
export function answerCounts(guests: AnsweringGuest[] | undefined, withOrganiser = false): AnswerCounts {
  const c: AnswerCounts = { going: withOrganiser ? 1 : 0, maybe: 0, no: 0, waiting: 0 }
  for (const g of guests ?? []) {
    const r = responseOf(g.response)
    if (r === "accepted") c.going++
    else if (r === "tentative") c.maybe++
    else if (r === "declined") c.no++
    else c.waiting++
  }
  return c
}

/** "3 going · 1 maybe · 1 no answer": each answer that someone gave, counted. */
export function countsLine(c: AnswerCounts): string {
  const parts: string[] = []
  if (c.going) parts.push(`${c.going} going`)
  if (c.maybe) parts.push(`${c.maybe} maybe`)
  if (c.no) parts.push(`${c.no} not going`)
  if (c.waiting) parts.push(`${c.waiting} no answer`)
  return parts.join(" · ")
}

const ORDER: Record<GuestResponse, number> = { accepted: 0, tentative: 1, declined: 2, needs_action: 3 }

/** Going, maybe, not going, no answer; in the order they were added within each. */
export function inAnswerOrder<T extends AnsweringGuest>(guests: T[]): T[] {
  return guests
    .map((g, i) => ({ g, i }))
    .sort((a, b) => ORDER[responseOf(a.g.response)] - ORDER[responseOf(b.g.response)] || a.i - b.i)
    .map((x) => x.g)
}

/** A face's accessible name: "Maya Chen, going"; "Sam Rivera, organiser". */
export function faceLabel(name: string, response: string | undefined, organiser = false): string {
  return `${name}, ${organiser ? "organiser" : ANSWER_WORD[responseOf(response)]}`
}

/** What to call a guest invited by email: their name, else their address. */
export function outsiderName(g: { name?: string; email?: string }): string {
  return g.name?.trim() || g.email || "Someone"
}
