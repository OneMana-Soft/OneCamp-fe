/**
 * An event's reminders in words (calendar A5): minutes before it starts, or
 * for an all-day event before 00:00 of its first day in the reader's zone
 * (900 is 09:00 the day before, -540 is 09:00 on the day). The card's menu
 * offers a few of each, as Google's does. A time of day is written on the
 * reader's own clock (lib/utils/date/clock): "9:00 AM" or "09:00".
 */

import { clockTime } from "@/lib/utils/date/clock"

/** A choice in the Reminders menu: minutes before, or null for no reminder. */
export interface ReminderChoice {
  minutes: number | null
  label: string
}

/** What the card's menu offers for a timed event (STEP4_PLAN §4 #5). */
export const TIMED_CHOICES: ReminderChoice[] = [
  { minutes: null, label: "No reminder" },
  { minutes: 0, label: "At the start" },
  { minutes: 5, label: "5 minutes before" },
  { minutes: 10, label: "10 minutes before" },
  { minutes: 30, label: "30 minutes before" },
  { minutes: 60, label: "1 hour before" },
  { minutes: 24 * 60, label: "1 day before" },
]

/** What the menu offers for an all-day event, before 00:00 of its first day: 09:00 on it, the day before, 2 days or a week before. */
const ALL_DAY_MINUTES = [-540, 900, 2340, 9540]

/** And their words, a time of day on the reader's clock, on the event's day or before it. */
export function allDayChoices(): ReminderChoice[] {
  return [{ minutes: null, label: "No reminder" }, ...ALL_DAY_MINUTES.map((m) => ({ minutes: m, label: reminderWords(m, true) }))]
}

/** A time of day, minutes after midnight, on the reader's clock. */
function timeOfDay(minutes: number): string {
  const wall = `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`
  return clockTime(wall)
}

const plural = (n: number, noun: string) => `${n} ${noun}${n === 1 ? "" : "s"}`

/** One reminder in words: "10 minutes before", "At the start", "The day before at 9:00 AM". */
export function reminderWords(minutes: number, allDay: boolean): string {
  if (allDay) {
    // Minutes before 00:00 of the day: a day and a time of day.
    const days = Math.ceil(minutes / (24 * 60))
    const at = timeOfDay(days * 24 * 60 - minutes)
    if (days <= 0) return `On the day at ${at}`
    if (days === 1) return `The day before at ${at}`
    if (days === 7) return `1 week before at ${at}`
    return `${days} days before at ${at}`
  }
  const choice = TIMED_CHOICES.find((c) => c.minutes === minutes)
  if (choice) return choice.label
  if (minutes === 0) return "At the start"
  if (minutes % (7 * 24 * 60) === 0) return `${plural(minutes / (7 * 24 * 60), "week")} before`
  if (minutes % (24 * 60) === 0) return `${plural(minutes / (24 * 60), "day")} before`
  if (minutes % 60 === 0) return `${plural(minutes / 60, "hour")} before`
  return `${plural(minutes, "minute")} before`
}

/** An event's reminders in a line: the first, and how many more ("10 minutes before, +1"); "No reminder". */
export function remindersLine(minutes: number[], allDay: boolean): string {
  if (!minutes.length) return "No reminder"
  const first = reminderWords(minutes[0], allDay)
  return minutes.length > 1 ? `${first}, +${minutes.length - 1}` : first
}

/** The choices for an event, its own reminder among them when it isn't one (set elsewhere: the panel, Google). */
export function reminderChoices(current: number[], allDay: boolean): ReminderChoice[] {
  const base = allDay ? allDayChoices() : TIMED_CHOICES
  const extra = current.filter((m) => !base.some((c) => c.minutes === m)).map((m) => ({ minutes: m, label: reminderWords(m, allDay) }))
  return [...base, ...extra]
}

/** The furthest ahead a reminder may come: four weeks, as Google's. */
export const MAX_REMINDER_MINUTES = 4 * 7 * 24 * 60

/** The units a custom reminder is written in, and their minutes. */
export const CUSTOM_UNITS = [
  { unit: "minutes", minutes: 1 },
  { unit: "hours", minutes: 60 },
  { unit: "days", minutes: 24 * 60 },
  { unit: "weeks", minutes: 7 * 24 * 60 },
] as const

export type CustomUnit = (typeof CUSTOM_UNITS)[number]["unit"]

/** A reminder in the largest unit that writes it whole: 90 is 90 minutes, 120 is 2 hours. Pure. */
export function customOf(minutes: number): { count: number; unit: CustomUnit } {
  const fit = [...CUSTOM_UNITS].reverse().find((u) => minutes > 0 && minutes % u.minutes === 0) ?? CUSTOM_UNITS[0]
  return { count: minutes / fit.minutes, unit: fit.unit }
}

/** A custom reminder's minutes, or null when it isn't a whole count from 0 to four weeks. Pure. */
export function customMinutes(count: number, unit: CustomUnit): number | null {
  const per = CUSTOM_UNITS.find((u) => u.unit === unit)?.minutes ?? 1
  const minutes = count * per
  return Number.isInteger(count) && minutes >= 0 && minutes <= MAX_REMINDER_MINUTES ? minutes : null
}

/** Those of email that are still reminders, sorted, once each: what a change keeps by email. Pure. */
export function keepEmail(email: readonly number[] | undefined, minutes: readonly number[]): number[] {
  return [...new Set((email ?? []).filter((m) => minutes.includes(m)))].sort((a, b) => a - b)
}

/** A set of default reminders, minutes before, with those of them by email (calendar.default_reminders). */
export interface ReminderSet {
  minutes: number[]
  email?: number[]
}

/** A person's defaults for one calendar: for its timed events and its all-day ones. */
export interface ReminderDefaults {
  timed?: ReminderSet
  all_day?: ReminderSet
}

/** The preference that keeps them: { "mine" | a calendar's id: ReminderDefaults }. */
export const DEFAULT_REMINDERS_KEY = "calendar.default_reminders"

/** "mine": my own calendar, and invitations on one with no defaults. */
export const DEFAULTS_MINE = "mine"

/** A new event's default reminders on a calendar ("" is mine), as the server's defaultsFor: that calendar's, "mine", D-CAL-4's. Pure. */
export function defaultRemindersFor(all: unknown, calendarId: string, allDay: boolean): { minutes: number[]; email: number[] } {
  const kept = (all && typeof all === "object" ? all : {}) as Record<string, ReminderDefaults | undefined>
  const pick = (d?: ReminderDefaults) => (allDay ? d?.all_day : d?.timed)
  const set = pick(kept[calendarId || DEFAULTS_MINE]) ?? pick(kept[DEFAULTS_MINE])
  if (!set) return { minutes: allDay ? [900] : [10], email: [] }
  return { minutes: set.minutes, email: keepEmail(set.email, set.minutes) }
}
