"use client"

// A row's history in its record (tables A2): who changed what, newest first,
// one line a change ("Maya changed Status from Open to Won · 2h ago"), read
// when the reader opens it, and more on "Show more". A8's record view takes
// it over.

import * as React from "react"
import { Button } from "@/components/ui/button"
import { ChevronDown, ChevronRight, History, Loader2 } from "@/lib/icons"
import { apiErrorMessage } from "@/lib/utils/apiError"
import { agoOrDate, fullDateTime } from "@/lib/utils/date/shortDate"
import { readRowHistory, type HistoryItem } from "@/lib/tables/ledger"
import { historyLines } from "@/lib/tables/history"
import type { TableField } from "@/services/tableService"

export function RowHistory({ tableId, rowId, fields }: { tableId: string; rowId: string; fields: TableField[] }) {
  const [open, setOpen] = React.useState(false)
  const [items, setItems] = React.useState<HistoryItem[] | null>(null)
  const [more, setMore] = React.useState(false)
  const [reading, setReading] = React.useState(false)
  const [failed, setFailed] = React.useState<string | null>(null)

  // Another row's history is read afresh.
  React.useEffect(() => {
    setItems(null)
    setMore(false)
    setFailed(null)
  }, [rowId])

  // The row shown now: an answer for one stepped away from is dropped.
  const shown = React.useRef(rowId)
  shown.current = rowId
  const read = React.useCallback(
    async (before?: string) => {
      setReading(true)
      setFailed(null)
      try {
        const page = await readRowHistory(tableId, rowId, before)
        if (shown.current !== rowId) return
        setItems((have) => (before && have ? [...have, ...page.items] : page.items))
        setMore(page.more)
      } catch (e) {
        if (shown.current === rowId) setFailed(apiErrorMessage(e, "Couldn't read the row's history."))
      } finally {
        setReading(false)
      }
    },
    [tableId, rowId],
  )

  React.useEffect(() => {
    if (open && items === null && !reading && !failed) void read()
  }, [open, items, reading, failed, read])

  const Chevron = open ? ChevronDown : ChevronRight
  return (
    <section data-row-history="" className="mt-6" aria-label="History">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        data-touch-target=""
        className="-mx-1 flex h-8 items-center gap-1.5 rounded-md px-1 text-ui-sm font-medium text-ink-2 outline-none hover:text-ink focus-visible:ring-2 focus-visible:ring-brand"
      >
        <History className="size-3.5 text-ink-3" aria-hidden="true" />
        History
        <Chevron className="size-3.5 text-ink-3" aria-hidden="true" />
      </button>
      {open ? (
        <div className="mt-1">
          {failed ? (
            <p role="alert" className="text-meta text-danger-ink">
              {failed}
            </p>
          ) : items === null ? (
            <Loader2 className="size-3.5 animate-spin text-ink-3" aria-label="Reading the history" />
          ) : items.length === 0 ? (
            <p className="text-meta text-ink-3">Nothing has changed in this row since history was kept.</p>
          ) : (
            <ol className="space-y-1.5">
              {items.map((item) => {
                const at = new Date(item.at)
                const when = isNaN(at.getTime()) ? "" : agoOrDate(at)
                return historyLines(item, fields).map((line, i) => (
                  <li key={`${item.change_set}:${i}`} data-history-line="" className="text-ui-sm text-ink-2">
                    <span className={item.undone ? "text-ink-3 line-through decoration-ink-4" : undefined}>{line}</span>
                    {when ? (
                      <span className="text-meta text-ink-3" title={fullDateTime(at)}>
                        {" "}
                        · {when}
                      </span>
                    ) : null}
                  </li>
                ))
              })}
            </ol>
          )}
          {more && items?.length ? (
            <Button size="sm" variant="ghost" className="-mx-2 mt-1" disabled={reading} onClick={() => void read(items[items.length - 1].change_set)}>
              {reading ? <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> : null}
              Show more
            </Button>
          ) : null}
        </div>
      ) : null}
    </section>
  )
}
