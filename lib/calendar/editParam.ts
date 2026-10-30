/**
 * The event page's ask to open editing, ?edit=1 (calendarRoute's edit: the
 * card's pencil, Edit event, V-34). A module of its own, so the event page
 * reads it without the calendar's whole address rule (lib/calendar/route).
 */
export const EDIT = "edit"

/** Whether an event's page was asked to open editing. Pure. */
export function opensEditing(params: Pick<URLSearchParams, "get">): boolean {
  return params.get(EDIT) === "1"
}
