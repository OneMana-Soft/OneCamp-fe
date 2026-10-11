// How a reader looks at a table: the row height, the fields they hid, list
// mode on a phone and the summary under each column. Per reader and per
// table, in their browser, until saved views exist (content.md T04: "keep the
// per-reader rules"). Pure apart from the storage, which never throws.

import type { TableField } from "@/services/tableService"

/** The four row heights (T06): short 32, medium 40 (default), tall 64, extra tall 104. */
export type RowHeight = "short" | "medium" | "tall" | "xtall"

export const ROW_HEIGHTS: { value: RowHeight; label: string; px: number; lines: number }[] = [
  { value: "short", label: "Short", px: 32, lines: 1 },
  { value: "medium", label: "Medium", px: 40, lines: 1 },
  { value: "tall", label: "Tall", px: 64, lines: 2 },
  { value: "xtall", label: "Extra tall", px: 104, lines: 4 },
]

/** A row height in px; on a touch screen medium is 44 (T22). */
export function rowPx(h: RowHeight, touch = false): number {
  if (touch && h === "medium") return 44
  return ROW_HEIGHTS.find((r) => r.value === h)?.px ?? 40
}

/** What a column's summary cell adds up (T14). */
export type SummaryFn =
  | "none"
  | "sum"
  | "average"
  | "median"
  | "min"
  | "max"
  | "range"
  | "count"
  | "empty"
  | "filled"
  | "pct_empty"
  | "pct_filled"
  | "checked"
  | "unchecked"

export interface TableDisplay {
  rowHeight: RowHeight
  /** Field ids this reader hid. */
  hidden: string[]
  /** Phone list mode: null means "the default for this table". */
  list: boolean | null
  /** Summary function by field id, where the reader chose one. */
  summary: Record<string, SummaryFn>
  /** Column widths this reader dragged, by field id (80–640 px). */
  widths: Record<string, number>
}

export const DEFAULT_DISPLAY: TableDisplay = { rowHeight: "medium", hidden: [], list: null, summary: {}, widths: {} }

const key = (tableId: string) => `onecamp:tableDisplay:${tableId}`
const HEIGHTS = new Set(ROW_HEIGHTS.map((r) => r.value))

export function loadDisplay(tableId: string): TableDisplay {
  if (typeof window === "undefined") return DEFAULT_DISPLAY
  try {
    const raw = JSON.parse(window.localStorage.getItem(key(tableId)) || "null") as Partial<TableDisplay> | null
    if (!raw) return DEFAULT_DISPLAY
    return {
      rowHeight: HEIGHTS.has(raw.rowHeight as RowHeight) ? (raw.rowHeight as RowHeight) : "medium",
      hidden: Array.isArray(raw.hidden) ? raw.hidden.filter((h) => typeof h === "string") : [],
      list: typeof raw.list === "boolean" ? raw.list : null,
      summary: raw.summary && typeof raw.summary === "object" ? (raw.summary as Record<string, SummaryFn>) : {},
      widths: Object.fromEntries(
        Object.entries(raw.widths && typeof raw.widths === "object" ? raw.widths : {}).filter(([, w]) => typeof w === "number" && w >= 80 && w <= 640),
      ),
    }
  } catch {
    return DEFAULT_DISPLAY
  }
}

export function saveDisplay(tableId: string, d: TableDisplay): void {
  try {
    window.localStorage.setItem(key(tableId), JSON.stringify(d))
  } catch {
    // private mode or full storage: kept until the page closes
  }
}

/** On a phone, list mode is the default when the table has more than four fields (T22). */
export function listByDefault(fields: TableField[]): boolean {
  return fields.length > 4
}
