/**
 * Other people's working hours, in their own zones (calendar A3): read once
 * for the people an event names (POST /event/hours), and what follows from
 * them: whether a time falls in someone's hours, and what time it is for
 * them. Someone who keeps no hours is never "outside" them. Pure, but for
 * the hook.
 */
import useSWR from "swr"
import axiosInstance, { OWN_ERRORS } from "@/lib/axiosInstance"
import { clockTime } from "@/lib/utils/date/clock"
import type { Week } from "@/lib/calendar/workingHours"
import { CalendarPost } from "@/services/endpoints/calendar"

export interface PersonHours {
  tz: string
  week: Week
}

/** The wall-clock weekday and minutes of an instant in a zone. */
function wallClock(at: Date, tz: string): { day: number; minutes: number } {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: tz, weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(at)
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? ""
  const day = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(get("weekday"))
  return { day, minutes: Number(get("hour")) * 60 + Number(get("minute")) }
}

const minutesOf = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number)
  return h * 60 + m
}

/** Whether start to end falls inside one of the person's ranges, that day, in their zone. */
export function inHours(hours: PersonHours, start: Date, end: Date): boolean {
  const s = wallClock(start, hours.tz)
  const e = wallClock(new Date(end.getTime() - 1), hours.tz)
  if (s.day !== e.day) return false
  return (hours.week[String(s.day)] ?? []).some((span) => s.minutes >= minutesOf(span.start) && e.minutes + 1 <= minutesOf(span.end))
}

/** The time an instant is for someone, in their zone, on the reader's clock ("21:00", "9:00 PM"). */
export function theirTime(at: Date, tz: string): string {
  const { minutes } = wallClock(at, tz)
  return clockTime(new Date(2000, 0, 1, Math.floor(minutes / 60), minutes % 60))
}

/** Whether an instant reads differently on someone's wall clock than on the reader's. */
export function zoneDiffers(at: Date, tz: string): boolean {
  const theirs = wallClock(at, tz)
  return theirs.day !== at.getDay() || theirs.minutes !== at.getHours() * 60 + at.getMinutes()
}

/** The kept hours of these people, by id (those who keep none are left out). */
export function usePeopleHours(people: string[]): Record<string, PersonHours> | undefined {
  const ids = [...new Set(people.filter(Boolean))].sort()
  const { data } = useSWR(ids.length ? [CalendarPost.PeopleHours, ids.join(",")] : null, async () => {
    const res = await axiosInstance.post(CalendarPost.PeopleHours, { people: ids }, OWN_ERRORS)
    return (res.data?.data ?? {}) as Record<string, PersonHours>
  })
  return data
}
