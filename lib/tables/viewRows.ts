import { readEveryRow, type TableField, type TableRow } from "@/services/tableService"
import { searchRows, type ViewRules } from "@/lib/tables/viewRules"
import { applyViewRules } from "@/lib/tables/applyRules"
import { rulesToSpec, type RowQueryAnswers, type RowSpec } from "@/lib/tables/query"

/**
 * A view as the page holds it, which a request over all of its rows names
 * them from: an export (exportRows) and a step over the view (transform:
 * find, replace, clean-up). Lazy, as both are: never on the table's first
 * screen.
 */
export interface ViewRows {
  tableId: string
  /** Every field, as the view's rules read them (a hidden field can still filter). */
  fields: TableField[]
  rows: TableRow[]
  /** The page holds every row already. */
  complete: boolean
  rules: ViewRules
  /** Whoever asks: "me" in a people filter. */
  me: string | null
  /** What the table's cell index answers: rules it takes go to the server as the view's spec. */
  answers: RowQueryAnswers | null | undefined
  query: string
}

/** The view's rules as the server's spec, when it takes them all and nothing is searched; else null. */
export function specOf(v: ViewRows): RowSpec | null {
  return v.query.trim() ? null : rulesToSpec(v.rules, v.fields, v.answers)
}

/**
 * Every row the view shows, in its order: the page's when it holds them all,
 * else read page by page (onRead counts them), each then ruled and searched
 * as the view rules and searches it.
 */
export async function shownRowsOf(v: ViewRows, onRead?: (read: number) => void): Promise<TableRow[]> {
  const every = v.complete ? v.rows : await readEveryRow(v.tableId, { onProgress: onRead })
  return searchRows(applyViewRules(every, v.fields, v.rules, v.me), v.query)
}
