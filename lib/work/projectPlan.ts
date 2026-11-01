/**
 * A project's plan (linear-15): who leads it, when it starts and when it should
 * land, each at the resolution its people chose (a day, a month, a quarter, a
 * half or a year), how much it matters, its labels, and where it stands among
 * the five status categories the workspace's own statuses sit in. The server
 * (business/ProjectPlan) keeps the rules: a start snaps to its period's first
 * day and a target to its last, so a target of Q3 2027 reads back as
 * 2027-09-30 at "quarter". This reads and words a plan. Pure, for its test.
 */

import type { ProjectStatusKind } from "@/components/ui/graphics/projectStatusGlyph"
import { STATUS_COLORS } from "@/lib/taskStatus"

export type PlanResolution = "day" | "month" | "quarter" | "half" | "year"

/** The resolutions a date is chosen at, finest first. */
export const PLAN_RESOLUTIONS: readonly { value: PlanResolution; label: string }[] = [
  { value: "day", label: "Day" },
  { value: "month", label: "Month" },
  { value: "quarter", label: "Quarter" },
  { value: "half", label: "Half" },
  { value: "year", label: "Year" },
]

/** A plan's date as the server reads and writes it: a day (2027-09-30) and how finely it was chosen. */
export interface PlanWhen {
  date: string
  resolution: PlanResolution
}

export type PlanCategory = "planned" | "in_progress" | "paused" | "done" | "cancelled"

/** Where a project stands: its category and, when it's one of the workspace's own, that status (none: the category's built-in). */
export interface PlanStatus {
  category: PlanCategory
  id?: string
  name: string
  color: string
}

export interface PlanLabel {
  id: string
  name: string
  color: string
}

export interface ProjectPlan {
  lead: { user_uuid: string; name: string } | null
  start: PlanWhen | null
  target: PlanWhen | null
  /** urgent, high, medium or low; "" for none. */
  priority: string
  status: PlanStatus
  labels: PlanLabel[] | null
  updated_at?: string
}

/** GET /project/{id}/plan: the plan, and what the reader may change (its admins and members edit it; its admins choose the lead). */
export interface ProjectPlanAnswer {
  msg?: string
  data?: { plan: ProjectPlan; can_edit: boolean; can_lead: boolean }
}

export interface PlanRegistryStatus extends PlanLabel {
  category: PlanCategory
  position: number
}

/** GET /project/plan/registry: the five categories, the workspace's own statuses and labels, and the colours they take. */
export interface PlanRegistry {
  categories: { key: PlanCategory; name: string; color: string }[]
  statuses: PlanRegistryStatus[] | null
  labels: PlanLabel[] | null
  colors: string[]
}

/**
 * A change to a plan (POST /project/{id}/plan): only the parts it carries
 * change, and a part sent as null is cleared. status is a category's key or a
 * workspace status's id; labels is every label id the project carries after
 * it, with new_labels made beside them.
 */
export interface PlanChange {
  lead_uuid?: string | null
  start?: PlanWhen | null
  target?: PlanWhen | null
  priority?: string | null
  status?: string | null
  labels?: string[]
  new_labels?: { name: string; color: string }[]
}

/** A part of the plan, as its chip and its picker are named. */
export type PlanField = "status" | "priority" | "lead" | "dates" | "labels"

/** Someone in the project, as its member list carries them (UserProfileDataInterface's parts the lead's picker reads). */
export interface PlanMember {
  user_uuid: string
  user_name: string
  user_full_name?: string
  is_external?: boolean
  is_bot?: boolean
  user_project_role?: string
}

/** A picker's change and the parts as they'll read until the server answers; keepOpen leaves its picker open. */
export type PlanPick = (change: PlanChange, shown: Partial<ProjectPlan>, keepOpen?: boolean) => void

/** How many labels one project carries (the server's MostLabelsOnAProject). */
export const MOST_PLAN_LABELS = 20

/** The five categories in the order a project goes through them, each drawn as the task status glyph of the same meaning. */
export const PLAN_CATEGORIES: readonly { key: PlanCategory; name: string; kind: ProjectStatusKind }[] = [
  { key: "planned", name: "Planned", kind: "todo" },
  { key: "in_progress", name: "In progress", kind: "progress" },
  { key: "paused", name: "Paused", kind: "paused" },
  { key: "done", name: "Done", kind: "done" },
  { key: "cancelled", name: "Cancelled", kind: "cancelled" },
]

