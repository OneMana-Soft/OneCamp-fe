import { hueFor, type CampHue } from "@/lib/campHue"
import { HUE_CLASS } from "@/components/ui/graphics/hues"

/**
 * How a calendar item is coloured: by the calendar it is on, or for a task by
 * its project (the playful layer: "the calendar colours events by their
 * calendar or project"). A project's hue is the one it has everywhere else
 * (lib/campHue, from its id), so a launch task on the calendar is the launch's
 * colour in the sidebar and on the board.
 *
 * Each kind keeps its own shape, so colour never carries the meaning alone:
 *   event   the hue's tint, its ink, a solid edge of the strong cut
 *   focus   the same hue, hatched: protected time, not a meeting
 *   away    no hue at all, a dashed outline: an absence
 *   task    the project's hue, with a task glyph where it is drawn
 */

export type CalendarKind = "event" | "focus" | "away" | "task"

/** The calendars a person has here, each in a fixed hue. */
export const CALENDAR_HUE: Record<"onecamp" | "google", CampHue> = {
  onecamp: "sky",
  google: "lake",
}

export interface CalendarItemLike {
  event_uuid: string
  isTask?: boolean
  event_is_focus?: boolean
  event_is_away?: boolean
  task_project?: { project_uuid?: string } | null
}

export function kindOf(item: CalendarItemLike): CalendarKind {
  if (item.isTask) return "task"
  if (item.event_is_away) return "away"
  return item.event_is_focus ? "focus" : "event"
}

/** The hue an item is drawn in: its project's for a task, its calendar's otherwise. */
export function hueOf(item: CalendarItemLike): CampHue {
  if (item.isTask) return hueFor(item.task_project?.project_uuid || item.event_uuid)
  return item.event_uuid.startsWith("gcal-") ? CALENDAR_HUE.google : CALENDAR_HUE.onecamp
}

export interface CalendarTone {
  /** A bar or a block on the grid. */
  block: string
  /** A small solid mark: a dot, a legend swatch, the agenda's edge. */
  solid: string
}

// Literal class strings, so the stylesheet keeps them (see HUE_CLASS).
const HATCH =
  "bg-[repeating-linear-gradient(135deg,color-mix(in_oklch,var(--hue)_22%,transparent)_0_5px,transparent_5px_11px)]"

/** The classes an item is drawn with. Pure. */
export function toneOf(item: CalendarItemLike): CalendarTone {
  const kind = kindOf(item)
  if (kind === "away") {
    return {
      block: "bg-muted/60 text-muted-foreground border border-dashed border-foreground/25",
      solid: "bg-muted-foreground/40",
    }
  }
  const hue = HUE_CLASS[hueOf(item)]
  if (kind === "focus") {
    return {
      block: `${hue} bg-hue-tint ${HATCH} text-hue-ink ring-1 ring-inset ring-hue/30`,
      solid: `${hue} bg-hue`,
    }
  }
  return {
    block: `${hue} bg-hue-tint text-hue-ink border-l-2 border-hue`,
    solid: `${hue} bg-hue`,
  }
}
