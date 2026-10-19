/**
 * Tables' shapes on the web (tables programme, PROGRAM.md §5): the window of
 * rows a view reads (#63, A3), and the change sets the row ledger records
 * (#62, A2), as the API names them (business/RowLedger, business/RowQuery).
 * The package that builds each owns its final shape: A2 the change sets and
 * the trash, A3 the window and its cursor, A7 the live diff.
 */

import type { TableRows } from "@/lib/tables/useTableRows"

/** How a change was made: by a person, or by something acting for one. */
export type ActorKind = "person" | "agent" | "automation" | "import" | "api" | "form" | "system"

/** What kind of write a change set is. */
export type ChangeKind =
  | "edit"
  | "create"
  | "delete"
  | "move"
  | "links"
  | "paste"
  | "fill"
  | "import"
  | "ai"
  | "undo"
  | "redo"
  | "restore"
  | "field"

/**
 * One cell's value before and after a write, or a whole row's (field ""), a
 * move ("#position") or a link change ("#links:<field id>").
 */
export interface Change {
  row_id: string
  field: string
  before?: unknown
  after?: unknown
}

/** One write, with every change it made. */
export interface ChangeSet {
  id: string
  table_id: string
  kind: ChangeKind
  at: string
  rows: number
  fields?: string[]
  undoes?: string
  changes?: Change[]
}

/** Where a window of rows starts; opaque, "" for the first row. */
export type Cursor = string

/**
 * What a view reads its rows through (hooks/useRowWindow): today the bundle
 * and the pages the table page holds; A3's windows of a view, in its order.
 */
export type RowWindow = TableRows

/**
 * A table's live message for a change set of many rows (A2: business/DataTable
 * ledger.go liveChanged): its rows by what happened to them, 500 in all at
 * most (more: there were others), and whether rows moved.
 */
export interface RowsChanged {
  action: "changed"
  change_set: string
  created: string[]
  updated: string[]
  deleted: string[]
  restored: string[]
  more?: boolean
  moved?: boolean
}

/** Something in a table's trash. */
export interface TrashItem {
  kind: "row" | "field"
  id: string
}
