/**
 * The calendars someone may see (calendar A6, GET /calendar/calendars): their
 * own, then each project's and those shared with them, with what they may do
 * on each. One read, kept by SWR, for every place that lists them.
 */

import { useFetch } from "@/hooks/useFetch"
import { OWN_ERRORS } from "@/lib/axiosInstance"

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
}

export const calendarListUrl = "/calendar/calendars"

/** None yet: one list, so what is worked out from it isn't worked out again on every render. */
const NONE: CalendarView[] = []

/** The calendars someone may see; none until they're read. */
export function useCalendarList(): CalendarView[] {
  const res = useFetch<{ data?: CalendarView[] }>(calendarListUrl, undefined, undefined, OWN_ERRORS)
  return Array.isArray(res.data?.data) ? res.data.data : NONE
}
