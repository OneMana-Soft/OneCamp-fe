"use client"

/**
 * The rows a table's view reads (tables programme, PROGRAM.md §4.2 #63; A3
 * builds it): a window of the view's rows in its order, counted and paged by
 * the server.
 *
 * DAY 0. Today's rows: the bundle and the pages after it that the table page
 * holds, up to 10,000 and then on "Load all", kept live (useTableRows). A3
 * replaces the reading behind the same name, adding the view's spec (#80),
 * without the table page changing.
 */

import { useTableRows } from "@/lib/tables/useTableRows"
import type { RowWindow } from "@/lib/tables/types"

export function useRowWindow(tableId: string): RowWindow {
  return useTableRows(tableId)
}
