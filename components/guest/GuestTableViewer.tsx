"use client"

/**
 * GuestTableViewer — a read-only render of a shared table for an external
 * guest, in the members' grid look (content.md T21): a sticky header with each
 * column's type glyph, hairline rows, the primary column frozen, neutral
 * chips, raised link chips and numbers in the column's format. Deliberately
 * isolated from the member DataTableGrid (which is edit/MQTT/auth-coupled):
 * no inline editing, no live subscription, no authenticated calls.
 */

import * as React from "react"
import "@/components/table/table.css"
import { TableField, TableRow, RelationRef, SelectOption, parseFieldConfig, parseRowValues, computedOf } from "@/services/tableService"
import { Check } from "@/lib/icons"
import { formulaText, showFormulaValue } from "@/lib/tables/formula"
import { OptionChip, chipsTinted } from "@/components/table/optionChip"
import { FIELD_GLYPH, dayOf, isNumeric } from "@/components/table/gridCells"
import { formatNumber, numberFormatOf, safeHref, shortDay, urlHost } from "@/lib/tables/cellFormat"
import { cn } from "@/lib/utils/helpers/cn"

interface GuestTableViewerProps {
  fields: TableField[]
  rows: TableRow[]
}

function CellValue({ field, value }: { field: TableField; value: unknown }) {
  if (value === null || value === undefined || value === "") {
    return <span className="sr-only">Empty</span>
  }

  switch (field.type) {
    case "formula":
    case "rollup": {
      const result = computedOf(field).result
      const shown = showFormulaValue(value, result)
      if (shown.kind === "error")
        return (
          <span className="text-meta font-medium text-danger-ink" title={shown.message}>
            #ERROR
          </span>
        )
      return <span className="text-ink-2">{formulaText(value, result)}</span>
    }

    case "checkbox":
      return value ? <Check className="size-4 text-camp-moss" aria-label="Yes" /> : <span className="sr-only">No</span>

    case "number": {
      const n = formatNumber(value, numberFormatOf(field))
      if (!n) return <span>{String(value)}</span>
      return (
        <span className={cn(n.negative && "text-danger-ink")}>
          {n.prefix ? <span className="text-ink-3">{n.prefix}</span> : null}
          {n.text}
          {n.suffix}
        </span>
      )
    }

    case "select":
    case "multi_select": {
      const opts = (parseFieldConfig(field).options as SelectOption[] | undefined) || []
      const arr = Array.isArray(value) ? value : [value]
      return (
        <span className="flex flex-wrap gap-1">
          {arr.map((v, i) => {
            const label = String(v)
            return <OptionChip key={i} label={label} color={opts.find((o) => o.label === label)?.color} tinted={chipsTinted(field)} />
          })}
        </span>
      )
    }

    case "relation": {
      const refs = Array.isArray(value) ? (value as RelationRef[]) : []
      if (refs.length === 0) return <span className="sr-only">Empty</span>
      return (
        <span className="flex flex-wrap gap-1">
          {refs.map((r, i) => (
            <span key={r?.id || i} className="inline-flex h-[22px] items-center rounded-md bg-raised px-1.5 text-meta font-medium text-ink shadow-e1">
              {r?.label || String(r?.id || "")}
            </span>
          ))}
        </span>
      )
    }

    case "date": {
      const d = dayOf(value)
      return <span>{d ? shortDay(d) : String(value)}</span>
    }

    case "url": {
      const href = safeHref(String(value))
      return href ? (
        <a href={href} target="_blank" rel="noopener noreferrer nofollow" className="text-brand-text hover:underline">
          {urlHost(String(value))}
        </a>
      ) : (
        <span>{String(value)}</span>
      )
    }

    case "email":
      return (
        <a href={`mailto:${String(value)}`} className="text-ink hover:underline">
          {String(value)}
        </a>
      )

    default:
      return <span className="whitespace-pre-wrap break-words">{String(value)}</span>
  }
}

export function GuestTableViewer({ fields, rows }: GuestTableViewerProps) {
  const sortedFields = React.useMemo(() => [...fields].sort((a, b) => a.position - b.position), [fields])
  const sortedRows = React.useMemo(() => [...rows].sort((a, b) => a.position - b.position), [rows])

  if (sortedFields.length === 0) {
    return <p className="px-8 pb-12 pt-6 text-center text-ui text-ink-3">This table has no columns yet.</p>
  }

  return (
    <div className="v3-grid overflow-x-auto pb-4" data-guest-table="">
      <table className="w-full border-separate border-spacing-0 text-ui">
        <thead>
          <tr>
            {sortedFields.map((f, i) => {
              const G = FIELD_GLYPH[f.type] ?? FIELD_GLYPH.text
              return (
                <th
                  key={f.id}
                  scope="col"
                  data-frozen={i === 0 || undefined}
                  className={cn(
                    "h-9 whitespace-nowrap px-3 text-ui-sm font-medium text-ink-2",
                    isNumeric(f) ? "text-right" : "text-left",
                    i === 0 && "!left-0 pl-5 sm:pl-8",
                  )}
                >
                  <span className={cn("inline-flex items-center gap-1.5", isNumeric(f) && "flex-row-reverse")}>
                    <G className="size-3.5 text-ink-3" aria-hidden />
                    {f.name}
                  </span>
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody>
          {sortedRows.length === 0 ? (
            <tr>
              <td colSpan={sortedFields.length} className="px-3 py-10 text-center text-ui text-ink-3">
                No rows yet.
              </td>
            </tr>
          ) : (
            sortedRows.map((row) => {
              const values = parseRowValues(row)
              return (
                <tr key={row.id}>
                  {sortedFields.map((f, i) => (
                    <td
                      key={f.id}
                      data-frozen={i === 0 || undefined}
                      className={cn(
                        "h-10 px-3 py-2 align-middle text-ink",
                        isNumeric(f) && "text-right tabular-nums",
                        i === 0 && "!left-0 pl-5 font-medium sm:pl-8 max-sm:max-w-[140px] max-sm:truncate",
                      )}
                    >
                      <CellValue field={f} value={values[f.id]} />
                    </td>
                  ))}
                </tr>
              )
            })
          )}
        </tbody>
      </table>
    </div>
  )
}
