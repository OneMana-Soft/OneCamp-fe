"use client"

import * as React from "react"
import "../table.css"
import { startOfDay } from "date-fns"
import { TimelineHeader } from "@/components/project/timeline/TimelineHeader"
import { ZoomSwitch } from "@/components/project/timeline/ZoomSwitch"
import { useViewWindow } from "@/components/table/viewWindow"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { HUE_CLASS } from "@/components/ui/graphics/hues"
import { hueFor, type CampHue } from "@/lib/campHue"
import { fieldOrder } from "@/lib/tables/fieldOrder"
import { datesOf, dateFields, readTimelineLook, selfLinks, spanOfRow, waitsOn, type RowSpan, type TimelineLook } from "@/lib/tables/tableTimeline"
import { shownValues, type RowEdits } from "@/lib/tables/useCellCommit"
import { applyEdit, barBox, bubbleLabel, DAY_WIDTH, dependencyLinks, offsetOf, timelineRange, type EditKind } from "@/lib/timeline"
import { cn } from "@/lib/utils/helpers/cn"
import { patchRow, type TableField, type TableRow } from "@/services/tableService"

// B4's timeline and Gantt (airtable-05, notion-db-04): a table's rows as bars
// across the days their date fields give them, read through the view's
// windows as the grid reads them (tables T5c). The Gantt draws what each row
// waits on, a link to this table's own rows, as arrows from the end of the
// row it waits on to its start, with the projects' timeline's own routing
// (lib/timeline dependencyLinks), red where the order is broken. A bar
// moves, or one of its ends does, by whole days with the pointer or the
// arrow keys, and writes its row's dates as a cell edit does; the server
// refuses a reader who can't change the row, and the bar goes back.

/** A line's height, as the projects' timeline has it: every line is one, so the window is worked out, never measured. */
const ROW = 36
const FIRST_LINES = 18
const NEAR_END_LINES = 40

type Drag = { id: string; kind: EditKind; x0: number; days: number; moved: boolean }

