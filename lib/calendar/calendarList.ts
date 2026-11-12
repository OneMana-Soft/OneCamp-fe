/**
 * The calendars someone may see (calendar A6, GET /calendar/calendars): their
 * own, then each project's and those shared with them, with what they may do
 * on each. One read, kept by SWR, for every place that lists them.
 */

import { useFetch } from "@/hooks/useFetch"
import { OWN_ERRORS } from "@/lib/axiosInstance"
import { SYNC, type SyncProvider } from "@/lib/calendar/syncProviders"

/** Where a calendar's events come from (V-594): moved from Google or Outlook and kept in step, read from an address, or OneCamp's own. */
export type CalendarSource = SyncProvider | "ics" | "onecamp"

export interface CalendarView {
  id: string
  name: string
  kind: "personal" | "external" | "project" | string
  hue?: string
  container_kind?: string
  container_id?: string
  access: "manage" | "edit" | "view"
  /** The person's own: theirs, and those an import made them. */
  mine?: boolean
  /** Where its events come from; a server that doesn't say is OneCamp's own. */
  source?: CalendarSource
  /** Its provider lets OneCamp only read it (see-only there, or read from an address): no new event goes on it. */
  read_only?: boolean
}

export const calendarListUrl = "/calendar/calendars"

/** None yet: one list, so what is worked out from it isn't worked out again on every render. */
const NONE: CalendarView[] = []

/** The calendars someone may see; none until they're read. */
export function useCalendarList(): CalendarView[] {
  const res = useFetch<{ data?: CalendarView[] }>(calendarListUrl, undefined, undefined, OWN_ERRORS)
  return Array.isArray(res.data?.data) ? res.data.data : NONE
}

/**
 * A calendar a new event may go on, as far as the reader and its provider go
 * (V-594): one they may add to, and not one Google or Outlook lets OneCamp
 * only read, whose push would be refused. Pure.
 */
export function mayAddEventTo(c: Pick<CalendarView, "access" | "read_only">): boolean {
  return c.access !== "view" && !c.read_only
}

/** "Read-only in Google" (or Outlook) for a calendar its provider lets OneCamp only read; "" for any other. Pure. */
export function readOnlyIn(c: Pick<CalendarView, "source" | "read_only">): string {
  return c.read_only && (c.source === "google" || c.source === "microsoft") ? `Read-only in ${SYNC[c.source].name}` : ""
}

/** The server's words when a new event's calendar is read-only in its provider (409 calendar_read_only), else "". Pure. */
export function readOnlyRefusal(e: unknown): string {
  const res = (e as { response?: { status?: number; data?: { code?: unknown; msg?: unknown } } })?.response
  return res?.status === 409 && res.data?.code === "calendar_read_only" && typeof res.data.msg === "string" ? res.data.msg : ""
}
