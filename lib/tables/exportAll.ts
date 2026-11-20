import { inZone } from "@/services/tableService"
import { TablesPost } from "@/services/endpoints/tables"
import { downloadFrom } from "@/lib/utils/download"
import { refusalOf } from "@/lib/tables/exportRefusal"
import type { useToast } from "@/hooks/use-toast"

/**
 * Every table the reader can open as one Excel workbook, a sheet each (POST
 * /tables/export): the server reads and writes it as each table's own export,
 * and refuses in words a reader with no table to open, or with more than one
 * workbook holds (a 422), which the toast says instead of "Try again". A
 * module of its own, apart from one table's export (exportRows), so the
 * tables page's chunk for it carries none of a view's export or print.
 */
export async function exportAllTables(toast: ReturnType<typeof useToast>["toast"]): Promise<void> {
  const note = toast({ tone: "loading", title: "Exporting every table", description: "Writing the workbook" })
  try {
    // POST /tables/export: the one-table export's path without a table, so
    // the endpoints enum (copied into some thirty chunks) stays as it is.
    await downloadFrom(inZone(`${TablesPost.ExportTable}/export`), "Tables.xlsx", {})
    note.update({ id: note.id, tone: "success", title: "Exported to Excel", description: undefined })
  } catch (thrown) {
    const why = await refusalOf(thrown)
    note.update({ id: note.id, tone: "error", variant: "destructive", title: "Couldn't export the tables", description: why ?? "Not every table could be read. Try again." })
  }
}
