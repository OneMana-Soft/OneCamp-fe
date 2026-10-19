/**
 * The one Event Form's values (calendar FORM, the Event Form of A7): what the
 * full dialog, the right panel and the phone's page edit, read from the
 * calendar's own API and written back to it, every field once. Pure.
 *
 * An all-day event keeps its first and last days (the API's end date is the
 * day after the last, as Google's); a timed one its instants and the zone
 * they were planned in, with an end zone of its own for a flight. Guests are
 * required or optional; the reader's own reminders (A5) are saved beside the
 * event, through their own route.
 */

import { addDays, differenceInCalendarDays, format, parseISO, startOfDay } from "date-fns"
import type { ApiEvent, ApiEventInput, ApiEventPatch, ApiGuestInput, ApiResponse, ApiWhen } from "@/lib/calendar/eventsApi"
import { wholeDays } from "@/lib/timeOff"
import type { CalendarEventInterface } from "@/types/calendar"
import { displayNameOf } from "@/lib/personName"
import { notesText, notesToSave } from "@/lib/calendar/notes"

/** What an event is: a meeting, focus time, or time off. */
export type FormKind = "event" | "focus" | "out_of_office"
export type ShowAs = "busy" | "free"
export type Visibility = "default" | "public" | "private"

/** A guest as the form holds one: a member by uuid, or someone by email. */
export interface FormGuest {
  /** A member's uuid; "" for someone invited by email. */
  uuid: string
  email: string
  name: string
  optional: boolean
  /** Their answer, as the event has it; none for someone just added. */
  response?: ApiResponse
}

export interface EventFormValues {
  kind: FormKind
  title: string
  allDay: boolean
  /** A timed event's instants. */
  start: Date
  end: Date
  /** An all-day event's first and last days ("YYYY-MM-DD"), the last included. */
  startDate: string
  lastDate: string
  /** The zone its times are planned in, and the end's when it differs ("" for the same). */
  zone: string
  endZone: string
  /** How it repeats, as an RFC 5545 rule; "" for not at all. */
  rule: string
  guests: FormGuest[]
  location: string
  /** The notes as text, line breaks and all (lib/calendar/notes). */
  notes: string
  /** The notes as the calendar kept them when the form opened: rich text or plain, which a change keeps. */
  notesKept: string
  /** One of the camp hues, or "" for its calendar's own colour. */
  hue: string
  showAs: ShowAs
  visibility: Visibility
  guestsCanModify: boolean
  guestsCanInvite: boolean
  guestsCanSeeGuests: boolean
  emailOnAnswers: boolean
  /** The reader's own reminders, minutes before; null for the default's. */
  reminders: number[] | null
  syncToGoogle: boolean
}

const DAY = "yyyy-MM-dd"
const day = (d: Date) => format(d, DAY)

/** The next round hour after now, for an hour: where a new event starts. */
export function nextHour(now: Date): { start: Date; end: Date } {
  const start = new Date(now)
  start.setMinutes(0, 0, 0)
  if (start <= now) start.setHours(start.getHours() + 1)
  return { start, end: new Date(start.getTime() + 60 * 60 * 1000) }
}

/** A new event's values: at start (or the next round hour), for an hour, in zone. */
export function newEventValues(zone: string, now: Date, at?: { start: Date; end?: Date }): EventFormValues {
  const span = at ? { start: at.start, end: at.end ?? new Date(at.start.getTime() + 60 * 60 * 1000) } : nextHour(now)
  return {
    kind: "event",
    title: "",
    allDay: false,
    start: span.start,
    end: span.end,
    startDate: day(span.start),
    lastDate: day(span.start),
    zone,
    endZone: "",
    rule: "",
    guests: [],
    location: "",
    notes: "",
    notesKept: "",
    hue: "",
    showAs: "busy",
    visibility: "default",
    guestsCanModify: false,
    guestsCanInvite: true,
    guestsCanSeeGuests: true,
    emailOnAnswers: false,
    reminders: null,
    syncToGoogle: false,
  }
}

/** An instant or a date the API sent, as a Date (a date at local midnight). */
function dateOf(w: ApiWhen | undefined): Date | null {
  if (w?.at) return new Date(w.at)
  if (w?.date) return parseISO(w.date)
  return null
}

const kindOf = (k: string): FormKind => (k === "focus" || k === "out_of_office" ? k : "event")

