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

const at = (base: Date, days: number, hour: number) => {
  const d = new Date(base)
  d.setDate(d.getDate() + days)
  d.setHours(hour, 0, 0, 0)
  return d
}

export function schedulePresets(now: Date): SchedulePreset[] {
  const out: SchedulePreset[] = []
  // Later today, only with a couple of working hours still ahead.
  // Each label says its time on the reader's clock: "5:00 PM" or "17:00".
  const preset = (day: string, when: Date) => ({ label: `${day}, ${clockTime(when)}`, at: when })
  if (now.getHours() < 15) out.push(preset("Later today", at(now, 0, 17)))
  out.push(preset("Tomorrow", at(now, 1, 9)))
  // Next Monday, unless that is tomorrow (already offered).
  const toMonday = (8 - now.getDay()) % 7 || 7
  if (toMonday !== 1) out.push(preset("Monday", at(now, toMonday, 9)))
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
