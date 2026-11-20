/**
 * A project's, a channel's or a team's own calendar as its row says it
 * (gcal-14), in the computer's panel and the phone's options alike: its
 * sharing is its container's people, so the row names the container (its
 * mark), the level the server gives, and what fills it while nothing is
 * dated. Pure.
 */

import { FolderKanban, Hash, Users, type LucideIcon } from "@/lib/icons"
import type { CalendarView } from "@/lib/calendar/calendarList"

export type ContainerKindName = "project" | "channel" | "team"

export interface ContainerRow {
  kind: ContainerKindName
  icon: LucideIcon
  /** "Can edit" or "View only", as the server gives it. */
  level: string
  /** Who it is shared with, in one quiet line. */
  line: string
  /** What fills it, said while nothing is dated. */
  empty: string
}

const CONTAINER: Record<ContainerKindName, { icon: LucideIcon; empty: string }> = {
  project: { icon: FolderKanban, empty: "Dated tasks and milestones show here" },
  channel: { icon: Hash, empty: "Tasks linked from its messages show here" },
  team: { icon: Users, empty: "Members' time off shows here" },
}

/** A container's calendar's row, or undefined for a calendar that is no container's. */
export function containerRow(c: Pick<CalendarView, "container_kind" | "access">): ContainerRow | undefined {
  const kind = c.container_kind
  if (kind !== "project" && kind !== "channel" && kind !== "team") return undefined
  return { kind, ...CONTAINER[kind], level: c.access === "view" ? "View only" : "Can edit", line: `Shared with the ${kind}'s members` }
}

/**
 * What fills a container's calendar, said while the shown week has nothing on
 * it and its read didn't fail; otherwise "". The panel and the phone's options
 * both say it from here.
 */
export function emptyLine(box: ContainerRow | undefined, count: number | undefined, failed?: boolean): string {
  return box && count === 0 && !failed ? box.empty : ""
}
