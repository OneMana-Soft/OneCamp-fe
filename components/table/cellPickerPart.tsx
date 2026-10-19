"use client"

import * as React from "react"
import { Loader2 } from "@/lib/icons"
import { lazyView } from "@/components/task/LazyView"

/**
 * The grid's cell pickers (cellPickers.tsx): one chunk, loaded the first time
 * a select's, a date's or a link's picker opens, and warmed once the table is
 * drawn (warmCellPickers), so a picker opens at once.
 */
export const cellPickers = lazyView(() => import("@/components/table/cellPickers"))

/** Starts loading the pickers: the table is drawn and the page is idle. */
export const warmCellPickers = () => void cellPickers.warm().catch(() => {})

/** A picker while its chunk is on its way: a moment, the first time. */
export function PickerLoading() {
  return (
    <div className="content-float flex h-10 w-64 items-center gap-2 rounded-xl px-3 text-meta text-ink-3 shadow-e3" role="status">
      <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> Opening…
    </div>
  )
}