/** An event's values as the API gave it, with the reader's reminders (null for the default's). */
export function eventValues(e: ApiEvent, reminders: number[] | null, zone: string): EventFormValues {
  const start = dateOf(e.start) ?? new Date()
  const endRaw = dateOf(e.end) ?? new Date(start.getTime() + 60 * 60 * 1000)
  // An all-day end date is the day after the last.
  const last = e.all_day ? addDays(startOfDay(endRaw), -1) : endRaw
  const startZone = e.start.zone || zone
  return {
    kind: kindOf(e.kind),
    title: e.title,
    allDay: !!e.all_day,
    start: e.all_day ? new Date(start.getFullYear(), start.getMonth(), start.getDate(), 9) : start,
    end: e.all_day ? new Date(start.getFullYear(), start.getMonth(), start.getDate(), 10) : endRaw,
    startDate: day(start),
    lastDate: day(last < start ? start : last),
    zone: startZone,
    endZone: e.end.zone && e.end.zone !== startZone ? e.end.zone : "",
    rule: e.recurrence?.rule ?? "",
    guests: (e.attendees ?? []).map((a) => ({
      uuid: a.user_uuid ?? "",
      email: a.email ?? "",
      name: displayNameOf({ user_name: a.user_name, user_full_name: a.user_full_name }) || a.email || "",
      optional: a.role === "optional",
      response: a.response,
    })),
    location: e.location ?? "",
    notes: notesText(e.notes),
    notesKept: e.notes ?? "",
    hue: e.hue ?? "",
    showAs: e.transparency === "transparent" ? "free" : "busy",
    visibility: e.visibility === "public" || e.visibility === "private" ? e.visibility : "default",
    guestsCanModify: !!e.guests_can_modify,
    guestsCanInvite: e.guests_can_invite ?? true,
    guestsCanSeeGuests: e.guests_can_see_guests ?? true,
    emailOnAnswers: !!e.email_on_answers,
    reminders,
    syncToGoogle: false,
  }
}

/** The reader's own reminders on an event as the calendar lists it: null where they set none (the default's). */
export function ownReminders(e: CalendarEventInterface): number[] | null {
  return e.event_reminders_default || !e.event_reminders ? null : e.event_reminders
}

/**
 * An event's values as the calendar lists it, for a server with the old
 * stores (or before the calendar's API answers): what the /event routes
 * keep, its members as guests.
 */
export function listedValues(e: CalendarEventInterface, zone: string): EventFormValues {
  const start = new Date(e.event_start_time)
  const end = new Date(e.event_end_time)
  return {
    ...newEventValues(zone, start, { start, end }),
    kind: e.event_is_away ? "out_of_office" : e.event_is_focus ? "focus" : "event",
    title: e.event_title,
    notes: notesText(e.event_description),
    notesKept: e.event_description ?? "",
    guests: (e.event_participants ?? []).map((p) => ({ uuid: p.user_uuid, email: "", name: displayNameOf(p), optional: false })),
    reminders: ownReminders(e),
  }
}

/** What stops a save, at its field, in the form's words. */
export type FormProblem = { field: "title" | "end"; message: string }

/** Why the values can't be saved; null when they can. */
export function formProblem(v: EventFormValues): FormProblem | null {
  if (!v.title.trim()) return { field: "title", message: "Give it a title" }
  if (v.title.length > 500) return { field: "title", message: "A title can be up to 500 characters" }
  if (v.allDay) {
    if (v.kind === "focus") return { field: "end", message: "Focus time runs from a time to a time, not whole days" }
    if (v.lastDate < v.startDate) return { field: "end", message: "It has to end on or after the day it starts" }
    return null
  }
  if (v.end.getTime() <= v.start.getTime()) return { field: "end", message: "It has to end after it starts" }
  return null
}

/** The times as the API takes them: dates for all day (the end the day after the last), or instants in their zones. */
export function whenOf(v: EventFormValues): { start: ApiWhen; end: ApiWhen } {
  if (v.allDay) {
    return { start: { date: v.startDate }, end: { date: day(addDays(parseISO(v.lastDate), 1)) } }
  }
  // Time off is whole days, however its times were set.
  const span = v.kind === "out_of_office" ? wholeDays(v.start, v.end) : { start: v.start, end: v.end }
  return {
    start: { at: span.start.toISOString(), zone: v.zone },
    end: { at: span.end.toISOString(), ...(v.endZone && v.endZone !== v.zone ? { zone: v.endZone } : {}) },
  }
}

/** The guests as the API takes them, each in their role. */
export function guestInputs(guests: FormGuest[]): ApiGuestInput[] {
  return guests.map((g) =>
    g.uuid
      ? { user_uuid: g.uuid, role: g.optional ? "optional" : "required" }
      : { email: g.email, ...(g.name && g.name !== g.email ? { name: g.name } : {}), role: g.optional ? "optional" : "required" },
  )
}

/** The notes as a save sends them: as kept when untouched, else the text in the form they were kept in. */
export const savedNotes = (v: EventFormValues) => notesToSave(v.notes, v.notesKept)

/** Focus time and time off are yours: nobody else is on them, and they don't repeat yet. */
const ownTime = (v: EventFormValues) => v.kind !== "event"

/** A new event, as the API takes it. */
export function eventInput(v: EventFormValues): ApiEventInput {
  const { start, end } = whenOf(v)
  return {
    kind: v.kind,
    title: v.title.trim(),
    notes: savedNotes(v),
    location: v.location.trim(),
    start,
    end,
    attendees: ownTime(v) ? [] : guestInputs(v.guests),
    ...(v.rule && !ownTime(v) ? { recurrence: { rule: v.rule } } : {}),
    ...(v.hue ? { hue: v.hue } : {}),
    transparency: v.showAs === "free" ? "transparent" : "opaque",
    visibility: v.visibility,
    guests_can_modify: v.guestsCanModify,
    guests_can_invite: v.guestsCanModify || v.guestsCanInvite,
    guests_can_see_guests: v.guestsCanSeeGuests,
    ...(v.emailOnAnswers && v.guests.length && !ownTime(v) ? { email_on_answers: true } : {}),
    ...(v.syncToGoogle && !v.rule ? { sync_to_google: true } : {}),
  }
}

