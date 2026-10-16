"use client"

import * as React from "react"
import { cn } from "@/lib/utils/helpers/cn"
import { Button } from "@/components/ui/button"
import { ChevronLeft, ChevronRight, Plus } from "@/lib/icons"
import { addDays, format, isToday, isWeekend, startOfWeek } from "date-fns"
import { DayOverflowPopover } from "@/components/calendar/dayOverflowPopover"
import { rowDetails } from "@/components/table/DataTableBoard"
import { formatLocale } from "@/lib/tables/numberFormat"
import { WEEK_STARTS_ON } from "@/components/calendar/calendarLayout"
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
  /**
   * The month on screen, when the page keeps it: its controls then sit in the
   * view's toolbar row (CalendarMonthNav) instead of a second row of their own.
   */
  month?: Date
  /** A row added here, for the page to open its record (TAB-BUG-14); without it, the calendar asks for the table again. */
  onCreated?: (rows: TableRow[], focus?: boolean) => void
  /** Opens the grid, where a date column is added. */
  onOpenGrid?: () => void
  /** Opens a row's record (content.md T17): its chip is a button when given. */
  onOpenRow?: (rowId: string) => void
  /** A phone: a dot per row on each day, and the picked day's rows listed below. */
  compact?: boolean
}

/** The first of the month a date is in. */
export const monthOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1)

/** Rows a day shows; the rest are behind "+N more", as the Calendar's month does. */
export const DAY_FIRST = 3

/**
 * The calendar view's month, back and forward: in the table's toolbar row, at
 * its end, the height of Sort and Filter beside it.
 */
