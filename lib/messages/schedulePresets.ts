/**
 * The send-later choices, the way Slack offers them: later today while there
 * is a working day left, tomorrow morning, and Monday morning, in the person's
 * own time zone. Pure, so the choices are tested against fixed clocks.
 */

import { format } from "date-fns"
import { shortDate } from "@/lib/utils/date/shortDate"
import { clockTime } from "@/lib/utils/date/clock"

export interface SchedulePreset {
  label: string
  at: Date
}

/** The day `days` on from `base`, at `hour`:00. */
export const dayAt = (base: Date, days: number, hour: number) => {
  const d = new Date(base)
  d.setDate(d.getDate() + days)
  d.setHours(hour, 0, 0, 0)
  return d
}

/** Next Monday, at 0:00; on a Monday, the one after. */
export const nextMonday = (now: Date) => dayAt(now, (8 - now.getDay()) % 7 || 7, 0)

export function schedulePresets(now: Date): SchedulePreset[] {
  const out: SchedulePreset[] = []
  // Later today, only with a couple of working hours still ahead.
  // Each label says its time on the reader's clock: "5:00 PM" or "17:00".
  const preset = (day: string, when: Date) => ({ label: `${day}, ${clockTime(when)}`, at: when })
  if (now.getHours() < 15) out.push(preset("Later today", dayAt(now, 0, 17)))
  out.push(preset("Tomorrow", dayAt(now, 1, 9)))
  // Next Monday, unless that is tomorrow (already offered).
  if (now.getDay()) out.push(preset("Monday", dayAt(nextMonday(now), 0, 9)))
  return out
}

/** "Tue at 9:00 AM", or "14 Oct at 9:00 AM" beyond a week: how the time is shown back, in the app's one format. */
export function formatSendAt(d: Date, now: Date = new Date()): string {
  const time = clockTime(d)
  const sameDay = d.toDateString() === now.toDateString()
  if (sameDay) return `today at ${time}`
  const tomorrow = new Date(now)
  tomorrow.setDate(tomorrow.getDate() + 1)
  if (d.toDateString() === tomorrow.toDateString()) return `tomorrow at ${time}`
  const days = (d.getTime() - now.getTime()) / 86_400_000
  const day = days < 6.5 ? format(d, "EEE") : shortDate(d, now)
  return `${day} at ${time}`
}

/** The value a datetime-local input needs for a Date, in local time. */
export function toLocalInputValue(d: Date): string {
  return format(d, "yyyy-MM-dd'T'HH:mm")
}

/** A first offer of a moment: `d` on the next quarter hour, the time list's step (every zone's offset is whole quarters). */
export const quarterUp = (d: Date) => new Date(Math.ceil(d.getTime() / 900_000) * 900_000)

/** How soon and how far ahead a message may be sent later: the server's own window (business/ScheduledMessage MinLead, MaxLead). */
export const SEND_LATER_MIN_LEAD_MS = 30_000
export const SEND_LATER_MAX_LEAD_MS = 120 * 24 * 60 * 60 * 1000

/**
 * Why a typed send-later time can't be used, in the server's own words, or
 * undefined when it can: the button used to grey out with no reason, and
 * wanted a minute where the server takes 30 seconds (MC-41). Pure.
 */
export function sendLaterProblem(at: Date | null, now: number): string | undefined {
  if (!at || Number.isNaN(at.getTime())) return "Pick a date and time."
  if (at.getTime() < now + SEND_LATER_MIN_LEAD_MS) return `Pick a time at least ${SEND_LATER_MIN_LEAD_MS / 1000} seconds from now.`
  if (at.getTime() > now + SEND_LATER_MAX_LEAD_MS) return "Pick a time within the next 120 days."
  return undefined
}
