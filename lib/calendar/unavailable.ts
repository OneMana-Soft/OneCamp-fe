import { apiErrorCode, apiErrorMessage } from "@/lib/utils/apiError"

/**
 * The calendar's codes for a moment it can't answer (calendar A1): its
 * events moving to its one store ("calendar_moving"), or the store not
 * switched on on this server ("calendar_off"). Both come with words for
 * people.
 */
const AWAY = new Set(["calendar_moving", "calendar_off"])

/**
 * The server's words when the calendar can't answer for now ("The calendar
 * is being moved to its new store. Try again in a minute."), for a view that
 * failed to load to say in place of its guess about the connection, which
 * would be wrong; undefined for any other failure. Pure.
 */
export function calendarAwayDetail(error: unknown): string | undefined {
  if (!AWAY.has(apiErrorCode(error))) return undefined
  return apiErrorMessage(error) || undefined
}
