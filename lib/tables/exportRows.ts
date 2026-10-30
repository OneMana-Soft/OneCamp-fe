import { inZone, readEveryRow, type TableField, type TableRow } from "@/services/tableService"
import { TablesPost } from "@/services/endpoints/tables"
import { searchRows, type ViewRules } from "@/lib/tables/viewRules"
import { applyViewRules } from "@/lib/tables/applyRules"
import { rulesToSpec, type RowQueryAnswers, type RowSpec } from "@/lib/tables/query"
import { formatLocale } from "@/lib/tables/numberFormat"
import { toCsv } from "@/lib/tables/csv"
import { downloadBlob, downloadFrom } from "@/lib/utils/download"
import { apiErrorStatus } from "@/lib/utils/apiError"
import { unprocessableReason } from "@/lib/tables/unprocessable"
import type { useToast } from "@/hooks/use-toast"

/** The view an export writes, as the page shows it. */
export interface ExportInput {
  /** A CSV file made here, or an Excel workbook the server writes (POST /tables/{id}/export). */
  format: "csv" | "xlsx"
  tableId: string
  name: string
  /** The fields shown, in their order: the export's columns. */
  shown: TableField[]
  /** The widths the grid draws its columns at, by field id: the workbook's too. */
  widths: Record<string, number>
  /** Every field, as the view's rules read them (a hidden field can still filter). */
  fields: TableField[]
  rows: TableRow[]
  /** The page holds every row already. */
  complete: boolean
  total: number | null
  rules: ViewRules
  /** Whoever exports: "me" in a people filter. */
  me: string | null
  /** What the table's cell index answers: rules it takes go to the server as the view's spec. */
  answers: RowQueryAnswers | null | undefined
  query: string
  toast: ReturnType<typeof useToast>["toast"]
}

/** The most rows an Excel export names by id (business/DataTable maxExportRowIDs: what a request's body holds). */
export const MAX_EXPORT_IDS = 200_000

/**
 * The view as a file, with every row it shows, not only those the page holds.
 * A CSV is made here: the rest of the rows are read first, page by page, with
 * a toast that counts them, and filtered as the view filters them. A workbook
 * is the server's: from the view's spec when the server takes its rules and
 * nothing is searched, else from the ids of the rows the view shows, read and
 * filtered here as for a CSV. A chunk of its own, read on use, never with the
 * table's first screen.
 */
export async function exportRows(x: ExportInput): Promise<void> {
  const n = (v: number) => formatLocale(v, {})
  const of = x.total === null ? "" : ` of ${n(x.total)}`
  const excel = x.format === "xlsx"
  const title = excel ? "Exporting to Excel" : "Exporting the table"
  const writing = "Writing the workbook"
  const spec = excel && !x.query.trim() ? rulesToSpec(x.rules, x.fields, x.answers) : null
  const note = excel || !x.complete ? x.toast({ tone: "loading", title, description: spec || x.complete ? writing : `Reading rows: 0${of}` }) : null
  try {
    if (spec) {
      await saveWorkbook(x, { spec })
    } else {
      const every = x.complete
        ? x.rows
        : await readEveryRow(x.tableId, { onProgress: (got) => note?.update({ id: note.id, tone: "loading", title, description: `Reading rows: ${n(got)}${of}` }) })
      const shown = searchRows(applyViewRules(every, x.fields, x.rules, x.me), x.query)
      if (!excel) {
        downloadBlob(toCsv(x.shown, shown), "text/csv;charset=utf-8", `${x.name || "table"}.csv`)
        note?.update({ id: note.id, tone: "success", title: `Exported ${n(shown.length)} ${shown.length === 1 ? "row" : "rows"}`, description: undefined })
        return
      }
      if (shown.length > MAX_EXPORT_IDS) {
        note?.update({
          id: note.id,
          tone: "error",
          variant: "destructive",
          title: "Too many rows for Excel",
          description: `This view's filters show ${n(shown.length)} rows, and an Excel export by them takes up to ${n(MAX_EXPORT_IDS)}. Export CSV instead.`,
        })
        return
      }
      note?.update({ id: note.id, tone: "loading", title, description: writing })
      await saveWorkbook(x, { rows: shown.map((r) => r.id) })
    }
    note?.update({ id: note.id, tone: "success", title: "Exported to Excel", description: undefined })
  } catch (thrown) {
    // Refused in the server's words (a 422: a formula or a rollup it can't
    // work out over every row yet), never "Try again", which is refused again.
    // The workbook was asked for as a file, so a refusal came as one: its
    // words are read back here, lazily, and never in the shared download
    // helper, whose new chunk every page would carry.
    const e = await import("@/lib/utils/downloadRefusal").then(({ withItsWords }) => withItsWords(thrown), () => thrown).catch((x: unknown) => x)
    const why = apiErrorStatus(e) === 404 ? "It's gone, or you can no longer open it." : unprocessableReason(e)
    note?.update({ id: note.id, tone: "error", variant: "destructive", title: "Couldn't export the table", description: why ?? "Not every row could be read. Try again." })
  }
}

/** The server's workbook of the view's shown fields, at the grid's widths, of the rows the spec finds or the ids name, in the reader's zone. */
async function saveWorkbook(x: ExportInput, which: { spec: RowSpec } | { rows: string[] }): Promise<void> {
  const widths = Object.fromEntries(x.shown.flatMap((f) => (x.widths[f.id] ? [[f.id, x.widths[f.id]]] : [])))
  await downloadFrom(inZone(`${TablesPost.ExportTable}/${x.tableId}/export`), `${x.name || "table"}.xlsx`, { fields: x.shown.map((f) => f.id), widths, ...which })
}
