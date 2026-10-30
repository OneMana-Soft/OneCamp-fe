import axiosInstance from "@/lib/axiosInstance"
import { browserTZ } from "@/lib/utils/timeZone"
import type { SearchWithin } from "@/lib/search/within"
import { SCOPES, scopeOf, type SearchScope } from "@/lib/search/scopes"
import type { SearchResult } from "@/services/searchService"

/**
 * The search page's endpoint on the one grammar (docs C2-1;
 * design/QUERY_STACK_CONTRACT.md §4.8): the server reads the text, filters
 * by its modifiers, and answers one page, how many match in each kind, the
 * cursor of the next page, and the query as it read it.
 */
export const QUERY_SEARCH_PATH = "/query/search"

export type QuerySort = "best" | "newest" | "oldest"

/** Something about the text: an error stops a list, a note says what a search did instead. */
export interface QueryIssue {
  code: string
  span: [number, number]
  level?: "error" | "note"
  message?: string
  suggestions?: string[]
}

export interface QuerySearchRequest {
  q: string
  kinds?: string[]
  sort?: QuerySort
  after?: string
  size?: number
  zone?: string
  channel?: string
  dm?: string
  group?: string
}

export interface QuerySearchAnswer {
  page: SearchResult[]
  /** How many match in each of the server's kinds, whatever the page lists. */
  totals: Record<string, number>
  /** How many the listing holds: every kind, or the chip's. */
  total: number
  has_more: boolean
  next?: string
  /** What the index couldn't apply (a field it can't filter on yet). */
  notes: QueryIssue[]
  query: { runs: boolean; issues: QueryIssue[]; text: string }
}

/** The server's kinds that each chip lists. */
export const SCOPE_KINDS: Record<Exclude<SearchScope, "all">, string[]> = {
  messages: ["message"],
  tasks: ["task"],
  docs: ["doc", "board"],
  events: ["event"],
  projects: ["project"],
  people: ["person"],
  channels: ["channel", "team"],
  files: ["file"],
}

/** The request for a page of a search: the chip's kinds, the order, the conversation, the reader's zone. */
export function querySearchRequest(q: string, scope: SearchScope, sort: QuerySort, within: SearchWithin | null, after?: string): QuerySearchRequest {
  const req: QuerySearchRequest = { q, zone: browserTZ() }
  if (scope !== "all") req.kinds = SCOPE_KINDS[scope]
  if (sort !== "best") req.sort = sort
  if (after) req.after = after
  if (within) req[within.kind] = within.id
  return req
}

/** One page of a search, as the signed-in person. The page draws its own error, so no toast. */
export async function querySearch(req: QuerySearchRequest): Promise<QuerySearchAnswer> {
  const res = await axiosInstance.post(QUERY_SEARCH_PATH, req, { suppressErrorToast: true })
  const d = res.data?.data ?? {}
  return {
    page: d.page ?? [],
    totals: d.totals ?? {},
    total: typeof d.total === "number" ? d.total : 0,
    has_more: !!d.has_more,
    next: d.next || undefined,
    notes: d.notes ?? [],
    query: { runs: d.query?.runs !== false, issues: d.query?.issues ?? [], text: d.query?.text ?? "" },
  }
}

/** Each chip's count from the server's counts by kind; All is their sum. */
export function scopeTotals(totals: Record<string, number>): Record<SearchScope, number> {
  const out = Object.fromEntries(SCOPES.map((s) => [s.id, 0])) as Record<SearchScope, number>
  for (const [scope, kinds] of Object.entries(SCOPE_KINDS) as [Exclude<SearchScope, "all">, string[]][]) {
    out[scope] = kinds.reduce((n, k) => n + Math.max(0, totals[k] ?? 0), 0)
    out.all += out[scope]
  }
  return out
}

/**
 * The counts a page shows (decision D-23): the server's honest counts while
 * there is more to load, and once every page is in, the rows themselves, so
 * a count never stands beside fewer rows. All of a chip's rows are in when
 * its listing has no more; under All, every chip's are.
 */
export function shownCounts(server: Record<SearchScope, number>, rows: SearchResult[], scope: SearchScope, hasMore: boolean): Record<SearchScope, number> {
  if (hasMore) return server
  const out = { ...server }
  const loaded = Object.fromEntries(SCOPES.map((s) => [s.id, 0])) as Record<SearchScope, number>
  for (const r of rows) loaded[scopeOf(r)]++
  for (const s of SCOPES) {
    if (s.id === "all") continue
    if (scope === "all" || s.id === scope) out[s.id] = loaded[s.id]
  }
  out.all = SCOPES.reduce((n, s) => (s.id === "all" ? n : n + out[s.id]), 0)
  return out
}

/** What to say under the field: how a part of the text was read, and what couldn't be applied, once each. */
export function queryNotes(answer: Pick<QuerySearchAnswer, "notes" | "query"> | undefined): string[] {
  if (!answer) return []
  const said = new Set<string>()
  for (const issue of [...answer.query.issues, ...answer.notes]) {
    if (issue.message) said.add(issue.message)
  }
  return [...said]
}
