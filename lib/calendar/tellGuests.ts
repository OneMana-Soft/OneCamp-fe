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
