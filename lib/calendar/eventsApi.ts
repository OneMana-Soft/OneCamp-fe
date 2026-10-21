/**
 * The calendar's own API (/calendar/events, calendar A1), for what the
 * /event routes can't say: an event's sequence (a write names the one it
 * changed: CAL2), how a series repeats, and the scope of a change to one of
 * its instances (D-CAL-6). The web asks it only where the server says events
 * repeat (FEATURE_CALENDAR_REPEATS); the calendar's lists stay on the /event
 * routes until A7's surfaces move them. Pure: request descriptions for
 * usePost and the URL for useFetch.
 */

import type { RepeatScope } from "@/lib/calendar/repeat"

// The API's path (router/calendarProgramme.go). It sits here, not in
// services/endPoints.ts, which every route's first load carries (PROGRAM.md
// §3.6): only the calendar's screens reach this file. usePost names an
// endpoint by that file's enum, so the path is cast to it.
const CALENDAR_EVENTS = "/calendar/events" as string as string

/** A time as the API takes and gives it: an instant in a zone, or a date for an all-day event. */
export interface ApiWhen {
  at?: string
  zone?: string
  date?: string
}

/** A guest's answer: none yet, yes, no or maybe. */
export type ApiResponse = "needs_action" | "accepted" | "declined" | "tentative"

/**
 * A guest as the API sends one: a member (user_uuid), or someone invited by
 * email (email, and the name they were invited by as user_name). `invite`,
 * to the organiser alone, says whether a guest by email was emailed their
 * invitation.
 */
export interface ApiAttendee {
  user_uuid?: string
  user_name?: string
  user_full_name?: string
  user_profile_object_key?: string
  email?: string
  role: string
  response: ApiResponse
  note?: string
  responded_at?: string
  invite?: "sent" | "not_sent" | "failed"
}

/** An event as the API sends it (business/Calendar Event): the fields the web reads. */
export interface ApiEvent {
  id: string
  series_id?: string
  recurrence_id?: ApiWhen
  recurrence?: { rule: string; text?: string }
  kind: string
  title: string
  notes: string
  location: string
  start: ApiWhen
  end: ApiWhen
  all_day: boolean
  sequence: number
  attendees: ApiAttendee[]
  organiser: { user_uuid: string }
  /** Its colour (one of the camp hues; none for its calendar's), busy or free, and who may see it. */
  hue?: string
  transparency?: "opaque" | "transparent"
  visibility?: "default" | "public" | "private"
  /** What its guests may do: change it, invite others, see who else is on it. */
  guests_can_modify?: boolean
  guests_can_invite?: boolean
  guests_can_see_guests?: boolean
  /** The organiser's "Email me when guests answer", told to them alone. */
  email_on_answers?: boolean
}

/** A guest's role: required, or optional (Google's "Mark optional"). */
export type ApiGuestRole = "required" | "optional"

/** A guest named in a write: a member by id, or anyone by email; with no role, a guest kept keeps theirs. */
export type ApiGuestInput = { user_uuid: string; role?: ApiGuestRole } | { email: string; name?: string; role?: ApiGuestRole }

/** "Tell guests?": "none" is Don't send (in-app notices still go). */
export type ApiNotify = "none" | undefined

/** A guest's answer, as the API takes it. */
export type Answer = "accepted" | "declined" | "tentative"

/** A change, as the API takes it: what is sent is set, what is left out stays (CAL2). */
export interface ApiEventPatch {
  sequence: number
  scope?: RepeatScope
  kind?: string
  title?: string
  notes?: string
  location?: string
  start?: ApiWhen
  end?: ApiWhen
  attendees?: ApiGuestInput[]
  recurrence?: { rule: string }
  hue?: string
  transparency?: "opaque" | "transparent"
  visibility?: "default" | "public" | "private"
  guests_can_modify?: boolean
  guests_can_invite?: boolean
  guests_can_see_guests?: boolean
  notify?: ApiNotify
  email_on_answers?: boolean
}

/** A new event, as the API takes it. */
export interface ApiEventInput {
  kind?: string
  title: string
  notes?: string
  location?: string
  start: ApiWhen
  end: ApiWhen
  attendees?: ApiGuestInput[]
  recurrence?: { rule: string }
  hue?: string
  transparency?: "opaque" | "transparent"
  visibility?: "default" | "public" | "private"
  guests_can_modify?: boolean
  guests_can_invite?: boolean
  guests_can_see_guests?: boolean
  sync_to_google?: boolean
  notify?: ApiNotify
  email_on_answers?: boolean
}

