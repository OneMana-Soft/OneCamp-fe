/**
 * A step over a view's rows (tables G2; gsheets-grid-01 items 3 and 5,
 * airtable-04's find): find, replace, trim spaces, remove duplicate rows or
 * split a text column, as POST /tables/{id}/rows/transform runs it on the
 * server (business/DataTable/transformRows.go). The server walks every row of
 * the view, read here or not, as the reader may see each cell; a write goes
 * through a paste's checks, in change sets one Undo takes back together.
 * The find bar's and the clean-up dialogs' calls, and their words. Lazy:
 * read with the find bar or a clean-up, never on the table's first screen.
 */

import axiosInstance, { OWN_ERRORS } from "@/lib/axiosInstance"
import { TablesPost } from "@/services/endpoints/tables"
import { inZone, type TableField } from "@/services/tableService"
import { TEXT_KINDS, type RowSpec } from "@/lib/tables/query"
import { fieldKind } from "@/lib/fieldTypes/registry"
import { shownRowsOf, specOf, type ViewRows } from "@/lib/tables/viewRows"
import { apiErrorMessage, apiErrorStatus } from "@/lib/utils/apiError"
import { formatLocale } from "@/lib/tables/numberFormat"

export type TransformStep = "find" | "replace" | "trim" | "dedupe" | "split"
/** The clean-ups (G2b): each a dialog with a dry run's count before it applies. */
export type CleanStep = "dedupe" | "trim" | "split"

/**
 * A step (TransformInput): the view's rows, by its spec or by their ids (none:
 * every row, in the table's order); the fields it searches, changes or
 * compares; a find's or a replace's words; a split's separator and the fields
 * its parts go to, the first part to the first. dry_run counts what it would
 * do and writes nothing. from: where in the view a find's list starts.
 */
export interface TransformInput {
  step: TransformStep
  spec?: RowSpec
  rows?: string[]
  fields: string[]
  find?: string
  replace?: string
  match_case?: boolean
  whole_cell?: boolean
  regex?: boolean
  separator?: string
  into?: string[]
  dry_run?: boolean
  from?: number
}

/** A cell a step found, or would change (no field: a duplicate row), and its row's place in the view, from 0. */
export interface TransformMatch {
  row: string
  field?: string
  at: number
}

/**
 * What a step found or did (TransformResult): walked, the view's rows; rows
 * and cells, those found or changed; deleted, a dedupe's; the first 1,000
 * matches from `from` (capped: there are more); a write's change sets, the
 * cells refused (skipped, the first 100; skipped_count, all) and the rows
 * someone else changed meanwhile, left as they are (kept_changed); a split's
 * dry run, the filled cells it writes over and the most parts a cell gives.
 */
export interface TransformResult {
  walked: number
  rows: number
  cells: number
  deleted: number
  matches: TransformMatch[]
  capped: boolean
  operation?: string
  change_sets: string[]
  skipped: { row?: string; field?: string; msg: string }[]
  skipped_count: number
  kept_changed: number
  overwrites?: number
  max_parts?: number
}

/** Runs a step over a table's view in the reader's zone (a date is found as they read it). The caller says a refusal itself. */
export async function transformRows(tableId: string, input: TransformInput, signal?: AbortSignal): Promise<TransformResult> {
  const res = await axiosInstance.post(inZone(`${TablesPost.TransformTableRows}/${tableId}/rows/transform`), input, { ...OWN_ERRORS, signal })
  return res.data?.data as TransformResult
}

/**
 * The view's rows as a step names them: by the ids of the rows it shows, in
 * its order, when the page holds every row (the grid's order, exactly); else
 * by its rules, as the server's spec, when the server takes them and nothing
 * is searched; else every row is read, ruled and searched here, and named by
 * id, as an export names them.
 */
export async function viewNamed(v: ViewRows): Promise<{ spec: RowSpec } | { rows: string[] }> {
  const spec = v.complete ? null : specOf(v)
  return spec ? { spec } : { rows: (await shownRowsOf(v)).map((r) => r.id) }
}

/** The fields a replace, a trim or a split changes: a person's own text, never a choice, a number or a computed field. */
export function stepFields(fields: TableField[]): TableField[] {
  return fields.filter((f) => TEXT_KINDS.has(f.type))
}

/** Those fields' kinds in a sentence, as the field menu names them: "text, long text, URL, email and phone". */
export function stepKindsText(): string {
  const words = [...TEXT_KINDS].map((type) => {
    const label = fieldKind(type).label
    return label === label.toUpperCase() ? label : label.toLowerCase()
  })
  return `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`
}

/** Why a step was refused, in words: someone who can only view the table is told so; a step the server can't run (a bad pattern, too many rows), in its own words. */
export function stepRefusal(e: unknown): string {
  return apiErrorStatus(e) === 403 ? "You can view this table, not change it" : apiErrorMessage(e, "Couldn't reach the server. Try again in a moment.")
}

/** A count as the table writes numbers: 2,500. */
export const count = (n: number) => formatLocale(n, {})

/** "1 cell", "40 cells". */
export const cellsText = (n: number) => `${count(n)} ${n === 1 ? "cell" : "cells"}`

/** What a write left as it was, for its toast: cells the server refused, and rows someone else changed meanwhile. */
export function leftText(r: TransformResult): string | undefined {
  const lines = [
    r.skipped_count ? `${cellsText(r.skipped_count)} couldn't be changed${r.skipped[0] ? `: ${r.skipped[0].msg}` : ""}.` : "",
    r.kept_changed ? `${count(r.kept_changed)} ${r.kept_changed === 1 ? "row was" : "rows were"} changed by someone else meanwhile, and left as ${r.kept_changed === 1 ? "it is" : "they are"}.` : "",
  ].filter(Boolean)
  return lines.length ? lines.join(" ") : undefined
}
