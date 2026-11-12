import { parseISO } from "date-fns"
import type { PickedPerson } from "@/components/common/peoplePicker"
import { placedByDates } from "@/lib/calendar/allDay"
import { displayNameOf } from "@/lib/personName"
import { isCampHue } from "@/lib/campHue"
import { ownHueVars } from "@/lib/color/ownHue"
import { readApiEventRequest } from "@/lib/calendar/eventsApi"
import { filesOf, type EventFile } from "@/lib/calendar/eventFiles"
import { entitiesRequest, type EntityAnswer } from "@/lib/liveEntity/entitiesRequest"
import type { CalendarEventInterface, CalendarEventTask } from "@/types/calendar"

// The call link a copy leaves out, read here, in the copier's own chunk, not on the calendar's first load.
export { joinLinkOf } from "@/lib/calendar/joinLink"

/** What the new-event dialog opens with: quick create's values, or a copy of an event. */
export interface EventDraftValues {
  title: string
  start: Date
  end: Date
  isFocus: boolean
  isAway?: boolean
  guests: PickedPerson[]
  description?: string
  /** Time for one of your tasks (a task block): the task it is for. */
  task?: CalendarEventTask | null
  /** Its own colour, a camp hue or "#rrggbb" (calendar head B). */
  hue?: string
  /** What it links, each one its copier may open (copiedFiles). */
  files?: EventFile[]
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

/** An own colour as the form takes it: a camp hue, or "#rrggbb" in lower case; anything else is none. */
const ownColour = (hue: string | undefined) => (isCampHue(hue) ? hue : ownHueVars(hue)?.["--own"])

/**
 * A copy of an event, for the new-event dialog (Duplicate; EV-58): its title,
 * times, kind, guests, notes and own colour, as Google Calendar's Duplicate opens one, and
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
    // A copy of a block is time for the same task.
    ...(event.event_task?.task_uuid ? { task: event.event_task } : {}),
    ...(ownColour(event.event_hue) ? { hue: ownColour(event.event_hue) } : {}),
  }
}

/** What a copy carries of the event's files, and what it left off, in words for a toast. */
export interface CopiedFiles {
  files: EventFile[]
  note: { title: string; description: string } | null
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- usePost's makeRequest, typed per request
type Send = (req: any) => Promise<unknown>

/**
 * A copy's files: the event's, as the calendar's own API reads them, each one
 * the copier may open, as the server makes an event only with files its maker
 * can open. Google's events, and any outside the one store (no calendar), carry none.
 */
export async function copiedFiles(event: CalendarEventInterface, send: Send): Promise<CopiedFiles> {
  if (!event.event_calendar_id || event.event_uuid.startsWith("gcal-")) return { files: [], note: null }
  try {
    const files = filesOf((await send(readApiEventRequest(event.event_uuid))) as { files?: unknown } | undefined)
    if (!files.length) return { files, note: null }
    const read = ((await send(entitiesRequest(files.map((f) => ({ kind: f.kind, id: f.uuid }))))) ?? []) as EntityAnswer[]
    const opens = files.filter((f) => read.some((r) => r.kind === f.kind && r.id === f.uuid && r.access === "ok"))
    const off = files.length - opens.length
    if (!off) return { files: opens, note: null }
    const one = off === 1
    return { files: opens, note: { title: `Copied without ${off} ${one ? "file" : "files"}`, description: `You can't open ${one ? "it" : "them"}, so the copy leaves ${one ? "it" : "them"} off.` } }
  } catch {
    return { files: [], note: { title: "Copied without its files", description: "They couldn't be read just now. Add them to the copy, or try again." } }
  }
}
