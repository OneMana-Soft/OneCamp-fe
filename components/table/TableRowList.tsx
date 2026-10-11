"use client"

import * as React from "react"
import "./table.css"
import { ChevronRight, Plus } from "@/lib/icons"
import { parseFieldConfig, parseRowValues, type TableField, type TableRow } from "@/services/tableService"
import { OptionChip, chipsTinted } from "@/components/table/optionChip"
import { formatNumber, numberFormatOf, shortDay } from "@/lib/tables/cellFormat"
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
      const opts = parseFieldConfig(f).options || []
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
      return Array.isArray(v) ? (v as { label?: string }[]).map((r) => r.label).filter(Boolean).slice(0, 2).join(", ") : null
    default:
      return String(v)
  }
}

/**
 * A table on a phone with more than four fields (content.md T22): each row a
 * 60 px line with its primary value and two or three others under it; a tap
 * opens the record panel as a sheet. The grid stays one toggle away.
 */
export function TableRowList({
  fields,
  rows,
  onOpen,
  onAdd,
  empty,
}: {
  fields: TableField[]
  rows: TableRow[]
  onOpen: (rowId: string) => void
  onAdd?: () => void
  empty?: React.ReactNode
}) {
  const sorted = React.useMemo(() => [...fields].sort((a, b) => a.position - b.position), [fields])
  const [primary, ...rest] = sorted
  return (
    <div data-table-list="">
      {rows.length === 0 ? empty : null}
      <ul className="v3-grid-list">
        {rows.map((r) => {
          const values = parseRowValues(r)
          const meta = rest
            .map((f) => ({ f, node: brief(f, values[f.id]) }))
            .filter((m) => m.node !== null)
            .slice(0, 3)
          return (
            <li key={r.id}>
              <button type="button" onClick={() => onOpen(r.id)} className="flex min-h-[60px] w-full items-center gap-3 py-2 text-left active:bg-press">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-ui font-medium text-ink">{primary ? String(values[primary.id] ?? "") || "Untitled" : "Untitled"}</span>
                  {meta.length ? (
                    <span className="mt-0.5 flex min-w-0 items-center gap-2 overflow-hidden text-meta text-ink-3">
                      {meta.map((m, i) => (
                        <React.Fragment key={m.f.id}>
                          {i > 0 ? <span aria-hidden="true">·</span> : null}
                          <span className="shrink-0 truncate">{m.node}</span>
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
      {onAdd ? (
        <button type="button" onClick={onAdd} className="flex h-11 w-full items-center gap-2 text-ui text-ink-3 active:bg-press">
          <Plus className="size-4" aria-hidden="true" /> New row
        </button>
      ) : null}
    </div>
  )
}
