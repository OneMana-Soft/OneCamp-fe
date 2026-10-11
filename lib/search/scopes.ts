import type { SearchResult } from "@/services/searchService"

/**
 * The search page's scope chips (hub.md S8) and its grouping by type (S9).
 * Pure, so the grouping and the counts are tested without a page.
 */
export type SearchScope = "all" | "messages" | "tasks" | "docs" | "projects" | "people" | "channels" | "files"

export const SCOPES: { id: SearchScope; label: string; singular: string; plural: string }[] = [
  { id: "all", label: "All", singular: "result", plural: "results" },
  { id: "messages", label: "Messages", singular: "message", plural: "messages" },
  { id: "tasks", label: "Tasks", singular: "task", plural: "tasks" },
  { id: "docs", label: "Docs", singular: "doc", plural: "docs" },
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

/** The chips to show: All always, the rest only when they hold something. */
export function visibleScopes(results: SearchResult[]): typeof SCOPES {
  const counts = scopeCounts(results)
  return SCOPES.filter((s) => s.id === "all" || counts[s.id] > 0)
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

/** The results grouped by type, in the chips' order, each group in the answer's order. */
export function groupResults(results: SearchResult[], scope: SearchScope): ResultGroup[] {
  const groups: ResultGroup[] = []
  for (const s of SCOPES) {
    if (s.id === "all" || (scope !== "all" && s.id !== scope)) continue
    const rows = results.filter((r) => scopeOf(r) === s.id)
    if (rows.length === 0) continue
    const capped = scope === "all" && rows.length > ALL_PER_GROUP
    groups.push({
      scope: s.id,
      label: s.label,
      total: rows.length,
      rows: capped ? rows.slice(0, ALL_PER_GROUP) : rows,
      more: capped ? `Show all ${rows.length} ${s.plural}` : null,
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
  const item = (result as unknown as Record<string, Record<string, unknown> | undefined>)[result.type]
  const t = item?.created_date ?? item?.updated_date
  if (typeof t !== "number" || !Number.isFinite(t) || t <= 0) return 0
  if (t < 1e11) return t * 1000
  if (t < 1e14) return t
  if (t < 1e17) return Math.round(t / 1e3)
  return Math.round(t / 1e6)
}

export type SearchSort = "best" | "newest"

/** Best match is the server's order; newest sorts by when each was made, stably. */
export function sortResults(results: SearchResult[], sort: SearchSort): SearchResult[] {
  if (sort === "best") return results
  return results
    .map((r, i) => ({ r, i, t: resultTime(r) }))
    .sort((a, b) => b.t - a.t || a.i - b.i)
    .map((x) => x.r)
}