const sameGuests = (a: FormGuest[], b: FormGuest[]) => {
  const key = (g: FormGuest) => `${g.uuid || `mailto:${g.email.toLowerCase()}`}|${g.optional ? "o" : "r"}`
  const ka = a.map(key).sort()
  const kb = b.map(key).sort()
  return ka.length === kb.length && ka.every((k, i) => k === kb[i])
}

const sameWhen = (a: ApiWhen, b: ApiWhen) => (a.at ?? "") === (b.at ?? "") && (a.zone ?? "") === (b.zone ?? "") && (a.date ?? "") === (b.date ?? "")

/**
 * A change, as the API takes it: only what differs from was, at the version
 * the form was opened on. Guest permissions and "Email me" are the
 * organiser's: a guest's change never names them.
 */
export function eventPatch(v: EventFormValues, was: EventFormValues, sequence: number, organiser: boolean): ApiEventPatch {
  const p: ApiEventPatch = { sequence }
  if (v.kind !== was.kind) p.kind = v.kind
  if (v.title.trim() !== was.title.trim()) p.title = v.title.trim()
  if (v.notes !== was.notes) p.notes = savedNotes(v)
  if (v.location.trim() !== was.location.trim()) p.location = v.location.trim()
  const now = whenOf(v)
  const before = whenOf(was)
  if (!sameWhen(now.start, before.start) || !sameWhen(now.end, before.end)) {
    p.start = now.start
    p.end = now.end
  }
  if (v.rule !== was.rule) p.recurrence = { rule: ownTime(v) ? "" : v.rule }
  if (!sameGuests(v.guests, was.guests)) p.attendees = ownTime(v) ? [] : guestInputs(v.guests)
  if (v.hue !== was.hue) p.hue = v.hue
  if (v.showAs !== was.showAs) p.transparency = v.showAs === "free" ? "transparent" : "opaque"
  if (v.visibility !== was.visibility) p.visibility = v.visibility
  if (organiser) {
    const invite = v.guestsCanModify || v.guestsCanInvite
    if (v.guestsCanModify !== was.guestsCanModify) p.guests_can_modify = v.guestsCanModify
    if (invite !== (was.guestsCanModify || was.guestsCanInvite)) p.guests_can_invite = invite
    if (v.guestsCanSeeGuests !== was.guestsCanSeeGuests) p.guests_can_see_guests = v.guestsCanSeeGuests
    if (v.emailOnAnswers !== was.emailOnAnswers) p.email_on_answers = v.emailOnAnswers
  }
  return p
}

/** Whether a change says anything beyond its version: nothing to send otherwise. */
export function patchChanges(p: ApiEventPatch): boolean {
  return Object.keys(p).some((k) => k !== "sequence" && k !== "scope" && k !== "notify")
}

/** Whether the reader's reminders changed: they are saved through their own route. */
export function remindersChanged(v: EventFormValues, was: EventFormValues): boolean {
  if (v.reminders === null || was.reminders === null) return v.reminders !== was.reminders
  return v.reminders.length !== was.reminders.length || v.reminders.some((m, i) => m !== was.reminders![i])
}

/** Days an all-day event spans, its last included. */
export function daysSpanned(v: EventFormValues): number {
  return differenceInCalendarDays(parseISO(v.lastDate), parseISO(v.startDate)) + 1
}

/**
 * Turns all day on or off, keeping the event where it was: its days become a
 * day's times (09:00–10:00 on the first, or the times it had), and its times
 * become their days.
 */
export function withAllDay(v: EventFormValues, on: boolean): EventFormValues {
  if (on === v.allDay) return v
  if (on) {
    const last = v.end.getTime() > v.start.getTime() ? new Date(v.end.getTime() - 1) : v.start
    return { ...v, allDay: true, startDate: day(v.start), lastDate: day(last < v.start ? v.start : last) }
  }
  const first = parseISO(v.startDate)
  const keepStart = new Date(first.getFullYear(), first.getMonth(), first.getDate(), v.start.getHours(), v.start.getMinutes())
  const length = Math.max(15 * 60_000, v.end.getTime() - v.start.getTime())
  return { ...v, allDay: false, start: keepStart, end: new Date(keepStart.getTime() + Math.min(length, 24 * 60 * 60_000)) }
}

/** Moving the start keeps the length: the end moves with it. */
export function withStart(v: EventFormValues, start: Date): EventFormValues {
  const length = v.end.getTime() - v.start.getTime()
  return { ...v, start, end: new Date(start.getTime() + (length > 0 ? length : 60 * 60 * 1000)) }
}
