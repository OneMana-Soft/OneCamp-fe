"use client"

import * as React from "react"
import { cn } from "@/lib/utils/helpers/cn"
import { useToast } from "@/hooks/use-toast"
import { Plus } from "@/lib/icons"
import {
  TableField,
  TableRow,
  SelectOption,
  parseFieldConfig,
  parseRowValues,
  createRow,
  updateRow,
} from "@/services/tableService"

interface DataTableBoardProps {
  tableId: string
  fields: TableField[]
  rows: TableRow[]
  canManage: boolean
  // groupFieldId picks the select column to group by; falls back to the first
  // select field in the table.
  groupFieldId?: string
  onChange: () => void
}

const NO_VALUE = "__none__"

// formatCardValue renders a row value for a compact board card: arrays (multi
// select / relation) become a short, comma-joined label list; objects fall back
// to their label; scalars are stringified. Empty values return "".
function formatCardValue(v: unknown): string {
  if (v === undefined || v === null || v === "") return ""
  if (Array.isArray(v)) {
    return v
      .map((item) =>
        item && typeof item === "object" ? String((item as { label?: string }).label ?? "") : String(item),
      )
      .filter(Boolean)
      .join(", ")
  }
  if (typeof v === "object") return String((v as { label?: string }).label ?? "")
  if (typeof v === "boolean") return v ? "Yes" : "No"
  return String(v)
}

// DataTableBoard is a Kanban view: cards (rows) grouped into columns by a
// single-select field. Dragging a card between columns updates that field.
export function DataTableBoard({
  tableId,
  fields,
  rows,
  groupFieldId,
  onChange,
}: DataTableBoardProps) {
  const { toast } = useToast()
  const [dragRowId, setDragRowId] = React.useState<string | null>(null)

  const sortedFields = React.useMemo(
    () => [...fields].sort((a, b) => a.position - b.position),
    [fields],
  )

  // The field we group by: explicit config, else the first select field.
  const groupField = React.useMemo(() => {
    if (groupFieldId) {
      const f = fields.find((x) => x.id === groupFieldId)
      if (f) return f
    }
    return fields.find((f) => f.type === "select")
  }, [fields, groupFieldId])

  // The primary display field for a card title: the first text field, else the
  // first field.
  const titleField = React.useMemo(
    () => sortedFields.find((f) => f.type === "text") || sortedFields[0],
    [sortedFields],
  )

  const columns: { key: string; label: string; color?: string }[] = React.useMemo(() => {
    if (!groupField) return []
    const options = (parseFieldConfig(groupField).options || []) as SelectOption[]
    return [
      ...options.map((o) => ({ key: o.label, label: o.label, color: o.color })),
      { key: NO_VALUE, label: "No value" },
    ]
  }, [groupField])

  const rowsByColumn = React.useMemo(() => {
    const map: Record<string, TableRow[]> = {}
    for (const c of columns) map[c.key] = []
    for (const r of rows) {
      const v = groupField ? (parseRowValues(r)[groupField.id] as string) || NO_VALUE : NO_VALUE
      const key = map[v] ? v : NO_VALUE
      ;(map[key] || (map[key] = [])).push(r)
    }
    return map
  }, [rows, columns, groupField])

  if (!groupField) {
    return (
      <div className="px-4 py-12 text-center text-sm text-muted-foreground">
        Add a Select column to use the board view, then set options to create columns.
      </div>
    )
  }

  const moveCard = async (row: TableRow, toColumn: string) => {
    const current = parseRowValues(row)
    const nextVal = toColumn === NO_VALUE ? "" : toColumn
    if ((current[groupField.id] || "") === nextVal) return
    try {
      await updateRow(tableId, row.id, { ...current, [groupField.id]: nextVal }, row.position)
      onChange()
    } catch {
      onChange()
    }
  }

  const addCard = async (column: string) => {
    try {
      const pos = rows.length ? Math.max(...rows.map((r) => r.position)) + 1 : 0
      const values = column === NO_VALUE ? {} : { [groupField.id]: column }
      await createRow(tableId, values, pos)
      onChange()
    } catch {
      toast({ title: "Could not add card", variant: "destructive" })
    }
  }

  return (
    <div className="flex gap-3 overflow-x-auto p-3">
      {columns.map((col) => (
        <div
          key={col.key}
          className="flex w-72 shrink-0 flex-col rounded-xl bg-muted/30"
          onDragOver={(e) => e.preventDefault()}
          onDrop={() => {
            const row = rows.find((r) => r.id === dragRowId)
            if (row) moveCard(row, col.key)
            setDragRowId(null)
          }}
        >
          <div className="flex items-center justify-between px-3 py-2 text-sm font-medium">
            <span className="truncate">{col.label}</span>
            <span className="ml-2 rounded-full bg-background px-1.5 text-xs text-muted-foreground">
              {rowsByColumn[col.key]?.length || 0}
            </span>
          </div>
          <div className="flex flex-col gap-2 px-2 pb-2">
            {(rowsByColumn[col.key] || []).map((row) => {
              const values = parseRowValues(row)
              const title = titleField ? String(values[titleField.id] ?? "") : ""
              return (
                <div
                  key={row.id}
                  draggable
                  onDragStart={() => setDragRowId(row.id)}
                  className={cn(
                    "cursor-grab rounded-lg border border-border/60 bg-background p-3 text-sm shadow-sm transition-opacity active:cursor-grabbing",
                    dragRowId === row.id && "opacity-50",
                  )}
                >
                  <p className="font-medium">{title || "Untitled"}</p>
                  <div className="mt-1 space-y-0.5">
                    {sortedFields
                      .filter((f) => f.id !== titleField?.id && f.id !== groupField.id)
                      .slice(0, 3)
                      .map((f) => {
                        const cellVal = values[f.id]
                        const text = formatCardValue(cellVal)
                        if (!text) return null
                        return (
                          <p key={f.id} className="truncate text-xs text-muted-foreground">
                            <span className="opacity-60">{f.name}: </span>
                            {text}
                          </p>
                        )
                      })}
                  </div>
                </div>
              )
            })}
            <button
              onClick={() => addCard(col.key)}
              className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-background hover:text-foreground"
            >
              <Plus className="h-3.5 w-3.5" /> Add card
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}

export default DataTableBoard