export function CalendarMonthNav({ month, onMonth }: { month: Date; onMonth: (m: Date) => void }) {
  // The Calendar's own order and pieces: the month, back and forward, Today.
  return (
    <div className="flex items-center gap-1" data-calendar-month-nav="">
      <span className="mr-1 text-ui-sm font-semibold text-ink tabular-nums" aria-live="polite">
        {format(month, "MMMM yyyy")}
      </span>
      <Button aria-label="Previous month" title="Previous month" variant="ghost" size="icon-sm" onClick={() => onMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}>
        <ChevronLeft />
      </Button>
      <Button aria-label="Next month" title="Next month" variant="ghost" size="icon-sm" onClick={() => onMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}>
        <ChevronRight />
      </Button>
      <Button variant="secondary" size="xs" onClick={() => onMonth(monthOf(new Date()))}>
        Today
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

// DataTableCalendar lays rows out on a month grid by a date field.
export function DataTableCalendar({
  tableId,
  fields,
  rows,
  dateFieldId,
  onChange,
  onCreated,
  month,
  onOpenGrid,
  onOpenRow,
  compact = false,
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

  // Six weeks from the week the 1st is in, starting on the calendar's own
  // first day (Monday): a table's month and the Calendar's are one grid.
  const monthStart = new Date(cursor.getFullYear(), cursor.getMonth(), 1)
  const gridStart = startOfWeek(monthStart, { weekStartsOn: WEEK_STARTS_ON })
  const days = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i))

  const todayKey = localDay(new Date())
  // Rows wear the table's own hue, the one its icon tile has: the accent is
  // for the one action on a view, and every row was an orange chip.
  const hue = HUE_CLASS[hueFor(tableId)]

  // A row on its day: its title on the table's hue, opening its record when it can.
  const rowChip = (row: TableRow, picked?: () => unknown) => {
    const values = parseRowValues(row)
    const title = titleField ? cardTitle(titleField, values[titleField.id]) : ""
    const chip = cn(
      "relative flex h-[22px] w-full min-w-0 shrink-0 items-center overflow-hidden rounded-md pl-[9px] pr-1.5 text-left text-meta font-medium text-hue-ink",
      "bg-[color-mix(in_oklab,var(--hue-tint)_60%,var(--sheet))]",
      hue,
    )
    const body = (
      <>
        <span aria-hidden="true" className="absolute inset-y-0 left-0 w-[3px] bg-hue" />
        <span className="truncate">{title || "Untitled"}</span>
      </>
    )
    return onOpenRow ? (
      <button
        key={row.id}
        type="button"
        onClick={() => {
          picked?.()
          onOpenRow(row.id)
        }}
        className={cn(chip, "outline-none transition-[filter] hover:brightness-[0.97] focus-visible:ring-2 focus-visible:ring-brand")}
        title={title}
        data-table-calendar-row=""
      >
        {body}
      </button>
    ) : (
      <div key={row.id} className={chip} title={title} data-table-calendar-row="">
        {body}
      </div>
    )
  }

  const addOnDay = async (d: Date) => {
    try {
      const r = await createRow(tableId, { [dateField.id]: localDay(d) })
      if (onCreated && r?.id) onCreated([r], true)
      else onChange()
    } catch {
      onChange()
    }
  }

  if (compact) {
    return (
      <div className={TABLE_VIEW_BODY} data-table-calendar="" data-compact="">
        {!month && (
          <div className="flex items-center justify-end border-b border-border/50 px-2 py-1.5">
            <CalendarMonthNav month={cursor} onMonth={setCursor} />
          </div>
        )}
        <PhoneMonth
          // A new month picks its own day.
          key={`${cursor.getFullYear()}-${cursor.getMonth()}`}
          cursor={cursor}
          days={days}
          rowsByDay={rowsByDay}
          todayKey={todayKey}
          hue={hue}
          title={(row) => (titleField ? cardTitle(titleField, parseRowValues(row)[titleField.id]) : "") || "Untitled"}
          details={(row) =>
            rowDetails(sortedFields, parseRowValues(row), [titleField?.id, dateField.id], 2)
              .map((d) => `${d.f.name} ${d.text}`)
              .join(" · ")
          }
          onOpenRow={onOpenRow}
          onAdd={(d) => void addOnDay(d)}
        />
      </div>
    )
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
      {/* The Calendar's month (content.md C05, T17): hairlines between days,
          weekday names left at 10 px, weekends on --sunken, the date at the
          top left, and today a brand ring with a brand line along the top of
          its cell, never a filled disc. Flush with the frame, as the grid is. */}
      <div className="grid grid-cols-7 [&>*:nth-child(7n)]:border-r-0" data-month-grid="">
        {days.slice(0, 7).map((d) => (
          <div
            key={`w${d.getDay()}`}
            data-weekend={isWeekend(d) || undefined}
            className={cn("flex h-8 items-center border-b border-r border-line px-2.5 text-meta font-medium text-ink-3", isWeekend(d) && "bg-sunken")}
          >
            {format(d, "EEE")}
          </div>
        ))}
        {days.map((d) => {
          const key = localDay(d)
          const inMonth = d.getMonth() === cursor.getMonth()
          const today = key === todayKey
          const dayRows = rowsByDay[key] || []
          return (
            <div
              key={key}
              data-weekend={isWeekend(d) || undefined}
              data-today={today || undefined}
              data-outside={!inMonth || undefined}
              className={cn("group relative min-h-[104px] border-b border-r border-line p-1.5", isWeekend(d) && "bg-sunken")}
            >
              {today ? <span aria-hidden="true" className="absolute inset-x-0 top-0 h-0.5 bg-brand" /> : null}
              <div className="flex items-center justify-between">
                <span
                  className={cn(
                    "inline-flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-ui-sm font-medium tabular-nums",
                    !inMonth ? "text-ink-3" : today ? "font-semibold text-brand-text ring-[1.5px] ring-inset ring-brand" : "text-ink-2",
                    inMonth && d.getDate() === 1 && !today && "font-semibold text-ink",
                  )}
                >
                  {d.getDate() === 1 && !today ? format(d, "d MMM") : d.getDate()}
                </span>
                <button
                  type="button"
                  onClick={() => addOnDay(d)}
                  className="extend-touch-target grid size-5 place-items-center rounded-md text-ink-3 opacity-0 pointer-events-none transition-opacity hover:bg-hover hover:text-ink focus-visible:opacity-100 focus-visible:pointer-events-auto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand group-hover:opacity-100 group-hover:pointer-events-auto [@media(hover:none)]:opacity-100 [@media(hover:none)]:pointer-events-auto"
                  aria-label={`Add a row on ${format(d, "d MMMM")}`}
                  title="Add a row on this day"
                >
                  <Plus className="size-3.5" aria-hidden="true" />
                </button>
              </div>
              <div className={cn("mt-1 space-y-0.5", !inMonth && "opacity-55")}>
                {dayRows.slice(0, DAY_FIRST).map((row) => rowChip(row))}
                {dayRows.length > DAY_FIRST ? (
                  // The Calendar's own "+N more" (components/calendar): every row of a busy day, drawn when asked.
                  <DayOverflowPopover day={d} hidden={dayRows.length - DAY_FIRST} today={today} add={{ label: "Add a row", onAdd: () => void addOnDay(d) }}>
                    {(done) => dayRows.map((row) => rowChip(row, done))}
                  </DayOverflowPopover>
                ) : null}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/**
 * A table's month on a phone (QA PG2-11): seven narrow columns drew a "+" in
 * every day and chips cut to a letter ("C…", "Pr…"). As the Calendar's month
 * does on a phone, a day shows a dot per row (three at most) and a tap picks
 * it; the picked day's rows are listed under the month as its agenda lists a
 * day (a hue bar, the title, the row's first fields), with "Add a row" for
 * that day alone. It opens on today, or the month's first busy day.
 */
function PhoneMonth({
  cursor,
  days,
  rowsByDay,
  todayKey,
  hue,
  title,
  details,
  onOpenRow,
  onAdd,
}: {
  cursor: Date
  days: Date[]
  rowsByDay: Record<string, TableRow[]>
  todayKey: string
  hue: string
  title: (row: TableRow) => string
  details: (row: TableRow) => string
  onOpenRow?: (rowId: string) => void
  onAdd: (day: Date) => void
}) {
  const inMonth = (d: Date) => d.getMonth() === cursor.getMonth()
  const [picked, setPicked] = React.useState(() => {
    const first = days.find((d) => inMonth(d) && localDay(d) === todayKey) ?? days.find((d) => inMonth(d) && (rowsByDay[localDay(d)]?.length ?? 0) > 0)
    return first ?? new Date(cursor.getFullYear(), cursor.getMonth(), 1)
  })
  const pickedKey = localDay(picked)
  const dayRows = rowsByDay[pickedKey] ?? []
  const rowsWord = (n: number) => (n === 0 ? "no rows" : n === 1 ? "1 row" : `${formatLocale(n, {})} rows`)
  const dayName = isToday(picked) ? "Today" : format(picked, "EEEE d MMM")
  return (
    <>
      <div className="grid grid-cols-7" data-month-grid="">
        {days.slice(0, 7).map((d) => (
          <div key={`w${d.getDay()}`} aria-hidden="true" className={cn("flex h-7 items-center justify-center border-b border-line text-meta font-medium text-ink-3", isWeekend(d) && "bg-sunken")}>
            {format(d, "EEEEE")}
          </div>
        ))}
        {days.map((d) => {
          const key = localDay(d)
          const n = rowsByDay[key]?.length ?? 0
          const today = key === todayKey
          const on = key === pickedKey
          return (
            <button
              key={key}
              type="button"
              onClick={() => setPicked(d)}
              aria-pressed={on}
              aria-current={today ? "date" : undefined}
              aria-label={`${format(d, "EEEE d MMMM")}, ${rowsWord(n)}`}
              data-touch-target=""
              data-day={key}
              className={cn(
                "flex h-12 flex-col items-center justify-center gap-1 border-b border-line outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand",
                isWeekend(d) && "bg-sunken",
                on && "bg-press",
              )}
            >
              <span
                className={cn(
                  "inline-flex size-6 items-center justify-center rounded-full text-ui-sm tabular-nums",
                  !inMonth(d) ? "text-ink-3" : today ? "font-semibold text-brand-text ring-[1.5px] ring-inset ring-brand" : on ? "font-semibold text-ink" : "text-ink-2",
                )}
              >
                {d.getDate()}
              </span>
              <span aria-hidden="true" className={cn("flex h-1.5 items-center gap-0.5", hue, !inMonth(d) && "opacity-55")} data-day-dots={n}>
                {Array.from({ length: Math.min(n, 3) }, (_, i) => (
                  <span key={i} className="size-1.5 rounded-full bg-hue" />
                ))}
              </span>
            </button>
          )
        })}
      </div>
      <section aria-label={`${format(picked, "EEEE d MMMM")}, ${rowsWord(dayRows.length)}`} data-table-calendar-day={pickedKey}>
        <div className="flex h-11 items-center gap-2 pl-4 pr-2">
          <h2 className={cn("min-w-0 flex-1 truncate text-ui-sm font-semibold", isToday(picked) ? "text-ink" : "text-ink-2")}>{dayName}</h2>
          <Button variant="ghost" size="sm" className="gap-1.5" onClick={() => onAdd(picked)} aria-label={`Add a row on ${format(picked, "d MMMM")}`}>
            <Plus className="size-3.5" aria-hidden="true" /> Add a row
          </Button>
        </div>
        {dayRows.length ? (
          <ul className="grid gap-0.5 px-2 pb-4">
            {dayRows.map((row) => {
              const name = title(row)
              const detail = details(row)
              const body = (
                <>
                  <span aria-hidden="true" className={cn("h-8 w-[3px] shrink-0 rounded-[2px] bg-hue", hue)} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-ui font-medium text-ink">{name}</span>
                    {detail ? <span className="block truncate text-meta text-ink-3">{detail}</span> : null}
                  </span>
                </>
              )
              const line = "flex min-h-14 w-full items-center gap-3 rounded-lg px-2 py-2 text-left"
              return (
                <li key={row.id}>
                  {onOpenRow ? (
                    <button type="button" onClick={() => onOpenRow(row.id)} className={cn(line, "outline-none transition-colors hover:bg-hover focus-visible:ring-2 focus-visible:ring-brand")} data-table-calendar-row="">
                      {body}
                    </button>
                  ) : (
                    <div className={line} data-table-calendar-row="">
                      {body}
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        ) : (
          <p className="px-4 pb-4 text-meta text-ink-3">Nothing on this day.</p>
        )}
      </section>
    </>
  )
}