/** The reader's own zone: the one a series keeps its time in. */
export function readerZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"
  } catch {
    return "UTC"
  }
}

/** The URL useFetch reads one event, series or instance from. */
export function apiEventUrl(id: string): string {
  return `${CALENDAR_EVENTS}/${encodeURIComponent(id)}`
}

/** One event, series or instance, as it is now: quiet, its reader says what went wrong. */
export function readApiEventRequest(id: string) {
  return { method: "GET", apiEndpoint: CALENDAR_EVENTS, appendToUrl: `/${encodeURIComponent(id)}`, quiet: true } as const
}

export function createApiEventRequest(input: ApiEventInput) {
  return {
    method: "POST",
    apiEndpoint: CALENDAR_EVENTS,
    payload: input,
    showErrorToast: true,
    failureTitle: "Couldn't create the event",
  } as const
}

export function patchApiEventRequest(id: string, patch: ApiEventPatch) {
  return {
    method: "PATCH",
    apiEndpoint: CALENDAR_EVENTS,
    appendToUrl: `/${encodeURIComponent(id)}`,
    payload: patch,
    showErrorToast: true,
    failureTitle: "Couldn't save the event",
  } as const
}

/** A delete, for the scope picked; at the version read when it is named, else whatever it is now. */
export function deleteApiEventRequest(id: string, scope: RepeatScope, sequence?: number, notify?: ApiNotify) {
  const query = new URLSearchParams({ scope })
  if (sequence !== undefined) query.set("sequence", String(sequence))
  if (notify) query.set("notify", notify)
  return {
    method: "DELETE",
    apiEndpoint: CALENDAR_EVENTS,
    appendToUrl: `/${encodeURIComponent(id)}?${query}`,
    showErrorToast: true,
    failureTitle: "Couldn't delete the event",
  } as const
}

/**
 * A guest's answer to an event (calendar A2): for all of it, or with scope
 * "this" for one instance of a series alone. A note left out stays as it was
 * (the card's tap); "" clears it. Quiet: the answer is shown at once, and its
 * control says itself when it couldn't be sent.
 */
export function answerEventRequest(id: string, answer: Answer, opts: { note?: string; scope?: "this" | "all" } = {}) {
  return {
    method: "POST",
    apiEndpoint: CALENDAR_EVENTS,
    appendToUrl: `/${encodeURIComponent(id)}/answer`,
    payload: { answer, scope: opts.scope ?? "", ...(opts.note === undefined ? {} : { note: opts.note }) },
    quiet: true,
  } as const
}

/** Asks again every guest who hasn't answered (the organiser's). */
export function nudgeGuestsRequest(id: string) {
  return {
    method: "POST",
    apiEndpoint: CALENDAR_EVENTS,
    appendToUrl: `/${encodeURIComponent(id)}/nudge`,
    showErrorToast: true,
    failureTitle: "Couldn't ask your guests again",
  } as const
}

/** A person's reminders for an event, as the API answers them. */
export interface ApiReminders {
  minutes: number[]
  default: boolean
}

/**
 * Sets the reader's own reminders for an event or series (an instance's are
 * its series'): null goes back to the default, [] is none. Saved without a
 * toast (STEP4_PLAN §4 #5); the row says itself when it couldn't be.
 */
export function setRemindersRequest(id: string, minutes: number[] | null) {
  return {
    method: "PUT",
    apiEndpoint: CALENDAR_EVENTS,
    appendToUrl: `/${encodeURIComponent(id)}/reminders`,
    payload: { minutes },
    quiet: true,
  } as const
}

/** Brings a reminder back: in five minutes, when it starts, or a minute before. */
export function snoozeReminderRequest(id: string, until: "5m" | "start" | "1m") {
  return {
    method: "POST",
    apiEndpoint: CALENDAR_EVENTS,
    appendToUrl: `/${encodeURIComponent(id)}/snooze`,
    payload: { until },
  } as const
}

/** A guest by email's answer link, for the organiser to share themselves. */
export function guestLinkRequest(id: string, email: string) {
  return {
    method: "POST",
    apiEndpoint: CALENDAR_EVENTS,
    appendToUrl: `/${encodeURIComponent(id)}/guest-link`,
    payload: { email },
    showErrorToast: true,
    failureTitle: "Couldn't copy their link",
  } as const
}
