/**
 * The web half of tables' field-kind registry (tables programme, PROGRAM.md
 * §4.2 #60): each kind's name and glyph in the type menus, the control its
 * cell is, how text typed into it is read in the reader's locale, which
 * filters and summaries it offers. The server's half is business/FieldTypes;
 * both are held to one set of fixtures (testdata/fieldtypes/coerce.json).
 */

import type * as React from "react"
import type { FieldType, TableField } from "@/services/tableService"
import type { CellKind } from "@/lib/tables/gridKeys"
import type { SummaryFn } from "@/lib/tables/display"

/** What text typed into a cell reads as: a value to store, or why it isn't one. */
export type Parsed = { value: unknown } | { error: string }

/** Reads text typed into a field's cell, as the reader writes it. */
export type Parser = (text: string, field: TableField, locale?: string) => Parsed

/** How a field's cells compare in a filter or a sort: a formula or a rollup by what it gives. */
export type FilterKind = "text" | "number" | "date" | "checkbox" | "list"

/** One kind of field. */
export interface FieldKind {
  id: FieldType
  /** Its name in the column menu's type list. */
  label: string
  /** The line under its name there. */
  hint: string
  glyph: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>
  /** Whether its cells are stored (not a formula's, a rollup's or a link to a table's rows). */
  stored: boolean
  /** Whether its cells are labels of the field's options. */
  options: boolean
  /** The control its cell is, for moving around from the keyboard. */
  cell: CellKind
  /** How its cells compare. */
  filter: (field: TableField) => FilterKind
  /** The summaries its column may show, in menu order, None aside. */
  summaries: (field: TableField) => SummaryFn[]
  /** What its column shows until the reader chooses. */
  defaultSummary: (field: TableField) => SummaryFn
  /** Reads what a person typed into its cell; a kind picked from a list or a calendar has none. */
  parse?: Parser
  /** Whether a new row's cell can start with a value (its default). */
  defaults: boolean
  /** Its group in the new column menu. */
  group: FieldKindGroup
  /** Whether the new column menu offers it: a kind kept only for the columns that have it isn't. */
  offered: boolean
  /** Read from the row itself (its id, when it was made or changed, and by whom), which nobody writes. */
  fromRow?: boolean
  /** A number of its kind as it reads, in the summary bar (a duration's 1:30), when not as a number. */
  numberText?: (n: number, field: TableField) => string
}

/** The new column menu's groups, in order. */
export type FieldKindGroup = "Basic" | "Advanced" | "About each row"
