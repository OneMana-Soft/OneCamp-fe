/**
 * Save for later: the reminder choices offered, and how a reminder time reads.
 *
 * Times are the person's own clock (the browser's), sent to the server as an
 * instant. The choices are few on purpose: "later today", "tomorrow morning",
 * "next week" cover almost every real case, and a picker handles the rest.
 */

import { format } from "date-fns"
import { shortDate, shortTime } from "@/lib/utils/date/shortDate"

export type LaterItemType = "post" | "comment" | "chat" | "task" | "doc" | "project" | "board"

interface ReminderChoice {
  key: string
  label: string
  /** Short time shown on the right of the menu item, e.g. "9:00 AM" or "Mon". */
  hint: string
  at: Date
}

const MORNING_HOUR = 9

function atHour(d: Date, hour: number): Date {
  const x = new Date(d)
  x.setHours(hour, 0, 0, 0)
  return x
}

function addDays(d: Date, n: number): Date {
  const x = new Date(d)
  x.setDate(x.getDate() + n)
  return x
}

function time(d: Date): string {
  return shortTime(d)
}

function weekday(d: Date): string {
  return format(d, "EEE")
}

/** The quick reminder choices, as of now. */
export function reminderChoices(now: Date): ReminderChoice[] {
  const inAnHour = new Date(now.getTime() + 60 * 60 * 1000)
  inAnHour.setSeconds(0, 0)
  const tomorrow = atHour(addDays(now, 1), MORNING_HOUR)
  // Next Monday; on a Monday, the one after.
  const toMonday = ((8 - now.getDay()) % 7) || 7
  const nextWeek = atHour(addDays(now, toMonday), MORNING_HOUR)

  const choices: ReminderChoice[] = [{ key: "hour", label: "In 1 hour", hint: time(inAnHour), at: inAnHour }]
  // "This evening" only while it is still ahead and not almost the same as "in 1 hour".
  const evening = atHour(now, 18)
  if (evening.getTime() - now.getTime() > 2 * 60 * 60 * 1000) {
    choices.push({ key: "evening", label: "This evening", hint: time(evening), at: evening })
  }
  choices.push({ key: "tomorrow", label: "Tomorrow morning", hint: `${weekday(tomorrow)} ${time(tomorrow)}`, at: tomorrow })
  // Tomorrow is Monday: "next week" would say the same thing twice.
  if (toMonday !== 1) {
    choices.push({ key: "week", label: "Next week", hint: `${weekday(nextWeek)} ${time(nextWeek)}`, at: nextWeek })
  }
  return choices
}

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

/** How a reminder reads in the list: "Due", "Today, 3:00 PM", "Tomorrow, 9:00 AM", "Mon, 9:00 AM", "5 Oct". */
export function reminderLabel(at: Date, now: Date): { text: string; due: boolean } {
  if (at.getTime() <= now.getTime()) return { text: "Due", due: true }
  if (sameDay(at, now)) return { text: `Today, ${time(at)}`, due: false }
  if (sameDay(at, addDays(now, 1))) return { text: `Tomorrow, ${time(at)}`, due: false }
  const days = (atHour(at, 0).getTime() - atHour(now, 0).getTime()) / 86_400_000
  if (days < 7) return { text: `${weekday(at)}, ${time(at)}`, due: false }
  return { text: shortDate(at, now), due: false }
}

/** A value for <input type="datetime-local"> in the person's own time. */
export function toLocalInput(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

/** Where a saved message opens: its thread, which shows the message itself. */
export function messageLink(opts: { channelUUID?: string; postUUID?: string; chatUUID?: string; groupUUID?: string; chatMessageID?: string }): string | null {
  const { channelUUID, postUUID, chatUUID, groupUUID, chatMessageID } = opts
  if (channelUUID && postUUID) return `/app/channel/${channelUUID}/${postUUID}`
  if (groupUUID && chatMessageID) return `/app/chat/group/${groupUUID}/${chatMessageID}`
  if (chatUUID && chatMessageID) return `/app/chat/${chatUUID}/${chatMessageID}`
  return null
}
