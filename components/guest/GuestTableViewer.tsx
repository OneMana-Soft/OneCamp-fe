"use client"

/**
 * GuestTableViewer — a read-only render of a shared table for an external guest.
 * Tables are Postgres-backed (not collaborative), so the guest gets a clean
 * static view of the bundle. Deliberately isolated from the member DataTableGrid
 * (which is edit/MQTT/auth-coupled): no inline editing, no live subscription, no
 * authenticated calls.
 */

import * as React from "react"
import {
  TableField,
  TableRow,
  RelationRef,
  SelectOption,
  parseFieldConfig,
  parseRowValues,
} from "@/services/tableService"
import { Check } from "@/lib/icons"

interface GuestTableViewerProps {
  fields: TableField[]
  rows: TableRow[]
}

function optionColorClass(color?: string): string {
  // Map a stored option color to a subtle chip style; fall back to muted.
  switch ((color || "").toLowerCase()) {
    case "red":
      return "bg-red-500/10 text-red-700 dark:text-red-300"
    case "green":
      return "bg-green-500/10 text-green-700 dark:text-green-300"
    case "blue":
      return "bg-blue-500/10 text-blue-700 dark:text-blue-300"
    case "yellow":
      return "bg-yellow-500/10 text-yellow-700 dark:text-yellow-300"
    case "purple":
      return "bg-purple-500/10 text-purple-700 dark:text-purple-300"
    case "orange":
      return "bg-orange-500/10 text-orange-700 dark:text-orange-300"
    default:
      return "bg-muted text-muted-foreground"
  }
}

function Chip({ label, color }: { label: string; color?: string }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${optionColorClass(color)}`}>
      {label}
    </span>
  )
}

function CellValue({ field, value }: { field: TableField; value: unknown }) {
  if (value === null || value === undefined || value === "") {
    return <span className="text-muted-foreground/40">—</span>
  }

  switch (field.type) {
    case "checkbox":
      return value ? <Check className="h-4 w-4 text-primary" /> : <span className="text-muted-foreground/40">—</span>

    case "select": {
      const opts = parseFieldConfig(field).options as SelectOption[] | undefined
      const match = opts?.find((o) => o.label === String(value))
      return <Chip label={String(value)} color={match?.color} />
    }

    case "multi_select": {
      const opts = parseFieldConfig(field).options as SelectOption[] | undefined
      const arr = Array.isArray(value) ? value : [value]
      return (
        <span className="flex flex-wrap gap-1">
          {arr.map((v, i) => {
            const label = String(v)
            const match = opts?.find((o) => o.label === label)
            return <Chip key={i} label={label} color={match?.color} />
          })}
        </span>
      )
    }

    case "relation": {
      const refs = Array.isArray(value) ? (value as RelationRef[]) : []
      if (refs.length === 0) return <span className="text-muted-foreground/40">—</span>
      return (
        <span className="flex flex-wrap gap-1">
          {refs.map((r, i) => (
            <Chip key={r?.id || i} label={r?.label || String(r?.id || "")} />
          ))}
        </span>
      )
    }

    case "date": {
      const d = new Date(String(value))
      return <span>{isNaN(d.getTime()) ? String(value) : d.toLocaleDateString()}</span>
    }

    case "url":
      return (
        <a href={String(value)} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
          {String(value)}
        </a>
      )

    case "email":
      return (
        <a href={`mailto:${String(value)}`} className="text-primary hover:underline">
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
    return <p className="py-12 text-center text-sm text-muted-foreground">This table has no columns yet.</p>
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/40">
            {sortedFields.map((f) => (
              <th key={f.id} className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground whitespace-nowrap">
                {f.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sortedRows.length === 0 ? (
            <tr>
              <td colSpan={sortedFields.length} className="px-3 py-10 text-center text-sm text-muted-foreground">
                No rows yet.
              </td>
            </tr>
          ) : (
            sortedRows.map((row) => {
              const values = parseRowValues(row)
              return (
                <tr key={row.id} className="border-b border-border/60 last:border-0 hover:bg-muted/30">
                  {sortedFields.map((f) => (
                    <td key={f.id} className="px-3 py-2 align-top">
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

export default GuestTableViewer
