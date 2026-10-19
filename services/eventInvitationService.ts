// A guest's own invitation to an event, public side (calendar A2): someone
// invited by email reads it and answers from the link in their email, with no
// account. Plain fetch, as for booking pages and guest links, so the
// signed-in axios instance is never involved.

import { publicCall } from "@/services/publicApi"
import type { Answer } from "@/lib/calendar/eventsApi"

/** A moment of an invitation: an instant in a zone, or a date for an all-day event. */
export interface InvitationWhen {
  at?: string
  zone?: string
  date?: string
}

/** What an invitation shows its guest (business/Calendar InvitationView). */
export interface InvitationView {
  title: string
  start: InvitationWhen
  end: InvitationWhen
  all_day: boolean
  location?: string
  notes?: string
  /** How it repeats, in words: "Weekly on Tuesday". */
  repeats?: string
  organiser: string
  /** Over: it takes no answer. */
  ended: boolean
  you: { name?: string; email: string; response: string; note?: string }
  /** The other guests by name, when the organiser lets guests see each other. */
  guests?: { name: string; response: string }[]
}

export const getInvitation = (token: string) => publicCall<InvitationView>(`/public/rsvp/${encodeURIComponent(token)}`)

/** An answer from the guest's page; a note left out stays as it was. */
export const answerInvitation = (token: string, body: { answer: Answer; note?: string }) =>
  publicCall<InvitationView>(`/public/rsvp/${encodeURIComponent(token)}`, { method: "POST", body: JSON.stringify(body) })

/** The answer an email's button carries (?answer=yes, maybe or no), as the API takes it. */
export function linkAnswer(param: string | null): Answer | null {
  switch ((param ?? "").trim().toLowerCase()) {
    case "yes":
      return "accepted"
    case "maybe":
      return "tentative"
    case "no":
      return "declined"
    default:
      return null
  }
}
