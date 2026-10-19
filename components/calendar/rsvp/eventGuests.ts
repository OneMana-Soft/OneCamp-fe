/**
 * An event's guests and answers as the card and the panel show them: the
 * organiser first, then each guest in answer order, members by their profile
 * and guests invited by email by their name or address. An event from the
 * two old stores has no answers (event_guests): its guests show with none.
 * Pure.
 */
import type { CalendarEventInterface, EventGuest } from "@/types/calendar"
import { avatarSeed } from "@/lib/utils/getAvatarColor"
import { addressOrHandleOf, displayNameOf } from "@/lib/personName"
import { GetEndpointUrl } from "@/services/endPoints"
import { answerCounts, answerOfMe, countsLine, inAnswerOrder, outsiderName, type AnswerCounts } from "@/lib/calendar/answers"
import { FACES_BEFORE_FOLD, type FaceGuest } from "@/components/calendar/rsvp/guestFaces"

export interface EventGuests {
  /** The organiser, then the guests in answer order. */
  faces: FaceGuest[]
  counts: AnswerCounts
  /** Whether the server sent answers (the one store). */
  answered: boolean
  /** The reader's own answer, when they are a guest. */
  mine?: string
  /** The reader's face's key, when they are among the faces. */
  self?: string
}

const photo = (key?: string) => (key ? `${GetEndpointUrl.PublicAttachmentURL}?objKey=${key}` : undefined)

export function eventGuests(event: CalendarEventInterface, selfId: string | undefined): EventGuests {
  const people = new Map((event.event_participants ?? []).map((p) => [p.user_uuid, p]))
  const answers = event.event_guests
  const rows: EventGuest[] = answers ?? (event.event_participants ?? []).map((p) => ({ user_uuid: p.user_uuid, response: "needs_action", role: "required" }))
  const faces: FaceGuest[] = []
  const organiser = event.event_created_by
  if (organiser?.user_uuid) {
    faces.push({ key: organiser.user_uuid, name: displayNameOf(organiser) || "Someone", seed: avatarSeed(organiser), response: "accepted",
      organiser: true, src: photo(organiser.user_profile_object_key) })
  }
  for (const g of inAnswerOrder(rows)) {
    const p = g.user_uuid ? people.get(g.user_uuid) : undefined
    if (g.user_uuid && p) {
      faces.push({ key: g.user_uuid, name: displayNameOf(p) || "Someone", seed: avatarSeed(p), response: g.response, note: g.note,
        src: photo(p.user_profile_object_key), detail: addressOrHandleOf(p) || undefined })
    } else if (!g.user_uuid && g.email) {
      const name = outsiderName(g)
      // Their hue from the name they were invited by, as anywhere else would draw them.
      faces.push({ key: `mailto:${g.email}`, name, seed: name, response: g.response, note: g.note, outside: true,
        email: g.email, invite: g.invite, detail: name === g.email ? undefined : g.email })
    }
  }
  return { faces, counts: answerCounts(rows, !!organiser), answered: !!answers, mine: answerOfMe(rows, selfId)?.response, self: selfId }
}

/** Whether the Guests row folds to faces and the counts: above four guests, the organiser not counted. */
export function guestsFold(g: EventGuests): boolean {
  return g.faces.filter((f) => !f.organiser).length > FACES_BEFORE_FOLD
}

/**
 * The Guests row's words: the counts ("3 going · 1 maybe · 1 no answer") for
 * the organiser, and for anyone once the row folds; otherwise who is coming,
 * by name. An event with no answers kept (the two old stores) is always
 * named: its counts would only say nobody answered.
 */
export function guestsSummary(g: EventGuests, organiser: boolean): string {
  if (g.answered && (organiser || guestsFold(g))) return countsLine(g.counts)
  // The reader is "you", last: "Jonas Weber and you".
  const others = g.faces.filter((f) => !f.organiser)
  const names = [...others.filter((f) => f.key !== g.self).map((f) => f.name), ...(others.some((f) => f.key === g.self) ? ["you"] : [])]
  if (names.length <= 3) return names.length < 2 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`
  return `${names.slice(0, 2).join(", ")} and ${names.length - 2} others`
}
