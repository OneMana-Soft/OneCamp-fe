import { localDate } from "@/lib/calendar/allDay"
import type { ApiWhen } from "@/lib/calendar/eventsApi"

// The reader's own events deleted in the last 30 days, newest first, 50 a read (business/Calendar trashPage,
// trashDays). Nothing is deleted for good: an older one stays deleted, unlisted.
export const TRASH_PAGE = 50
export const TRASH_DAYS = 30

export interface TrashedEvent {
  id: string
  title: string
  start: ApiWhen
  end: ApiWhen
  all_day: boolean
  hue?: string
  deleted_at?: string
  deleted_by?: { user_uuid?: string; user_name?: string; user_full_name?: string }
}

/**
 * Where the next page starts: after the last row seen, by its deletion and its id exactly as the trash gave it (an
 * event's, or an instance's "<series>_<start>"). Events deleted at once share their deletion, so it alone let a page
 * boundary skip the rest of them (V-603); the server orders by both.
 */
export interface TrashAfter {
  before: string
  before_id: string
}

/** The first page, or the one after the last row seen; quiet, as the sheet says a failure. */
export function trashReadRequest(after?: TrashAfter) {
  const query = after ? `?before=${encodeURIComponent(after.before)}&before_id=${encodeURIComponent(after.before_id)}` : ""
  return { method: "GET", apiEndpoint: "/calendar/events", appendToUrl: `/trash${query}`, quiet: true } as const
}

/** A full page's last row, else none (all read). */
export function nextBefore(page: TrashedEvent[]): TrashAfter | undefined {
  const last = page.length >= TRASH_PAGE ? page[page.length - 1] : undefined
  return last?.deleted_at ? { before: last.deleted_at, before_id: last.id } : undefined
}

/** Quiet, as the row says how it went. */
export function restoreEventRequest(id: string) {
  return { method: "POST", apiEndpoint: "/calendar/events", appendToUrl: `/${encodeURIComponent(id)}/restore`, quiet: true } as const
}

/** A timed event by its instants, an all-day one by its dates (as the grid reads them, lib/calendar/allDay). */
export function trashedWindow(e: TrashedEvent): { from: Date; to: Date } {
  const at = (w: ApiWhen) => (w.at ? new Date(w.at) : (localDate(w.date) ?? new Date(NaN)))
  const from = at(e.start)
  const to = at(e.end)
  return { from, to: isNaN(to.getTime()) ? from : to }
}
