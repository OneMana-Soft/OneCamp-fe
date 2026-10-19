import { parseISO } from "date-fns"
import type { PickedPerson } from "@/components/common/peoplePicker"
import { placedByDates } from "@/lib/calendar/allDay"
import { displayNameOf } from "@/lib/personName"
import type { CalendarEventInterface } from "@/types/calendar"

/** What the new-event dialog opens with: quick create's values, or a copy of an event. */
export interface EventDraftValues {
  title: string
  start: Date
  end: Date
  isFocus: boolean
  isAway?: boolean
  guests: PickedPerson[]
  description?: string
}

/**
 * Notes without a link: an anchor to it goes whole, its address goes wherever
 * else it is written, and so does a paragraph or a line it leaves empty. Pure.
 */
function withoutLink(notes: string, link: string): string {
  const address = link.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  return notes
    .replace(new RegExp(`<a\\b[^>]*\\bhref=(["'])${address}\\1[^>]*>[\\s\\S]*?</a>`, "gi"), "")
    .split(link)
    .join("")
    .replace(/<p>(?:\s|&nbsp;|<br\s*\/?>)*<\/p>/gi, "")
    .replace(/^[ \t]+$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

/**
 * A copy of an event, for the new-event dialog (Duplicate; EV-58): its title,
 * times, kind, guests and notes, as Google Calendar's Duplicate opens one, and
 * never its call link (`callLink`, the link its card joins): a copy of a
 * meeting gets a call of its own. Guests invited by email are copied too. A Google all-day event keeps its dates
 * (CAL-BUG-2); the person duplicating isn't their own guest. Pure.
 */
export function duplicateOf(event: CalendarEventInterface, callLink: string | null, self?: string): EventDraftValues {
  const placed = placedByDates(event)
  const notes = event.event_description ?? ""
  return {
    title: event.event_title,
    start: parseISO(placed.event_start_time),
    end: parseISO(placed.event_end_time),
    isFocus: !!event.event_is_focus,
    isAway: !!event.event_is_away,
    guests: [
      ...(event.event_participants ?? []).filter((p) => p.user_uuid && p.user_uuid !== self).map((p) => ({ uuid: p.user_uuid, name: displayNameOf(p) || "Someone" })),
      // Guests invited by email come too (calendar A2).
      ...(event.event_guests ?? []).filter((g) => !g.user_uuid && g.email).map((g) => ({ uuid: "", name: g.name || g.email!, email: g.email!.toLowerCase() })),
    ],
    description: callLink ? withoutLink(notes, callLink) : notes,
  }
}
