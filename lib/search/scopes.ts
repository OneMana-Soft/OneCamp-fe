import type { SearchResult } from "@/services/searchService"

/**
 * The search page's scope chips (hub.md S8) and its grouping by type (S9).
 * Pure, so the grouping and the counts are tested without a page.
 */
export type SearchScope = "all" | "messages" | "tasks" | "docs" | "events" | "projects" | "people" | "channels" | "files"

export const SCOPES: { id: SearchScope; label: string; singular: string; plural: string }[] = [
  { id: "all", label: "All", singular: "result", plural: "results" },
  { id: "messages", label: "Messages", singular: "message", plural: "messages" },
  { id: "tasks", label: "Tasks", singular: "task", plural: "tasks" },
  { id: "docs", label: "Docs", singular: "doc", plural: "docs" },
  { id: "events", label: "Events", singular: "event", plural: "events" },
  { id: "projects", label: "Projects", singular: "project", plural: "projects" },
  { id: "people", label: "People", singular: "person", plural: "people" },
  { id: "channels", label: "Channels", singular: "channel", plural: "channels" },
  { id: "files", label: "Files", singular: "file", plural: "files" },
]

const SCOPE_OF: Record<SearchResult["type"], Exclude<SearchScope, "all">> = {
  chat: "messages",
  post: "messages",
  comment: "messages",
  task: "tasks",
  doc: "docs",
  board: "docs",
  project: "projects",
  user: "people",
  channel: "channels",
  team: "channels",
  attachment: "files",
  event: "events",
}

export function scopeOf(result: SearchResult): Exclude<SearchScope, "all"> {
  return SCOPE_OF[result.type] ?? "messages"
}

export function isScope(value: string | null | undefined): value is SearchScope {
  return SCOPES.some((s) => s.id === value)
}

/** How many results each scope holds, All included. */
export function scopeCounts(results: SearchResult[]): Record<SearchScope, number> {
  const counts = Object.fromEntries(SCOPES.map((s) => [s.id, 0])) as Record<SearchScope, number>
  counts.all = results.length
  for (const r of results) counts[scopeOf(r)]++
  return counts
}

/**
 * The chips to show: All always, the rest only when they hold something, each
 * named as its group is headed (QA DSA-26: chip "Docs 4" over a group "Docs
 * and boards 4"). What a chip holds is counts' when given (the server's, for
 * kinds no page has listed yet), else the results'.
 */
export function visibleScopes(results: SearchResult[], counts: Record<SearchScope, number> = scopeCounts(results)): typeof SCOPES {
  return SCOPES.filter((s) => s.id === "all" || counts[s.id] > 0).map((s) =>
    s.id === "all" ? s : { ...s, label: groupLabel(s.id, s.label, results.filter((r) => scopeOf(r) === s.id)) },
  )
}

export interface ResultGroup {
  scope: Exclude<SearchScope, "all">
  label: string
  total: number
  /** The rows shown: the first three under All, every one under its own scope. */
  rows: SearchResult[]
  /** "Show all 9 tasks", when All holds back some of the group. */
  more: string | null
}

/** How many of each type "All" shows before "Show all". */
export const ALL_PER_GROUP = 3

/**
 * What a group holds, said as it is. Boards ride with Docs and teams with
 * Channels to keep the chips few, but a group of one team was headed
 * "Channels", and a board sat under "Docs". Pure.
 */
const KINDS_OF: Partial<Record<Exclude<SearchScope, "all">, [SearchResult["type"], string][]>> = {
  docs: [
    ["doc", "Docs"],
    ["board", "Boards"],
  ],
  channels: [
    ["channel", "Channels"],
    ["team", "Teams"],
  ],
}
function groupLabel(scope: Exclude<SearchScope, "all">, label: string, rows: SearchResult[]): string {
  const kinds = KINDS_OF[scope]
  if (!kinds) return label
  const held = kinds.filter(([type]) => rows.some((r) => r.type === type)).map(([, name]) => name)
  if (held.length === 0) return label
  return held.length === 1 ? held[0] : `${held[0]} and ${held.slice(1).join(" and ").toLowerCase()}`
}

/**
 * The results grouped by type, in the chips' order, each group in the
 * answer's order. A group's total is counts' when given (the server's, which
 * pages not yet fetched are in), never fewer than its rows; under All it
 * offers "Show all" whenever it holds more than it shows.
 */
export function groupResults(results: SearchResult[], scope: SearchScope, counts?: Record<SearchScope, number>): ResultGroup[] {
  const groups: ResultGroup[] = []
  for (const s of SCOPES) {
    if (s.id === "all" || (scope !== "all" && s.id !== scope)) continue
    const rows = results.filter((r) => scopeOf(r) === s.id)
    if (rows.length === 0) continue
    const total = Math.max(counts?.[s.id] ?? 0, rows.length)
    const shown = scope === "all" ? rows.slice(0, ALL_PER_GROUP) : rows
    const capped = scope === "all" && total > shown.length
    groups.push({
      scope: s.id,
      label: groupLabel(s.id, s.label, rows),
      total,
      rows: shown,
      more: capped ? `Show all ${total} ${s.plural}` : null,
    })
  }
  return groups
}

/** When a result was made, in seconds, or 0 when the answer does not say. */
/**
 * When a result was made, in milliseconds, whatever unit the index stored it
 * in: read by magnitude as seconds, milliseconds, microseconds or nanoseconds.
 * The row prints it through formatListTimestamp as a date string, because
 * that formatter reads a bare number as seconds: handing it milliseconds is
 * what printed "30 Jun 58746" on the first v3 shots.
 */
export function resultTime(result: SearchResult): number {
  // An event's own time is in its line (eventWhen): when it was made says nothing.
  if (result.type === "event") return 0
  const item = (result as unknown as Record<string, Record<string, unknown> | undefined>)[result.type]
  const t = item?.created_date ?? item?.updated_date
  if (typeof t !== "number" || !Number.isFinite(t) || t <= 0) return 0
  if (t < 1e11) return t * 1000
  if (t < 1e14) return t
  if (t < 1e17) return Math.round(t / 1e3)
  return Math.round(t / 1e6)
}

