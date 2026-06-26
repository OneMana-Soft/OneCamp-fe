"use client"

import * as React from "react"
import { cn } from "@/lib/utils/helpers/cn"
import { Button } from "@/components/ui/button"
import { ChevronLeft, ChevronRight, Plus } from "@/lib/icons"
import {
  TableField,
  TableRow,
  parseRowValues,
  createRow,
} from "@/services/tableService"

interface DataTableCalendarProps {
  tableId: string
  fields: TableField[]
  rows: TableRow[]
  canManage: boolean
  // dateFieldId picks the date column to place rows on; falls back to the first
  // date field.
  dateFieldId?: string
  onChange: () => void
}

function toKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`
}

function parseDateValue(v: unknown): string | null {
  if (!v || typeof v !== "string") return null
  // Date-only values (YYYY-MM-DD, from a date input) are already day keys;
  // returning them as-is avoids a UTC/local shift that would move an event to
  // the wrong day in negative-offset timezones.
  const m = v.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (m) return `${m[1]}-${m[2]}-${m[3]}`
  const d = new Date(v)
  if (Number.isNaN(d.getTime())) return null
  return toKey(d)
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]

// DataTableCalendar lays rows out on a month grid by a date field.
export function DataTableCalendar({
  tableId,
  fields,
  rows,
  dateFieldId,
  onChange,
}: DataTableCalendarProps) {
  const [cursor, setCursor] = React.useState(() => {
    const now = new Date()
    return new Date(now.getFullYear(), now.getMonth(), 1)
  })

  const sortedFields = React.useMemo(
    () => [...fields].sort((a, b) => a.position - b.position),
    [fields],
  )

  const dateField = React.useMemo(() => {
    if (dateFieldId) {
      const f = fields.find((x) => x.id === dateFieldId)
      if (f) return f
    }
    return fields.find((f) => f.type === "date")
  }, [fields, dateFieldId])

  const titleField = React.useMemo(
    () => sortedFields.find((f) => f.type === "text") || sortedFields[0],
    [sortedFields],
  )

  const rowsByDay = React.useMemo(() => {
    const map: Record<string, TableRow[]> = {}
    if (!dateField) return map
    for (const r of rows) {
      const key = parseDateValue(parseRowValues(r)[dateField.id])
      if (!key) continue
      ;(map[key] || (map[key] = [])).push(r)
    }
    return map
  }, [rows, dateField])

  if (!dateField) {
    return (
      <div className="px-4 py-12 text-center text-sm text-muted-foreground">
        Add a Date column to use the calendar view.
      </div>
    )
  }

  // Build a 6-week grid starting on the Sunday on/before the 1st.
  const monthStart = new Date(cursor.getFullYear(), cursor.getMonth(), 1)
  const gridStart = new Date(monthStart)
  gridStart.setDate(gridStart.getDate() - gridStart.getDay())
  const days: Date[] = []
  for (let i = 0; i < 42; i++) {
    const d = new Date(gridStart)
    d.setDate(gridStart.getDate() + i)
    days.push(d)
  }

  const todayKey = toKey(new Date())
  const monthLabel = cursor.toLocaleDateString(undefined, { month: "long", year: "numeric" })

  const addOnDay = async (d: Date) => {
    try {
      const pos = rows.length ? Math.max(...rows.map((r) => r.position)) + 1 : 0
      await createRow(tableId, { [dateField.id]: toKey(d) }, pos)
      onChange()
    } catch {
      onChange()
    }
  }

  return (
    <div className="p-3">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold">{monthLabel}</h3>
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon"
            className="h-7 w-7"
            onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-7"
            onClick={() => {
              const now = new Date()
              setCursor(new Date(now.getFullYear(), now.getMonth(), 1))
            }}
          >
            Today
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="h-7 w-7"
            onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-7 border-l border-t border-border/50">
        {WEEKDAYS.map((w) => (
          <div
            key={w}
            className="border-b border-r border-border/50 bg-muted/30 px-2 py-1 text-center text-xs font-medium text-muted-foreground"
          >
            {w}
          </div>
        ))}
        {days.map((d) => {
          const key = toKey(d)
          const inMonth = d.getMonth() === cursor.getMonth()
          const dayRows = rowsByDay[key] || []
          return (
            <div
              key={key}
              className={cn(
                "group min-h-[96px] border-b border-r border-border/50 p-1 text-xs",
                !inMonth && "bg-muted/20 text-muted-foreground/60",
              )}
            >
              <div className="flex items-center justify-between">
                <span
                  className={cn(
                    "inline-flex h-5 w-5 items-center justify-center rounded-full",
                    key === todayKey && "bg-primary text-primary-foreground",
                  )}
                >
                  {d.getDate()}
                </span>
                <button
                  onClick={() => addOnDay(d)}
                  className="opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100"
                  title="Add row on this day"
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="mt-1 space-y-1">
                {dayRows.map((row) => {
                  const values = parseRowValues(row)
                  const title = titleField ? String(values[titleField.id] ?? "") : ""
                  return (
                    <div
                      key={row.id}
                      className="truncate rounded bg-primary/10 px-1.5 py-0.5 text-[11px] text-foreground"
                      title={title}
                    >
                      {title || "Untitled"}
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default DataTableCalendar
