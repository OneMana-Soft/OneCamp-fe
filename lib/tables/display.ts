// How a reader looks at a table: the row height, the fields they hid, list
// mode on a phone and the summary under each column. Per reader and per
// table, in their browser, until saved views exist (content.md T04: "keep the
// per-reader rules"). Pure apart from the storage, which never throws.

import type { TableField } from "@/services/tableService"
import type { RowColors } from "@/lib/tables/applyRules"

/** The four row heights (T06): short 32, medium 40 (default), tall 64, extra tall 104. */
export type RowHeight = "short" | "medium" | "tall" | "xtall"

export const ROW_HEIGHTS: { value: RowHeight; label: string; px: number; lines: 1 | 2 | 4 }[] = [
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

/** How many lines of a text a row of this height shows. */
export function rowLines(h: RowHeight): 1 | 2 | 4 {
  return ROW_HEIGHTS.find((r) => r.value === h)?.lines ?? 1
}

/** What a column's summary cell adds up (T14): a saved view's summary names only these. */
const SUMMARY_FNS = [
  "none",
  "sum",
  "average",
  "median",
  "min",
  "max",
  "range",
  "count",
  "empty",
  "filled",
  "pct_empty",
  "pct_filled",
  "checked",
  "unchecked",
  // A status's rows in each of its groups (to do, in progress, done).
  "groups",
  // When rows were made or changed: the earliest and the latest.
  "span",
] as const
export type SummaryFn = (typeof SUMMARY_FNS)[number]
const SUMMARIES = new Set<unknown>(SUMMARY_FNS)

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
  /** The select field the board groups by; null for the first. */
  boardGroup: string | null
  /** The groups this reader collapsed, by grouping (groupingOf): each a key a level down to it. Never a view's. */
  shut: Record<string, string[][]>
  /** As kept: read where rows are coloured (applyRules readColors). */
  colors: RowColors | null
  /** As kept: read by the timeline and the Gantt (lib/tables/tableTimeline readTimelineLook). */
  timeline?: unknown
}

export const DEFAULT_DISPLAY: TableDisplay = { rowHeight: "medium", hidden: [], list: null, summary: {}, widths: {}, boardGroup: null, shut: {}, colors: null }
const isPath = (p: unknown) => Array.isArray(p) && p.length > 0 && p.length <= 3 && p.every((k) => typeof k === "string")

const key = (tableId: string) => `onecamp:tableDisplay:${tableId}`
const HEIGHTS = new Set(ROW_HEIGHTS.map((r) => r.value))

/** How a table draws, as a reader's browser or a saved view keeps it, made good; anything else is the default. */
export function readDisplay(saved: unknown): TableDisplay {
  if (!saved || typeof saved !== "object") return DEFAULT_DISPLAY
  const raw = saved as Partial<TableDisplay>
  return {
    rowHeight: HEIGHTS.has(raw.rowHeight as RowHeight) ? (raw.rowHeight as RowHeight) : "medium",
    hidden: Array.isArray(raw.hidden) ? raw.hidden.filter((h) => typeof h === "string") : [],
    list: typeof raw.list === "boolean" ? raw.list : null,
    summary: Object.fromEntries(Object.entries(raw.summary && typeof raw.summary === "object" ? raw.summary : {}).filter((e): e is [string, SummaryFn] => SUMMARIES.has(e[1]))),
    widths: Object.fromEntries(
      Object.entries(raw.widths && typeof raw.widths === "object" ? raw.widths : {}).filter(([, w]) => typeof w === "number" && w >= 80 && w <= 640),
    ),
    boardGroup: typeof raw.boardGroup === "string" ? raw.boardGroup : null,
    shut: Object.fromEntries(
      Object.entries(raw.shut && typeof raw.shut === "object" ? raw.shut : {})
        .filter((e): e is [string, string[][]] => Array.isArray(e[1]) && e[1].every(isPath))
        .slice(-8),
    ),
    colors: raw.colors ?? null,
    timeline: raw.timeline ?? null,
  }
}

export function loadDisplay(tableId: string): TableDisplay {
  if (typeof window === "undefined") return DEFAULT_DISPLAY
  try {
    return readDisplay(JSON.parse(window.localStorage.getItem(key(tableId)) || "null"))
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
