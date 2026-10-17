import type { CalendarEventInterface } from "@/types/calendar"

/** The first link in an event's notes: a call to join. Pure. */
export function joinLinkOf(event: Pick<CalendarEventInterface, "event_description">): string | null {
  const m = (event.event_description || "").match(/https?:\/\/[^\s"'<>]+/)
  return m ? m[0] : null
}
