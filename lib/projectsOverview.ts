/**
 * Every project the reader is in, at a glance: how far along each is, what's
 * late, and how its people last said it was going (GET /project/overview).
 * The counts are the server's, in the reader's days, as the line under a
 * project's name counts them (projectGlance). Pure, for its test.
 */

import { healthOf, type Health } from "@/lib/projectUpdates"
import type { ProjectGlance } from "@/lib/utils/projectGlance"

export interface ProjectOverview {
  project_uuid: string
  project_name: string
  /** 1 when the reader is one of its admins. */
  is_admin: number
  project_team?: { team_uuid: string; team_name: string }
  open: number
  done: number
  overdue: number
  due_soon: number
  /** Its latest update's health; none when it has no update yet. */
  health?: Health
  updated_at?: string
  /** The days its tasks run across, for the projects' timeline; none without dated tasks. */
  first_day?: string
  last_day?: string
}

export type OverviewSort = "name" | "attention" | "progress" | "updated"
export const OVERVIEW_SORTS: { value: OverviewSort; label: string }[] = [
  { value: "name", label: "Name" },
  { value: "attention", label: "Needs attention first" },
  { value: "progress", label: "Least done first" },
  { value: "updated", label: "Oldest update first" },
]

export type OverviewFilter = "all" | "attention"

/** The share of its tasks that are done, 0 to 1; a project with none is at 0. */
export function progressOf(p: Pick<ProjectOverview, "open" | "done">): number {
  const total = p.open + p.done
  return total > 0 ? p.done / total : 0
}

/** Said to be off track or at risk, or has work past its date. */
export function needsAttention(p: Pick<ProjectOverview, "health" | "overdue">): boolean {
  return p.health === "off_track" || p.health === "at_risk" || p.overdue > 0
}

// Worst first: what a lead looks at before anything else.
const RANK: Record<string, number> = { off_track: 0, at_risk: 1, "": 2, on_hold: 3, on_track: 4, done: 5 }
const rank = (p: ProjectOverview) => RANK[p.health ?? ""] ?? 2
const byName = (a: ProjectOverview, b: ProjectOverview) => a.project_name.localeCompare(b.project_name, undefined, { sensitivity: "base" })
const updatedAt = (p: ProjectOverview) => (p.updated_at ? Date.parse(p.updated_at) || 0 : 0)

export function sortOverview(list: ProjectOverview[], sort: OverviewSort): ProjectOverview[] {
  const out = [...list]
  switch (sort) {
    case "attention":
      // Everything the Needs attention filter keeps comes first, worst first.
      return out.sort((a, b) => Number(needsAttention(b)) - Number(needsAttention(a)) || rank(a) - rank(b) || b.overdue - a.overdue || byName(a, b))
    case "progress":
      return out.sort((a, b) => progressOf(a) - progressOf(b) || b.open - a.open || byName(a, b))
    case "updated":
      // Never updated is oldest of all.
      return out.sort((a, b) => updatedAt(a) - updatedAt(b) || byName(a, b))
    default:
      return out.sort(byName)
  }
}

/** The projects whose name or team has every word of the query, and only those needing attention when asked. */
export function filterOverview(list: ProjectOverview[], o: { query: string; filter: OverviewFilter }): ProjectOverview[] {
  const words = o.query.toLowerCase().split(/\s+/).filter(Boolean)
  return list.filter((p) => {
    if (o.filter === "attention" && !needsAttention(p)) return false
    if (words.length === 0) return true
    const hay = `${p.project_name} ${p.project_team?.team_name ?? ""}`.toLowerCase()
    return words.every((w) => hay.includes(w))
  })
}

/** The line over the list: how many projects, how many in trouble, how much is late. */
export function overviewSummary(list: ProjectOverview[]): { text: string; tone: "default" | "late" }[] {
  if (list.length === 0) return []
  const parts: { text: string; tone: "default" | "late" }[] = [{ text: `${list.length} ${list.length === 1 ? "project" : "projects"}`, tone: "default" }]
  for (const h of ["off_track", "at_risk"] as const) {
    const n = list.filter((p) => p.health === h).length
    if (n > 0) parts.push({ text: `${n} ${healthOf(h).label.toLowerCase()}`, tone: "late" })
  }
  const late = list.reduce((n, p) => n + p.overdue, 0)
  if (late > 0) parts.push({ text: `${late} ${late === 1 ? "task" : "tasks"} overdue`, tone: "late" })
  return parts
}

/** A project's counts as the glance line takes them (projectGlanceParts). */
export const glanceOf = (p: ProjectOverview): ProjectGlance => ({ open: p.open, overdue: p.overdue, dueSoon: p.due_soon, done: p.done })
