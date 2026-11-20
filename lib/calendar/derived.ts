/**
 * Where an entry a project's, a channel's or a team's calendar fills itself
 * with comes from (gcal-14): a task, a milestone or a person's time off,
 * named as the server names it (its `source`), with the page that opens it.
 * Such an entry is read only: its card opens its source, never the entry.
 * Pure.
 */

import { workRoute } from "@/lib/work/route"
import type { CalendarView } from "@/lib/calendar/calendarList"

export interface DerivedSource {
  kind: "task" | "milestone" | "person"
  id: string
  href: string
  /** Its card's way to it: "Open task". */
  open: string
  /** Where it comes from, in a line: "A task in Launch". */
  from: string
}

/** An entry's source as the card shows it, or null for one it doesn't know (or a milestone off a project's calendar). */
export function derivedSource(src: { kind?: string; id?: string } | null | undefined, cal: Pick<CalendarView, "name" | "container_kind" | "container_id"> | undefined): DerivedSource | null {
  const id = src?.id
  if (!id) return null
  const on = cal?.name || "this calendar"
  switch (src.kind) {
    case "task":
      return { kind: "task", id, href: workRoute({ task: id }), open: "Open task", from: `A task in ${on}` }
    case "milestone":
      if (cal?.container_kind !== "project" || !cal.container_id) return null
      return { kind: "milestone", id, href: workRoute({ project: cal.container_id, tab: "updates" }), open: "Open milestone", from: `A milestone of ${on}` }
    case "person":
      return { kind: "person", id, href: `/app/user/${encodeURIComponent(id)}`, open: "Open profile", from: `Time off, on ${on}'s calendar` }
  }
  return null
}
