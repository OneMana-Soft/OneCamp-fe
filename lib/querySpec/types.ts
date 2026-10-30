/**
 * The Query Spec (projects programme, PROGRAM.md §4.2 #80; agreed with tables
 * in SHARED_WITH_TABLES.md): one shape for every list of work and every table
 * view, run on the server (business/QuerySpec), which answers one page's ids
 * with every group's count and summaries. It is also the one typed tree of
 * design/QUERY_STACK_CONTRACT.md §2: the server builds it from the one
 * grammar (lib/search/query.ts is the grammar's typing twin), and every
 * compiler (the search index, projects' tasks, tables' rows) reads only a
 * built spec. These are its types, as the server reads them.
 */

/** What a spec lists: a project's tasks, my tasks, a table's rows, or the whole workspace for search. */
export interface QueryScope {
  kind: "project" | "mine" | "table" | "search"
  id?: string
  /** The kinds of thing a search covers (task, doc, message, file, …); none is every kind. Search only. */
  kinds?: string[]
}

/** [from, to) in UTF-16 code units of the text a query was parsed from. */
export type QuerySpan = [number, number]

/**
 * One value a condition compares with (contract §2 item 11): a name as typed
 * before it resolves or a text value (text), what a name resolved to (id and
 * type), a number in the field's display unit, a relative date (relative and
 * n), and how it read when built (label, for display only).
 */
export interface QueryValue {
  text?: string
  id?: string
  type?: string
  number?: number
  relative?: string
  n?: number
  label?: string
}

/** The one list of operator names (contract §2 item 9). Field Types (#60) says which each kind takes. */
export type QueryOperator =
  | "is"
  | "is_not"
  | "contains"
  | "not_contains"
  | "starts_with"
  | "ends_with"
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "before"
  | "after"
  | "on_or_before"
  | "on_or_after"
  | "between"
  | "within"
  | "in"
  | "not_in"
  | "all_of"
  | "is_exactly"
  | "empty"
  | "not_empty"
  | "checked"
  | "unchecked"
  | "title_contains"
  | "name_contains"
  | "status_group_is"

/**
 * A filter node: a group joining its filters ("not" holds exactly one), or a
 * condition on one field: a built-in name ("text" for words) or field:<id>.
 * form and span say how and where it was written; no compiler reads them.
 */
export type QueryFilter =
  | { op: "and" | "or" | "not"; filters: QueryFilter[]; span?: QuerySpan }
  | { field: string; operator: QueryOperator; values?: QueryValue[]; form?: "mod" | "cmp"; span?: QuerySpan }

/** A condition's value for the person asking ("assignee is me"). */
export const ME = "@me"

export interface QuerySort {
  field: string
  desc?: boolean
}

export interface QueryGroup {
  field: string
  desc?: boolean
  collapsed?: string[]
  /** A date field's groups. */
  granularity?: "day" | "week" | "month" | "quarter" | "year"
}

/** The summaries wanted for one field. */
export interface QuerySummaryRequest {
  field: string
  fns: string[]
}

/**
 * A set's summaries: by field, then by function, a number, or for a date a
 * day ("2026-10-01") or a moment, and a date's range as [earliest, latest];
 * null for a number's or a date's function of no value.
 */
export type QuerySummaries = Record<string, Record<string, number | string | [string, string] | null>>

/** Where a page starts: opaque, from the page before. */
export type QueryCursor = string

export interface QuerySpec {
  scope: QueryScope
  filter?: QueryFilter
  /** At most five. */
  sorts?: QuerySort[]
  /** At most three levels. */
  groups?: QueryGroup[]
  summaries?: QuerySummaryRequest[]
  /** A list's own search box: words, joined to the filter with AND. */
  search?: string
  /** The view it is for: list, board, timeline, grid, gallery, calendar or form. */
  layout?: string
  /** The layout's own options, as it writes them. */
  options?: Record<string, unknown>
}

export interface QueryPage {
  size: number
  after?: QueryCursor
}

/** One group's key (a value per level), how many it holds, and its summaries. */
export interface GroupCount {
  key: string[]
  count: number
  summaries?: QuerySummaries
}

export interface QueryResult {
  ids: string[]
  groups?: GroupCount[]
  next?: QueryCursor
  total: number
  summaries?: QuerySummaries
}