export function TableTimeline({
  tableId,
  fields,
  rows,
  count,
  tail = 0,
  hues,
  edits,
  look: kept,
  onLook,
  gantt = false,
  compact = false,
  onOpen,
  onNearEnd,
  onChange,
  empty,
}: {
  tableId: string
  fields: TableField[]
  /** The view's rows read, from its first, then its last `tail` rows, added here. */
  rows: TableRow[]
  /** How many rows the view has, read or not: rows' own length unless it reads in windows. */
  count?: number
  tail?: number
  hues?: ReadonlyMap<string, CampHue> | null
  edits: ReadonlyMap<string, RowEdits>
  /** As the view's display keeps it (TableDisplay.timeline). */
  look: unknown
  onLook: (look: TimelineLook) => void
  /** The Gantt: the arrows, and the link they're drawn from. */
  gantt?: boolean
  compact?: boolean
  onOpen: (rowId: string) => void
  onNearEnd?: (last: number) => void
  /** A row's dates were written: the view reads it again. */
  onChange: () => void
  empty?: React.ReactNode
}) {
  const look = React.useMemo(() => readTimelineLook(kept, fields, tableId), [kept, fields, tableId])
  const dates = dateFields(fields)
  const links = selfLinks(fields, tableId)
  const [primary] = fieldOrder(fields)
  const total = count ?? rows.length
  const [today] = React.useState(() => startOfDay(new Date()))
  const scrollRef = React.useRef<HTMLDivElement>(null)
  const { items, padTop, padBottom, rowAt, virtualizer } = useViewWindow({
    given: rows.length,
    count: total,
    tail,
    rowPx: ROW,
    scrollRef,
    overscan: 8,
    initialRect: { width: 1280, height: 800 },
    firstScreen: FIRST_LINES,
    nearEnd: NEAR_END_LINES,
    onNearEnd,
  })

  // Every row read: its values as shown (an edit on its way included), and its days.
  const read = React.useMemo(
    () =>
      rows.map((row) => {
        const values = shownValues(row, edits.get(row.id))
        return { row, values, span: spanOfRow(values, look) }
      }),
    [rows, edits, look],
  )
  const zoom = look.zoom
  const dayWidth = DAY_WIDTH[zoom]
  const range = React.useMemo(() => timelineRange(read.flatMap((r) => (r.span ? [r.span] : [])), today, zoom), [read, today, zoom])
  const gridWidth = range.days * dayWidth
  const nameWidth = compact ? 136 : 248

  // Opened on the first row's days, or today's when it has none, with a little room before: two
  // weeks' at most, a quarter of the days in sight on a phone.
  const placed = React.useRef(false)
  React.useLayoutEffect(() => {
    const el = scrollRef.current
    if (!el || placed.current || !rows.length) return
    placed.current = true
    const first = read.find((r) => r.span)?.span?.start ?? today
    const room = Math.min(2 * dayWidth * (zoom === "day" ? 1 : 7), (el.clientWidth - nameWidth) / 4)
    el.scrollLeft = Math.max(0, offsetOf(first, range, dayWidth) - room)
  }, [rows.length, read, today, range, dayWidth, zoom, nameWidth])

  // A bar on its way to new days: as the drag or the keys have it, until the row comes back.
  const [drag, setDrag] = React.useState<Drag | null>(null)
  const [moved, setMoved] = React.useState<ReadonlyMap<string, RowSpan>>(() => new Map())
  const spanOf = (id: string, span: RowSpan): RowSpan => (drag?.id === id && drag.days ? applyEdit(span, { kind: drag.kind, days: drag.days }) : (moved.get(id) ?? span))
  const write = (id: string, from: RowSpan, to: RowSpan) => {
    if (to.start.getTime() === from.start.getTime() && to.end.getTime() === from.end.getTime()) return
    setMoved((m) => new Map(m).set(id, to))
    patchRow(tableId, id, datesOf(to, look))
      // A failure is said once, by the request (lib/axiosInstance: "Not allowed" for a 403, and a write
      // with no answer); the bar only goes back.
      .then(
        () => onChange(),
        () => {},
      )
      .finally(() =>
        setMoved((m) => {
          const next = new Map(m)
          next.delete(id)
          return next
        }),
      )
  }

  const start = (e: React.PointerEvent, id: string, kind: EditKind) => {
    if (e.button > 0) return
    e.stopPropagation()
    ;(e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId)
    setDrag({ id, kind, x0: e.clientX, days: 0, moved: false })
  }
  const move = (e: React.PointerEvent) => {
    if (!drag) return
    const days = Math.round((e.clientX - drag.x0) / dayWidth)
    if (days !== drag.days || (!drag.moved && Math.abs(e.clientX - drag.x0) > 3)) setDrag({ ...drag, days, moved: drag.moved || Math.abs(e.clientX - drag.x0) > 3 })
  }
  const end = (span: RowSpan) => {
    if (!drag) return
    const d = drag
    setDrag(null)
    if (!d.moved) return onOpen(d.id)
    write(d.id, span, applyEdit(span, { kind: d.kind, days: d.days }))
  }
  const key = (e: React.KeyboardEvent, id: string, span: RowSpan) => {
    if (e.key === "Enter") return onOpen(id)
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return
    e.preventDefault()
    // Shift moves the end, Alt the start; the arrows alone, the whole bar.
    write(id, span, applyEdit(spanOf(id, span), { kind: e.shiftKey ? "end" : e.altKey ? "start" : "move", days: e.key === "ArrowLeft" ? -1 : 1 }))
  }

  // The lines in the window, with their rows where read.
  const lines = items.map(({ index, start: top }) => ({ place: index, top, at: read[rowAt(index)] as (typeof read)[number] | undefined }))
  // The window, by its first and last place: the arrows are worked out again only when it moves.
  const window_ = `${lines[0]?.place ?? -1}:${lines.at(-1)?.place ?? -1}`
  const links_ = React.useMemo(() => {
    if (!gantt || !look.deps) return []
    const shown = lines.filter((l) => l.at?.span)
    const rowsIn = shown.map((l) => ({
      kind: "task" as const,
      key: l.at!.row.id,
      span: spanOf(l.at!.row.id, l.at!.span!),
      task: { task_uuid: l.at!.row.id, task_name: title(l.at!.values), task_status: "", task_blocked_by: waitsOn(l.at!.values, look).map((id) => ({ task_uuid: id })) },
    }))
    return dependencyLinks(rowsIn as unknown as Parameters<typeof dependencyLinks>[0], range, dayWidth, ROW, undefined, shown.map((l) => l.top))
    // spanOf reads drag and moved, both listed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gantt, look, window_, read, range, dayWidth, drag, moved])
  function title(values: Record<string, unknown>) {
    return primary ? String(values[primary.id] ?? "") || "Untitled" : "Untitled"
  }

  const todayLeft = offsetOf(today, range, dayWidth)
  const setLook = (part: Partial<TimelineLook>) => onLook({ ...look, ...part })

  return (
    <div className="flex min-h-0 flex-1 flex-col" data-timeline={gantt ? "gantt" : "timeline"}>
      <div className="flex flex-wrap items-center gap-2 px-4 py-2 sm:px-6">
        <FieldPick label="Starts" value={look.start} options={dates} onPick={(id) => setLook({ start: id })} />
        <FieldPick label="Ends" value={look.end} options={dates.filter((f) => f.id !== look.start)} none="One day" onPick={(id) => setLook({ end: id })} />
        {gantt ? <FieldPick label="Waits on" value={look.deps} options={links} none="No arrows" onPick={(id) => setLook({ deps: id })} /> : null}
        <span className="ml-auto" />
        <ZoomSwitch value={zoom} onChange={(z) => setLook({ zoom: z })} />
      </div>
      {!look.start ? (
        <p className="px-4 py-10 text-center text-ui text-ink-3 sm:px-6">Add a date field to draw the rows across their days.</p>
      ) : total === 0 ? (
        empty
      ) : (
        <div ref={scrollRef} className="relative min-h-0 flex-1 overflow-auto" data-timeline-scroll="" onPointerMove={move}>
          <TimelineHeader range={range} zoom={zoom} dayWidth={dayWidth} today={today} nameWidth={nameWidth} nameLabel={primary?.name ?? "Row"} />
          <div className="relative" style={{ width: nameWidth + gridWidth, paddingTop: padTop, paddingBottom: padBottom }} role="list" aria-label={gantt ? "Gantt" : "Timeline"}>
            {todayLeft >= 0 && todayLeft < gridWidth ? (
              <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 z-[1] w-px bg-brand/50" style={{ left: nameWidth + todayLeft + dayWidth / 2 }} />
            ) : null}
            {links_.length ? (
              <svg aria-hidden="true" className="pointer-events-none absolute top-0 z-[2] overflow-visible" style={{ left: nameWidth, width: gridWidth, height: virtualizer.getTotalSize() }}>
                {links_.map((l) => (
                  <path key={l.key} d={l.path} data-link={l.broken ? "broken" : "kept"} fill="none" strokeWidth={1.5} className={l.broken ? "stroke-[var(--camp-berry)]" : "stroke-ink-3"} />
                ))}
              </svg>
            ) : null}
            {lines.map(({ place, at }) => {
              if (!at) return <Placeholder key={`~${place}`} nameWidth={nameWidth} />
              const { row, values, span } = at
              const shown = span && spanOf(row.id, span)
              const box = shown && barBox(shown, range, dayWidth)
              const hue = hues?.get(row.id) ?? hueFor(tableId)
              const name = title(values)
              return (
                <div key={row.id} role="listitem" aria-setsize={total} aria-posinset={place + 1} data-line={row.id} className="flex" style={{ height: ROW }}>
                  <button
                    type="button"
                    onClick={() => onOpen(row.id)}
                    className="sticky left-0 z-10 flex shrink-0 items-center border-b border-r border-line bg-sheet px-4 text-left text-ui text-ink hover:bg-hover"
                    style={{ width: nameWidth }}
                  >
                    <span className={cn("truncate", !span && "text-ink-3")}>{name}</span>
                  </button>
                  <div className="relative shrink-0 border-b border-line/60" style={{ width: gridWidth }}>
                    {shown && box ? (
                      <button
                        type="button"
                        data-bar={row.id}
                        aria-label={`${name}: ${bubbleLabel(shown)}`}
                        onPointerDown={(e) => start(e, row.id, "move")}
                        onPointerUp={() => end(span!)}
                        onKeyDown={(e) => key(e, row.id, span!)}
                        className={cn(
                          HUE_CLASS[hue],
                          "group/bar absolute top-1.5 flex h-6 cursor-grab items-center overflow-hidden rounded-md bg-[var(--hue-a2)] px-2 text-meta font-medium text-white shadow-e1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand",
                          drag?.id === row.id && drag.moved && "cursor-grabbing shadow-e2",
                        )}
                        style={{ left: box.left, width: Math.max(box.width, 6) }}
                      >
                        <span aria-hidden="true" onPointerDown={(e) => start(e, row.id, "start")} className="absolute inset-y-0 left-0 w-1.5 cursor-ew-resize" />
                        <span className="truncate">{box.width > 48 ? name : ""}</span>
                        <span aria-hidden="true" onPointerDown={(e) => start(e, row.id, "end")} className="absolute inset-y-0 right-0 w-1.5 cursor-ew-resize" />
                      </button>
                    ) : null}
                    {shown && box && box.width <= 48 ? (
                      <span aria-hidden="true" className="pointer-events-none absolute top-1.5 flex h-6 items-center whitespace-nowrap text-meta text-ink-2" style={{ left: box.left + box.width + 6 }}>
                        {name}
                      </span>
                    ) : null}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

/** One of the layout's fields: its dates, or what it waits on, among the table's fields of that kind. */
function FieldPick({ label, value, options, none, onPick }: { label: string; value: string | null; options: TableField[]; none?: string; onPick: (id: string | null) => void }) {
  return (
    <label className="flex items-center gap-1.5 text-ui-sm text-ink-3">
      {label}
      <Select value={value ?? "~none"} onValueChange={(v) => onPick(v === "~none" ? null : v)}>
        <SelectTrigger aria-label={label} className="h-7 w-auto min-w-28 gap-1 text-ui-sm text-ink">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {none ? <SelectItem value="~none">{none}</SelectItem> : null}
          {options.map((f) => (
            <SelectItem key={f.id} value={f.id}>
              {f.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </label>
  )
}

/** A line of the view on its way from the server: its height held, with a quiet bar where its name will be. */
function Placeholder({ nameWidth }: { nameWidth: number }) {
  return (
    <div aria-hidden="true" data-placeholder="" className="flex" style={{ height: ROW }}>
      <div className="sticky left-0 flex shrink-0 items-center border-b border-r border-line bg-sheet px-4" style={{ width: nameWidth }}>
        <Skeleton className="h-2.5 w-28 max-w-[70%]" />
      </div>
    </div>
  )
}
