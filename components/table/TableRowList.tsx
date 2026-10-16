"use client"

import * as React from "react"
import { useVirtualizer } from "@tanstack/react-virtual"
import "./table.css"
import { ChevronRight, Plus } from "@/lib/icons"
import { TABLE_VIEW_BODY } from "@/components/table/TableViewFrame"
import { optionsOf, parseRowValues, type TableField, type TableRow } from "@/services/tableService"
import { OptionChip, chipsTinted } from "@/components/table/optionChip"
import { formatNumber, listText, numberFormatOf, shortDay } from "@/lib/tables/cellFormat"
import { dayOf } from "@/components/table/gridCells"
import { showFormulaValue } from "@/lib/tables/formula"
import { computedOf } from "@/services/tableService"

/** A value as one short line of text, for a list row's meta. */
function brief(f: TableField, v: unknown): React.ReactNode {
  if (v === undefined || v === null || v === "" || (Array.isArray(v) && !v.length)) return null
  switch (f.type) {
    case "number": {
      const n = formatNumber(v, numberFormatOf(f))
      return n ? `${n.prefix}${n.text}${n.suffix}` : null
    }
    case "date": {
      const d = dayOf(v)
      return d ? shortDay(d) : null
    }
    case "checkbox":
      return v ? `${f.name} ✓` : null
    case "select":
    case "multi_select": {
      const labels = Array.isArray(v) ? (v as string[]) : [String(v)]
      const opts = optionsOf(f)
      return (
        <span className="inline-flex gap-1">
          {labels.slice(0, 2).map((l) => (
            <OptionChip key={l} label={l} color={opts.find((o) => o.label === l)?.color} tinted={chipsTinted(f)} className="h-5" />
          ))}
        </span>
      )
    }
    case "formula":
    case "rollup": {
      const s = showFormulaValue(v, computedOf(f).result)
      return s.kind === "number" || s.kind === "text" ? s.text : null
    }
    case "relation":
      return Array.isArray(v) ? listText(v.slice(0, 2)) || null : null
    default:
      return String(v)
  }
}

/** A list row's height: every row is one, so the window is worked out, never measured. */
const LIST_ROW_PX = 60
/** Rows drawn before the list's frame has been measured: a phone's screenful. */
const FIRST_SCREEN_ROWS = 14
/** How near the last row given the view gets before the page reads more: about three screens. */
const NEAR_END_ROWS = 40

/**
 * A table on a phone with more than four fields (content.md T22): each row a
 * 60 px line with its primary value and two or three others under it; a tap
 * opens the record panel as a sheet. The grid stays one toggle away.
 *
 * Only the rows in view (and a few either side) are in the page, with the
 * grid's virtualizer: drawing every row held took a phone 15 s to show the
 * first of 10,000.
 */
export function TableRowList({
  fields,
  rows,
  onOpen,
  onAdd,
  empty,
  onNearEnd,
  scrollTo,
}: {
  fields: TableField[]
  rows: TableRow[]
  onOpen: (rowId: string) => void
  onAdd?: () => void
  empty?: React.ReactNode
  /** The rows in view near the last one given: the page reads a page more. */
  onNearEnd?: () => void
  /** A row to bring into view (one just added), with the window's own scroll. */
  scrollTo?: string | null
}) {
  const sorted = React.useMemo(() => [...fields].sort((a, b) => a.position - b.position), [fields])
  const [primary, ...rest] = sorted
  const scrollRef = React.useRef<HTMLDivElement>(null)
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => LIST_ROW_PX,
    overscan: 8,
    initialRect: { width: 390, height: 720 },
    getItemKey: (i) => rows[i]?.id ?? i,
  })
  const measured = virtualizer.getVirtualItems()
  const items = measured.length || !rows.length ? measured : Array.from({ length: Math.min(rows.length, FIRST_SCREEN_ROWS) }, (_, index) => ({ index, start: index * LIST_ROW_PX, end: (index + 1) * LIST_ROW_PX }))
  const padTop = items.length ? items[0].start : 0
  const padBottom = items.length ? virtualizer.getTotalSize() - items[items.length - 1].end : 0
  // Once, when the row is among those given: a later refresh never pulls the
  // list back to it.
  const scrolledTo = React.useRef<string | null>(null)
  React.useEffect(() => {
    if (!scrollTo || scrolledTo.current === scrollTo) return
    const index = rows.findIndex((r) => r.id === scrollTo)
    if (index < 0) return
    scrolledTo.current = scrollTo
    virtualizer.scrollToIndex(index, { align: "auto" })
  }, [scrollTo, rows, virtualizer])
  const last = items.length ? items[items.length - 1].index : -1
  React.useEffect(() => {
    if (onNearEnd && rows.length && last >= rows.length - NEAR_END_ROWS) onNearEnd()
  }, [onNearEnd, last, rows.length])
  return (
    <div data-table-list="">
      {rows.length === 0 ? empty : null}
      <div ref={scrollRef} className={TABLE_VIEW_BODY}>
        <ul className="v3-grid-list" style={{ paddingTop: padTop, paddingBottom: padBottom }}>
          {items.map(({ index }) => {
            const r = rows[index]
            if (!r) return null
            const values = parseRowValues(r)
            const meta = rest
              .map((f) => ({ f, node: brief(f, values[f.id]) }))
              .filter((m) => m.node !== null)
              .slice(0, 3)
            return (
              <li key={r.id} aria-setsize={rows.length} aria-posinset={index + 1}>
                <button type="button" onClick={() => onOpen(r.id)} className="flex h-[60px] w-full items-center gap-3 py-2 text-left active:bg-press">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-ui font-medium text-ink">{primary ? String(values[primary.id] ?? "") || "Untitled" : "Untitled"}</span>
                    {meta.length ? (
                      <span className="mt-0.5 flex min-w-0 items-center gap-2 overflow-hidden text-meta text-ink-3">
                        {meta.map((m, i) => (
                          <React.Fragment key={m.f.id}>
                            {i > 0 ? <span aria-hidden="true">·</span> : null}
                            {/* Each value named, as a board card names its details: "1,200 · 1 · 11 Oct" said nothing of what they were (QA PTC-46). */}
                            <span className="shrink-0 truncate">
                              <span className="text-ink-3">{m.f.name} </span>
                              {m.node}
                            </span>
                          </React.Fragment>
                        ))}
                      </span>
                    ) : null}
                  </span>
                  <ChevronRight className="size-4 shrink-0 text-ink-4" aria-hidden="true" />
                </button>
              </li>
            )
          })}
        </ul>
      </div>
      {onAdd ? (
        <button type="button" onClick={onAdd} className="flex h-11 w-full items-center gap-2 text-ui text-ink-3 active:bg-press">
          <Plus className="size-4" aria-hidden="true" /> New row
        </button>
      ) : null}
    </div>
  )
}