/** The glyph a category draws; an unknown one draws as planned. */
export function categoryKind(category: string | undefined): ProjectStatusKind {
  return PLAN_CATEGORIES.find((c) => c.key === category)?.kind ?? "todo"
}

const iso = (y: number, m: number, d: number) => new Date(Date.UTC(y, m, d)).toISOString().slice(0, 10)
const parts = (day: string) => day.split("-").map(Number) as [number, number, number]

/**
 * The first and last day of the period a day falls in, at a resolution: the
 * server's Period. Days are calendar days, worked in UTC so no zone moves one.
 */
export function periodOf(day: string, resolution: PlanResolution): { first: string; last: string } {
  const [y, m, d] = parts(day)
  switch (resolution) {
    case "month":
      return { first: iso(y, m - 1, 1), last: iso(y, m, 0) }
    case "quarter": {
      const q = Math.floor((m - 1) / 3) * 3
      return { first: iso(y, q, 1), last: iso(y, q + 3, 0) }
    }
    case "half": {
      const h = m <= 6 ? 0 : 6
      return { first: iso(y, h, 1), last: iso(y, h + 6, 0) }
    }
    case "year":
      return { first: iso(y, 0, 1), last: iso(y, 12, 0) }
    default:
      return { first: iso(y, m - 1, d), last: iso(y, m - 1, d) }
  }
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

/** The periods a picker offers for a year at a resolution coarser than a day: each with its words and a day inside it. */
export function periodsOfYear(year: number, resolution: Exclude<PlanResolution, "day">): { label: string; day: string }[] {
  switch (resolution) {
    case "month":
      return MONTHS.map((label, i) => ({ label, day: iso(year, i, 1) }))
    case "quarter":
      return [0, 1, 2, 3].map((i) => ({ label: `Q${i + 1}`, day: iso(year, i * 3, 1) }))
    case "half":
      return [0, 1].map((i) => ({ label: `H${i + 1}`, day: iso(year, i * 6, 1) }))
    default:
      return [{ label: String(year), day: iso(year, 0, 1) }]
  }
}

/** A plan date in words at its resolution: "14 Mar 2027", "Mar 2027", "Q1 2027", "H2 2027" or "2027". */
export function whenWords(w: PlanWhen | null | undefined): string {
  if (!w) return ""
  const [y, m, d] = parts(w.date)
  switch (w.resolution) {
    case "year":
      return `${y}`
    case "half":
      return `H${m <= 6 ? 1 : 2} ${y}`
    case "quarter":
      return `Q${Math.floor((m - 1) / 3) + 1} ${y}`
    case "month":
      return `${MONTHS[m - 1]} ${y}`
    default:
      return `${d} ${MONTHS[m - 1]} ${y}`
  }
}

/**
 * A start and a target as one span: "Q1 → Q3 2027" (a year both share is said
 * once), "Nov 2026 → Q1 2027", "From Mar 2027", "Target Q3 2027", or "" when
 * neither is set.
 */
export function spanWords(start: PlanWhen | null | undefined, target: PlanWhen | null | undefined): string {
  if (!start && !target) return ""
  if (!target) return `From ${whenWords(start)}`
  if (!start) return `Target ${whenWords(target)}`
  const a = whenWords(start)
  const b = whenWords(target)
  if (a === b) return b
  const year = target.date.slice(0, 4)
  if (start.resolution !== "year" && start.date.slice(0, 4) === year) return `${a.slice(0, -(year.length + 1))} → ${b}`
  return `${a} → ${b}`
}

/** The day to send for a choice at a resolution: the period's first day for a start, its last for a target (the server snaps either way). */
export function whenOf(day: string, resolution: PlanResolution, end: "start" | "target"): PlanWhen {
  const p = periodOf(day, resolution)
  return { date: end === "start" ? p.first : p.last, resolution }
}

const LABEL_COLORS = STATUS_COLORS.filter((c) => c !== "slate")

/** The colour a new label takes: the camp hues in turn, by how many labels the workspace has. */
export function nextLabelColor(count: number): string {
  return LABEL_COLORS[((count % LABEL_COLORS.length) + LABEL_COLORS.length) % LABEL_COLORS.length]
}
