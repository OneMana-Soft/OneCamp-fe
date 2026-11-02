"use client"

import * as React from "react"
import { apiErrorStatus } from "@/lib/utils/apiError"

// Who edits a table's rows (V-170). Its owner chooses: everyone who can open
// it, only the people they choose, or only its managers; the bundle says
// whether its reader does (can_edit). The page provides that answer once, and
// every surface that writes a row (the grid, the record, the drags, find and
// replace, AI fill, import, the trash) reads it here, so a reader who may only
// view the table finds nothing to write with. The server refuses such a write
// anyway (403, read_only); refusedAsViewer tells that refusal apart, so the
// page reads its level again at once.

export { EDITORS_CHOSEN, READ_ONLY_WORDS, VIEW_ONLY_WHY } from "@/lib/tables/readOnlyWords"

const TableEditContext = React.createContext(true)

/** Whether the reader edits the table's rows: true wherever no page says otherwise. */
export function useTableEdit(): boolean {
  return React.useContext(TableEditContext)
}

/** Says, for everything under it, whether the reader edits the table's rows. */
export function TableEditProvider({ value, children }: { value: boolean; children: React.ReactNode }) {
  return <TableEditContext.Provider value={value}>{children}</TableEditContext.Provider>
}

/** A write refused because its writer may only view the table (403 with read_only), not for any other reason. */
export function refusedAsViewer(error: unknown): boolean {
  if (apiErrorStatus(error) !== 403) return false
  const data = (error as { response?: { data?: unknown } }).response?.data
  return typeof data === "object" && data !== null && (data as { read_only?: unknown }).read_only === true
}
