/**
 * Whether a save asks "Tell guests?" (PROGRAM.md D-CAL-5), and which way:
 * guests who stay hear of a change to what the meeting is (its title, its
 * times, how it repeats, its notes: business/Calendar toldAbout), and anyone
 * taken off hears they were; a guest only added is sent an invitation. Pure.
 */
import type { TellAction } from "@/components/calendar/tellGuestsDialog"

export interface GuestSet {
  /** Members, by uuid. */
  members: string[]
  /** Guests invited by email, by address. */
  emails: string[]
}

export interface EventShape {
  title: string
  notes: string
  start: Date
  end: Date
  rule: string
  guests: GuestSet
}

const keysOf = (g: GuestSet) => new Set([...g.members.map((m) => `u:${m}`), ...g.emails.map((e) => `e:${e.trim().toLowerCase()}`)])
const minute = (d: Date) => Math.floor(d.getTime() / 60_000)

/** Whether two guest lists name the same people. */
export function sameGuests(a: GuestSet, b: GuestSet): boolean {
  const x = keysOf(a)
  const y = keysOf(b)
  return x.size === y.size && [...x].every((k) => y.has(k))
}

/** What a save would tell guests: "change", "invite", or null when nobody would hear of it. */
export function tellOf(was: EventShape, now: EventShape): TellAction | null {
  const before = keysOf(was.guests)
  const after = keysOf(now.guests)
  const staying = [...after].filter((k) => before.has(k)).length
  const added = after.size - staying
  const removed = [...before].filter((k) => !after.has(k)).length
  const changed =
    was.title !== now.title ||
    was.notes !== now.notes ||
    was.rule !== now.rule ||
    minute(was.start) !== minute(now.start) ||
    minute(was.end) !== minute(now.end)
  if ((changed && staying > 0) || removed > 0) return "change"
  if (added > 0) return "invite"
  return null
}

/** What a toast adds when the organiser said Don't send: guests are told in OneCamp alone. */
export const NOT_EMAILED = "Guests weren't emailed."

/** A listed event, as the calendar's lists send it: its guests (members and guests by email) and who made it. */
export interface ListedEvent {
  event_title?: string
  event_start_time?: string
  event_end_time?: string
  event_created_by?: { user_uuid?: string }
  event_guests?: { user_uuid?: string; email?: string }[]
}

/** A listed event's guests, its organiser left out: who would hear of a change to it. */
export function guestsOf(e: ListedEvent): GuestSet {
  const organiser = e.event_created_by?.user_uuid
  const guests = e.event_guests ?? []
  return {
    members: guests.flatMap((g) => (g.user_uuid && g.user_uuid !== organiser ? [g.user_uuid] : [])),
    emails: guests.flatMap((g) => (!g.user_uuid && g.email ? [g.email] : [])),
  }
}

/** What moving a listed event to new times would tell its guests: what the form's save would, its times alone changed (CAL-11). */
export function tellOfMove(e: ListedEvent, start: Date, end: Date): TellAction | null {
  const shape = (s: Date, en: Date): EventShape => ({ title: e.event_title ?? "", notes: "", start: s, end: en, rule: "", guests: guestsOf(e) })
  return tellOf(shape(new Date(e.event_start_time ?? ""), new Date(e.event_end_time ?? "")), shape(start, end))
}
