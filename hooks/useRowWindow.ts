"use client"

/**
 * The rows a table's view reads (tables programme, PROGRAM.md §4.2 #63): the
 * bundle and the pages after it that the table page holds, up to 10,000 and
 * then on "Load all", kept live; or, for a view the server answers whole
 * (tables T5c), windows of the view's rows in its order, counted and read by
 * the server as the view reaches them (lib/tables/useTableRows).
 */

import { useTableRows, type RowView } from "@/lib/tables/useTableRows"
import type { RowWindow } from "@/lib/tables/types"

export function useRowWindow(tableId: string, view?: RowView): RowWindow {
  return useTableRows(tableId, view)
}
