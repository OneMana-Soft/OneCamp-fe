"use client"

import * as React from "react"
import { cn } from "@/lib/utils/helpers/cn"
import { Button } from "@/components/ui/button"
import { ChevronLeft, ChevronRight, Plus } from "@/lib/icons"
import { format } from "date-fns"
import { localDay } from "@/lib/utils/timeZone"
import { hueFor } from "@/lib/campHue"
import { HUE_CLASS } from "@/components/ui/graphics/hues"
import { TableViewState, TABLE_VIEW_BODY } from "@/components/table/TableViewFrame"
import { cardTitle } from "@/lib/tables/formula"
import {
  TableField,
  TableRow,
  parseRowValues,
  createRow,
  nextRowPosition,
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
  /** Where a new row goes, when rows are filtered out of this view: after every row. */
  nextPosition?: number
  /**
   * The month on screen, when the page keeps it: its controls then sit in the
   * view's toolbar row (CalendarMonthNav) instead of a second row of their own.
   */
  month?: Date
  /** Opens the grid, where a date column is added. */
  onOpenGrid?: () => void
}

/** The first of the month a date is in. */
export const monthOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1)

/**
 * The calendar view's month, back and forward: in the table's toolbar row, at
 * its end, the height of Sort and Filter beside it.
 */
export function CalendarMonthNav({ month, onMonth }: { month: Date; onMonth: (m: Date) => void }) {
  return (
    <div className="flex items-center gap-1" data-calendar-month-nav="">
      <span className="mr-1 text-xs font-medium text-foreground tabular-nums" aria-live="polite">
        {format(month, "MMMM yyyy")}
      </span>
      <Button aria-label="Previous month" variant="ghost" size="icon" className="h-7 w-7" onClick={() => onMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}>
        <ChevronLeft className="h-4 w-4" />
      </Button>
      <Button variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={() => onMonth(monthOf(new Date()))}>
        Today
      </Button>
      <Button aria-label="Next month" variant="ghost" size="icon" className="h-7 w-7" onClick={() => onMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}>
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  )
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
  return localDay(d)
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]

// DataTableCalendar lays rows out on a month grid by a date field.
export function DataTableCalendar({
  tableId,
  fields,
  rows,
  dateFieldId,
  onChange,
  nextPosition,
  month,
  onOpenGrid,
}: DataTableCalendarProps) {
  const [ownCursor, setCursor] = React.useState(() => monthOf(new Date()))
  const cursor = month ?? ownCursor

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
    return <TableViewState kind="needs-column" column="date" view="calendar" hue={hueFor(tableId)} onOpenGrid={onOpenGrid} />
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

  const todayKey = localDay(new Date())
  // Rows wear the table's own hue, the one its icon tile has: the accent is
  // for the one action on a view, and every row was an orange chip.
  const hue = HUE_CLASS[hueFor(tableId)]

  const addOnDay = async (d: Date) => {
    try {
      const pos = nextPosition ?? nextRowPosition(rows)
      await createRow(tableId, { [dateField.id]: localDay(d) }, pos)
      onChange()
    } catch {
      onChange()
    }
  }

  return (
    <div className={TABLE_VIEW_BODY} data-table-calendar="">
      {/* Without a page to keep the month (a test, an embed), its controls
          come with it; on the table page they are in the toolbar row. */}
      {!month && (
        <div className="flex items-center justify-end border-b border-border/50 px-2 py-1.5">
          <CalendarMonthNav month={cursor} onMonth={setCursor} />
        </div>
      )}
      {/* Flush with the frame, as the grid is: its lines meet the frame's
          edge instead of a second bordered box 12px inside it. */}
      <div className="grid grid-cols-7 [&>*:nth-child(7n)]:border-r-0">
        {WEEKDAYS.map((w) => (
          <div
            key={w}
            className="border-b border-r border-border/50 bg-muted/30 px-2 py-1 text-center text-xs font-medium text-muted-foreground"
          >
            {w}
          </div>
        ))}
        {days.map((d) => {
          const key = localDay(d)
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
                  type="button"
                  onClick={() => addOnDay(d)}
                  className="rounded-sm opacity-0 pointer-events-none transition-opacity hover:text-foreground focus-visible:opacity-100 focus-visible:pointer-events-auto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 group-hover:opacity-100 group-hover:pointer-events-auto [@media(hover:none)]:opacity-100 [@media(hover:none)]:pointer-events-auto"
                  aria-label={`Add a row on ${format(d, "d MMMM")}`}
                  title="Add a row on this day"
                >
                  <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </div>
              <div className="mt-1 space-y-1">
                {dayRows.map((row) => {
                  const values = parseRowValues(row)
                  const title = titleField ? cardTitle(titleField, values[titleField.id]) : ""
                  return (
                    <div
                      key={row.id}
                      className={cn("truncate rounded-sm border-l-2 border-hue bg-hue-tint px-1.5 py-0.5 text-2xs font-medium text-hue-ink", hue)}
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

