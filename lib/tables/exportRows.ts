import { inZone, type TableField, type TableRow } from "@/services/tableService"
import { TablesPost } from "@/services/endpoints/tables"
import type { RowSpec } from "@/lib/tables/query"
import { shownRowsOf, specOf, type ViewRows } from "@/lib/tables/viewRows"
import { formatLocale } from "@/lib/tables/numberFormat"
import { toCsv } from "@/lib/tables/csv"
import { downloadBlob, downloadFrom } from "@/lib/utils/download"
import { apiErrorStatus } from "@/lib/utils/apiError"
import { unprocessableReason } from "@/lib/tables/unprocessable"
import type { useToast } from "@/hooks/use-toast"
import { MAX_PRINT_ROWS, printSheet, printView } from "@/lib/tables/printView"

/** The view an export writes, as the page shows it (its rows named as lib/tables/viewRows names them). */
export interface ExportInput extends ViewRows {
  /** A CSV file made here, an Excel workbook the server writes (POST /tables/{id}/export), or the print dialog's PDF (lib/tables/printView). */
  format: "csv" | "xlsx" | "pdf"
  name: string
  /** The saved view shown, by name: a print's title is the table's and its. */
  view?: string
  /** The fields shown, in their order: the export's columns. */
  shown: TableField[]
  /** The widths the grid draws its columns at, by field id: the workbook's too. */
  widths: Record<string, number>
  total: number | null
  toast: ReturnType<typeof useToast>["toast"]
}

const n = (v: number) => formatLocale(v, {})

/** The most rows an Excel export names by id (business/DataTable maxExportRowIDs: what a request's body holds). */
export const MAX_EXPORT_IDS = 200_000

/**
 * The view as a file, with every row it shows, not only those the page holds.
 * A CSV is made here: the rest of the rows are read first, page by page, with
 * a toast that counts them, and filtered as the view filters them. A workbook
 * is the server's: from the view's spec when the server takes its rules and
 * nothing is searched, else from the ids of the rows the view shows, read and
 * filtered here as for a CSV. A print is read as a CSV is, then printed. A
 * chunk of its own, read on use, never with the table's first screen.
 */
export async function exportRows(x: ExportInput): Promise<void> {
  const of = x.total === null ? "" : ` of ${n(x.total)}`
  const excel = x.format === "xlsx"
  const title = excel ? "Exporting to Excel" : x.format === "pdf" ? "Getting the print ready" : "Exporting the table"
  const writing = "Writing the workbook"
  const spec = excel ? specOf(x) : null
  const note = excel || !x.complete ? x.toast({ tone: "loading", title, description: spec || x.complete ? writing : `Reading rows: 0${of}` }) : null
  try {
    if (spec) {
      await saveWorkbook(x, { spec })
    } else {
      const shown = await shownRowsOf(x, (got) => note?.update({ id: note.id, tone: "loading", title, description: `Reading rows: ${n(got)}${of}` }))
      if (x.format === "pdf") {
        printRows(x, shown, note)
        return
      }
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
    note?.update({ id: note.id, tone: "error", variant: "destructive", title: `Couldn't ${x.format === "pdf" ? "print" : "export"} the table`, description: why ?? "Not every row could be read. Try again." })
  }
}

/** The server's workbook of the view's shown fields, at the grid's widths, of the rows the spec finds or the ids name, in the reader's zone. */
async function saveWorkbook(x: ExportInput, which: { spec: RowSpec } | { rows: string[] }): Promise<void> {
  const widths = Object.fromEntries(x.shown.flatMap((f) => (x.widths[f.id] ? [[f.id, x.widths[f.id]]] : [])))
  await downloadFrom(inZone(`${TablesPost.ExportTable}/${x.tableId}/export`), `${x.name || "table"}.xlsx`, { fields: x.shown.map((f) => f.id), widths, ...which })
}

/** The rows read, printed (lib/tables/printView); a view past MAX_PRINT_ROWS is said so, and nothing printed. */
function printRows(x: ExportInput, shown: TableRow[], note: ReturnType<ExportInput["toast"]> | null): void {
  if (shown.length > MAX_PRINT_ROWS) {
    const says = {
      tone: "error" as const,
      variant: "destructive" as const,
      title: "Too many rows to print",
      description: `This view shows ${n(shown.length)} rows, and a print takes up to ${n(MAX_PRINT_ROWS)}. Filter the view, or export CSV.`,
    }
    if (note) note.update({ id: note.id, ...says })
    else x.toast(says)
    return
  }
  const title = [x.name || "Table", x.view].filter(Boolean).join(" — ")
  printView(printSheet(title, x.shown, shown, x.widths, x.fields, x.rules.groups))
  note?.update({ id: note.id, tone: "success", title: `Printing ${n(shown.length)} ${shown.length === 1 ? "row" : "rows"}`, description: undefined })
}
