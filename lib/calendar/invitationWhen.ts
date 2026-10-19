/**
 * When an invitation's event is, in the guest's own zone (calendar A2): the
 * page someone invited by email answers on says "Tuesday 20 October",
 * "2:00 PM – 3:00 PM" and "British Summer Time", wherever the organiser is.
 * An all-day event keeps its dates, in no zone at all. Pure.
 */
import { clockRange, dateTimeFormat } from "@/lib/utils/date/clock"

export interface WhenOfInvitation {
  at?: string
  date?: string
}

/** A date ("2026-10-20") as the moment its day starts in UTC, for formatting it in UTC. */
const utcDay = (date: string) => {
  const [y, m, d] = date.split("-").map(Number)
  return new Date(Date.UTC(y, (m || 1) - 1, d || 1))
}

/** "Tuesday 20 October", as the booking pages write a day: no comma after the weekday. */
const longDay = (d: Date, tz: string) => {
  const parts = dateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: tz }).formatToParts(d)
  const part = (t: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === t)?.value ?? ""
  return `${part("weekday")} ${part("day")} ${part("month")}`
}

/** The zone's name as the guest's device writes it: "British Summer Time". */
export function zoneName(at: Date, tz: string): string {
  try {
    return dateTimeFormat("en-GB", { timeZone: tz, timeZoneName: "long" }).formatToParts(at).find((p) => p.type === "timeZoneName")?.value ?? tz
  } catch {
    return tz
  }
}

export function invitationWhen(start: WhenOfInvitation, end: WhenOfInvitation, allDay: boolean, tz: string): { day: string; time: string; zone: string } {
  if (allDay && start.date) {
    const first = utcDay(start.date)
    // The end date is the day after the last.
    const last = end.date ? new Date(utcDay(end.date).getTime() - 86_400_000) : first
    const day = last > first ? `${longDay(first, "UTC")} – ${longDay(last, "UTC")}` : longDay(first, "UTC")
    return { day, time: "All day", zone: "" }
  }
  const a = new Date(start.at ?? "")
  const b = new Date(end.at ?? start.at ?? "")
  if (Number.isNaN(a.getTime())) return { day: "", time: "", zone: "" }
  return { day: longDay(a, tz), time: clockRange(a, b, { timeZone: tz }), zone: zoneName(a, tz) }
}
