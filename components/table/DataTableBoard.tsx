"use client"

import * as React from "react"
import { createPortal } from "react-dom"
import { DndContext, DragOverlay, MouseSensor, TouchSensor, pointerWithin, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent, type DragStartEvent, type UniqueIdentifier } from "@dnd-kit/core"
import { cn } from "@/lib/utils/helpers/cn"
import { DRAG_OVERLAY } from "@/lib/ui/dnd"
import { useToast } from "@/hooks/use-toast"
import { Kanban, MoreHorizontal, Plus } from "@/lib/icons"
import { MenuCheck } from "@/components/ui/menuCheck"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { TableField, TableRow, optionsOf, parseRowValues, createRow, patchRow, isHiddenRef, isComputed, computedOf } from "@/services/tableService"
import { formulaText, cardTitle } from "@/lib/tables/formula"
import { hiddenText, listText, numberFormatOf } from "@/lib/tables/cellFormat"
import { formatLocale } from "@/lib/tables/numberFormat"
import { moveKeyOf } from "@/lib/board/keyMove"
import { BOARD_AUTO_SCROLL, boardAnnouncements } from "@/lib/board/drag"
import { shortDate } from "@/lib/utils/date/shortDate"
import { campHueOf, hueFor } from "@/lib/campHue"
import { columnWash } from "@/components/kanbanComponents/columnLook"
import { OptionChip, tintedFields } from "@/components/table/optionChip"
import { fieldKind } from "@/lib/fieldTypes/registry"
import { kindText, statusGroupOf, type StatusGroup } from "@/lib/fieldTypes/kindsMore"
import { fieldOrder } from "@/lib/tables/fieldOrder"
import { keepInSight } from "@/lib/tables/viewRules"
import { TableViewState, TABLE_VIEW_BODY, TABLE_VIEW_INSET, TOUCH_ROW } from "@/components/table/TableViewFrame"

interface DataTableBoardProps {
  tableId: string
  fields: TableField[]
  rows: TableRow[]
  canManage: boolean
  /** The select field this reader groups the board by; the first one when it's unset or gone. */
  groupFieldId?: string
  /** Asks for the table again; given a row, only as far as that row needs. */
  onChange: (rowId?: string) => void
  /** A card added here, for the page to open its record (TAB-BUG-14); without it, the board asks for the table again. */
  onCreated?: (rows: TableRow[], focus?: boolean) => void
  /** Opens a card's record: a click, a tap or Enter on it. */
  onOpenRow?: (rowId: string) => void
  /** Opens the grid, where a select column is added. */
  onOpenGrid?: () => void
}

const NO_VALUE = "__none__"
/** Cards a lane draws at first, and how many more each "Show more" adds: a lane drawing every card of 10,000 rows froze a phone. */
export const LANE_FIRST = 50
const LANE_STEP = 500

// As the project board's: a few pixels before a drag starts, so a click
// still opens the card; on touch a short hold, so a tap opens and a swipe
// scrolls. Made once, or every render rebuilt the sensors.
const MOUSE = { activationConstraint: { distance: 5 } }
const TOUCH = { activationConstraint: { delay: 180, tolerance: 8 } }

// formatCardValue renders a row value for a compact board card: arrays (multi
// select / relation) become a short, comma-joined label list (what the reader
// can't open as one phrase); objects fall back to their label; scalars are
// stringified. Empty values return "".
export function formatCardValue(v: unknown, type?: string): string {
  if (v === undefined || v === null || v === "") return ""
  // As the grid shows them: "7 Oct", not "2026-10-07"; "1,580", not "1580".
  if (type === "date" && typeof v === "string") {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v)
    const d = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(v)
    if (!Number.isNaN(d.getTime())) return shortDate(d)
  }
  if (type === "number" && (typeof v === "number" || (typeof v === "string" && v.trim() !== "" && !Number.isNaN(Number(v))))) {
    return Number(v).toLocaleString(undefined, { maximumFractionDigits: 6 })
  }
  if (Array.isArray(v)) return listText(v)
  if (isHiddenRef(v)) return hiddenText(1)
  if (typeof v === "object") return String((v as { label?: string }).label ?? "")
  if (typeof v === "boolean") return v ? "Yes" : "No"
  return String(v)
}

/**
 * A row's details under its title, as a board card and a phone's day list show
 * them: the first `max` fields not skipped (its title's, its lane's or day's),
 * each as the grid shows it, without the empty ones.
 */
export function rowDetails(fields: TableField[], values: Record<string, unknown>, skip: (string | undefined)[], max: number): { f: TableField; text: string }[] {
  return fields
    .filter((f) => !skip.includes(f.id))
    .map((f) => ({
      f,
      text: isComputed(f) ? formulaText(values[f.id], computedOf(f).result, numberFormatOf(f)) : (kindText(f, values[f.id]) ?? formatCardValue(values[f.id], f.type)),
    }))
    .filter((d) => d.text)
    .slice(0, max)
}

/**
 * The fields a board can group by, in the order "Group by" offers them: the
 * statuses, then the single selects, each in the table's order.
 */
function groupFields(fields: TableField[]): TableField[] {
  const rank = (f: TableField) => (f.type === "status" ? 0 : 1)
  return fields.filter((f) => f.type === "status" || f.type === "select").sort((a, b) => rank(a) - rank(b) || a.position - b.position)
}

/** The field a board groups by: the one asked for, else the first status, else the first select. */
export function boardGroupField(fields: TableField[], groupFieldId?: string): TableField | undefined {
  const selects = groupFields(fields)
  return selects.find((f) => f.id === groupFieldId) ?? selects[0]
}

/**
 * "Group by" for the board, in the view's toolbar: the table's select fields,
 * this reader's choice kept with their view of the table. Nothing to choose
 * with fewer than two.
 */
export function BoardGroupBy({ fields, groupFieldId, onPick }: { fields: TableField[]; groupFieldId?: string; onPick: (fieldId: string) => void }) {
  const selects = groupFields(fields)
  const current = boardGroupField(fields, groupFieldId)
  if (selects.length < 2 || !current) return null
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="h-7 gap-1.5 px-2 text-ui-sm text-ink-2" aria-label={`Group by ${current.name}`}>
          <Kanban className="size-3.5" /> <span className="max-sm:hidden">Group by</span> <span className="font-medium text-ink">{current.name}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="content-float w-52 rounded-xl p-1 shadow-e3">
        <DropdownMenuLabel className="text-meta font-medium text-ink-3">Group by</DropdownMenuLabel>
        {selects.map((f) => (
          <DropdownMenuItem key={f.id} onSelect={() => onPick(f.id)} aria-current={f.id === current.id ? "true" : undefined} className={cn(f.id === current.id && "font-medium text-ink")}>
            <span className="flex-1 truncate">{f.name}</span>
            <MenuCheck checked={f.id === current.id} />
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** A board column: an option, known by its id so a rename keeps its cards in it, or "No value". */
type BoardColumn = { key: string; label: string; color?: string; group?: StatusGroup }

// DataTableBoard is a Kanban view: cards (rows) grouped into lanes by a
// single-select field. A card opens its record on a click, a tap or Enter
// (J and K step through its lane), and moves by a drag (pointer or touch),
// by Space and the arrow keys, or by its "Move to" menu (TAB-BUG-10). A move
// sets that field, and only that field.
export function DataTableBoard({
  tableId,
  fields,
  rows,
  groupFieldId,
  onChange,
  onCreated,
  onOpenRow,
  onOpenGrid,
}: DataTableBoardProps) {
  const { toast } = useToast()
  // How many cards each lane draws, by lane, past its first 50.
  const [laneShows, setLaneShows] = React.useState<Record<string, number>>({})
  // A card moved here shows in its new lane until the table says so too.
  const [moved, setMoved] = React.useState<Record<string, { lane: string; was: string }>>({})
  // By lane, the card last moved there: drawn where it was put, last in what the lane draws (F9).
  const [kept, setKept] = React.useState<Record<string, string>>({})
  const [dragging, setDragging] = React.useState<TableRow | null>(null)
  // A card held from the keyboard, and the lane it would go to.
  const [held, setHeld] = React.useState<{ rowId: string; lane: number } | null>(null)
  const [said, say] = React.useState("")
  const instructions = React.useId()
  const boardRef = React.useRef<HTMLDivElement>(null)
  const refocus = React.useRef<string | null>(null)
  const sensors = useSensors(useSensor(MouseSensor, MOUSE), useSensor(TouchSensor, TOUCH))

  const sortedFields = React.useMemo(() => fieldOrder(fields), [fields])
  const groupField = React.useMemo(() => boardGroupField(fields, groupFieldId), [fields, groupFieldId])
  // A card's choices tint as the grid's do (optionChip tintedFields).
  const tinted = React.useMemo(() => tintedFields(fields), [fields])

  // A card's title is the row's name: its primary field (fieldOrder leads with it).
  const titleField = sortedFields[0]
  const titleOf = React.useCallback((row: TableRow) => (titleField ? cardTitle(titleField, parseRowValues(row)[titleField.id]) : "") || "Untitled", [titleField])

  const columns: BoardColumn[] = React.useMemo(() => {
    if (!groupField) return []
    const status = groupField.type === "status"
    return [
      ...optionsOf(groupField).map((o) => ({ key: o.id, label: o.label, color: o.color, group: status ? statusGroupOf(o) : undefined })),
      { key: NO_VALUE, label: "No value" },
    ]
  }, [groupField])

  // A card's lane: the option its cell names, or "No value" for none, or a
  // name no option has; where it was just moved, until the table says so.
  const laneOf = React.useMemo(() => {
    const byLabel = new Map(columns.filter((c) => c.key !== NO_VALUE).map((c) => [c.label, c.key]))
    return (row: TableRow): string => {
      const was = moved[row.id]
      if (was) return was.lane
      const v = groupField ? parseRowValues(row)[groupField.id] : undefined
      return (typeof v === "string" && byLabel.get(v)) || NO_VALUE
    }
  }, [columns, groupField, moved])

  const rowsByColumn = React.useMemo(() => {
    const map: Record<string, TableRow[]> = {}
    for (const c of columns) map[c.key] = []
    for (const r of rows) map[laneOf(r)]?.push(r)
    return map
  }, [rows, columns, laneOf])

  // A drag by a pointer or a finger says what moves where, as the keys do.
  const accessibility = React.useMemo(() => {
    const rowOf = (id: UniqueIdentifier) => rows.find((r) => r.id === id)
    return {
      announcements: boardAnnouncements({
        card: (id) => {
          const row = rowOf(id)
          return row ? titleOf(row) : "A card"
        },
        lane: (id) => columns.find((c) => c.key === id)?.label ?? "a lane",
        laneOf: (id) => {
          const row = rowOf(id)
          return row ? laneOf(row) : undefined
        },
      }),
    }
  }, [rows, columns, laneOf, titleOf])

  // A moved card follows the table again once its copy there changes.
  React.useEffect(() => {
    setMoved((m) => {
      const ids = Object.keys(m)
      if (!ids.length) return m
      const now = new Map(rows.map((r) => [r.id, r.values]))
      const left = Object.fromEntries(Object.entries(m).filter(([id, v]) => now.get(id) === v.was))
      return Object.keys(left).length === ids.length ? m : left
    })
  }, [rows])

  // After a move from the keyboard the card is in another lane (a new
  // element): the focus follows it there.
  React.useEffect(() => {
    const id = refocus.current
    if (!id || held) return
    // Once: a card not drawn now mustn't take the focus later, from wherever it went.
    refocus.current = null
    Array.from(boardRef.current?.querySelectorAll<HTMLElement>("[data-card-id]") ?? []).find((c) => c.dataset.cardId === id)?.focus()
  })

  if (!groupField) {
    return <TableViewState kind="needs-column" column="select" view="board" hue={hueFor(tableId)} onOpenGrid={onOpenGrid} />
  }

  const moveCard = async (row: TableRow, to: BoardColumn) => {
    if (laneOf(row) === to.key) return
    setKept((k) => ({ ...k, [to.key]: row.id }))
    setMoved((m) => ({ ...m, [row.id]: { lane: to.key, was: row.values } }))
    try {
      await patchRow(tableId, row.id, { [groupField.id]: to.key === NO_VALUE ? "" : to.label })
      onChange(row.id)
    } catch {
      // Said by the request; the card goes back.
      setMoved((m) => Object.fromEntries(Object.entries(m).filter(([id]) => id !== row.id)))
      onChange()
    }
  }

  const addCard = async (column: BoardColumn) => {
    try {
      const r = await createRow(tableId, column.key === NO_VALUE ? {} : { [groupField.id]: column.label })
      if (onCreated && r?.id) onCreated([r], true)
      else onChange()
    } catch {
      toast({ title: "Could not add card", variant: "destructive" })
    }
  }

  const onDragStart = ({ active }: DragStartEvent) => setDragging(rows.find((r) => r.id === active.id) ?? null)
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    setDragging(null)
    const row = rows.find((r) => r.id === active.id)
    const to = columns.find((c) => c.key === over?.id)
    if (row && to) void moveCard(row, to)
  }

  // Enter opens the focused card and Space picks it up; while it's held, left
  // and right move it between lanes, Space or Enter drops it there and Escape
  // puts it back, each step said aloud. Otherwise J and K (or up and down)
  // step through its lane. Caught on the way down, so the card's own Space
  // never opens it.
  const onKeyDownCapture = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return
    const card = e.target instanceof HTMLElement ? e.target.closest<HTMLElement>("[data-card-id]") : null
    if (!held) {
      const row = card && e.target === card ? rows.find((r) => r.id === card.dataset.cardId) : undefined
      if (!row || !card) return
      if (e.key === "Enter") {
        e.preventDefault()
        onOpenRow?.(row.id)
        return
      }
      if (e.key === " ") {
        e.preventDefault()
        e.stopPropagation()
        const lane = columns.findIndex((c) => c.key === laneOf(row))
        setHeld({ rowId: row.id, lane })
        say(`Picked up ${titleOf(row)}, in ${columns[lane].label}. Left and right arrow keys move it, Space drops it, Escape puts it back.`)
        return
      }
      const step = e.key === "j" || e.key === "ArrowDown" ? 1 : e.key === "k" || e.key === "ArrowUp" ? -1 : 0
      if (!step) return
      e.preventDefault()
      const lane = Array.from(card.closest("[data-lane]")?.querySelectorAll<HTMLElement>("[data-card-id]") ?? [])
      lane[lane.indexOf(card) + step]?.focus()
      return
    }
    const key = moveKeyOf(e.key)
    if (key) {
      e.preventDefault()
      e.stopPropagation()
      if (key === "up" || key === "down") return
      const lane = Math.max(0, Math.min(columns.length - 1, held.lane + (key === "left" ? -1 : 1)))
      setHeld({ ...held, lane })
      say(columns[lane].label)
      return
    }
    if (e.key === " " || e.key === "Enter") {
      e.preventDefault()
      e.stopPropagation()
      const row = rows.find((r) => r.id === held.rowId)
      const to = columns[held.lane]
      refocus.current = held.rowId
      setHeld(null)
      if (row && laneOf(row) !== to.key) {
        void moveCard(row, to)
        say(`Moved to ${to.label}.`)
      } else say(`Put back in ${to.label}.`)
      return
    }
    if (e.key === "Escape" || e.key === "Tab") {
      if (e.key === "Escape") {
        e.preventDefault()
        e.stopPropagation()
      }
      refocus.current = e.key === "Escape" ? held.rowId : null
      setHeld(null)
      say("Put back where it was.")
    }
  }
  // Firefox clicks a button on Space's keyup, which the keydown's
  // preventDefault doesn't stop: picking a card up opened its record too.
  const onKeyUpCapture = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === " " && e.target instanceof HTMLElement && e.target.dataset.cardId !== undefined) e.preventDefault()
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={pointerWithin}
      autoScroll={BOARD_AUTO_SCROLL}
      accessibility={accessibility}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragCancel={() => setDragging(null)}
    >
      {/* Scrolls inside the frame, as the grid does, at the frame's one inset;
          a card held at its edge scrolls it, and only it. */}
      <div ref={boardRef} className={cn(TABLE_VIEW_BODY, TABLE_VIEW_INSET)} data-table-board="" data-board-scroll="" data-escape-own={!!held ? "" : undefined} onKeyDownCapture={onKeyDownCapture} onKeyUpCapture={onKeyUpCapture}>
        <div className="flex gap-3">
          {columns.map((col, i) => {
            const cards = rowsByColumn[col.key] || []
            const shows = laneShows[col.key] ?? LANE_FIRST
            // The card last moved here stays where it was put, as a row added in
            // the grid does (keepInSight), wherever the view's order places it:
            // past the lane's window, or elsewhere once the save answers and the
            // view sorts it again. It isn't counted again in what's left to show.
            const drawn = keepInSight(cards.slice(0, shows), cards, cards, kept[col.key] ?? null).rows
            const more = Math.min(cards.length - drawn.length, LANE_STEP)
            return (
              <BoardLane key={col.key} column={col} target={held?.lane === i}>
                {/* The option in its own colour, as the grid's chip and a guest's
                    view show it; the count beside it is a plain number. */}
                <div className="flex h-10 items-center gap-2 px-3 text-ui-sm font-medium">
                  {/* A lane is a stage: its option in its own tint, whatever the grid's chips do. */}
                  {col.key === NO_VALUE ? <span className="truncate text-ink-3">{col.label}</span> : <OptionChip label={col.label} color={col.color} tinted group={col.group} />}
                  <span className="shrink-0 text-meta font-normal tabular-nums text-ink-3">{cards.length}</span>
                </div>
                <div className="flex flex-col gap-2 px-2 pb-2">
                  {drawn.map((row) => (
                    <BoardCard
                      key={row.id}
                      row={row}
                      title={titleOf(row)}
                      lane={col.key}
                      fields={sortedFields}
                      tinted={tinted}
                      skip={[titleField?.id, groupField.id]}
                      columns={columns}
                      held={held?.rowId === row.id}
                      describedBy={instructions}
                      onOpen={onOpenRow}
                      onMove={(to) => void moveCard(row, to)}
                    />
                  ))}
                  {more > 0 ? (
                    <button
                      type="button"
                      data-lane-more=""
                      onClick={() => setLaneShows((s) => ({ ...s, [col.key]: shows + LANE_STEP }))}
                      className={cn("flex h-8 items-center justify-center rounded-lg text-ui-sm font-medium text-ink-2 transition-colors hover:bg-hover hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand", TOUCH_ROW)}
                    >
                      Show {formatLocale(more, {})} more
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => void addCard(col)}
                    className={cn("flex h-8 items-center gap-1.5 rounded-lg px-2 text-ui-sm text-ink-3 transition-colors hover:bg-hover hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand", TOUCH_ROW)}
                  >
                    <Plus className="h-3.5 w-3.5" aria-hidden="true" /> Add card
                  </button>
                </div>
              </BoardLane>
            )
          })}
        </div>
      </div>
      <p id={instructions} className="sr-only">
        Enter opens the card. Space picks it up, the left and right arrow keys move it between lanes, and Space puts it down; Escape puts it back.
      </p>
      <p aria-live="assertive" aria-atomic="true" className="sr-only" data-board-said="">
        {said}
      </p>
      {typeof document !== "undefined"
        ? createPortal(
            <DragOverlay className={DRAG_OVERLAY}>
              {dragging ? <div className="w-[272px] rounded-xl bg-raised p-3 text-ui font-medium text-ink shadow-e3">{titleOf(dragging)}</div> : null}
            </DragOverlay>,
            document.body,
          )
        : null}
    </DndContext>
  )
}

/**
 * A lane, where a card is dropped: washed in its option's hue, as the project
 * board's columns are in their status's (kanbanComponents/columnLook); under
 * a card, or held for it from the keyboard, the layer's drop well
 * (INTERACTION_SPEC §5.2). A lane keeps no order, so it draws no line.
 */
function BoardLane({ column, target, children }: { column: BoardColumn; target: boolean; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: column.key })
  const dropping = target || isOver
  return (
    <div
      ref={setNodeRef}
      data-lane={column.key}
      data-drop-target={dropping || undefined}
      data-drop={dropping ? "valid" : undefined}
      className={cn("flex w-72 shrink-0 flex-col rounded-[16px] transition-shadow", columnWash(column.key === NO_VALUE ? null : campHueOf(column.color)))}
    >
      {children}
    </div>
  )
}

/**
 * A card: a button that opens the row's record (a click, a tap, Enter), drags
 * to another lane (pointer or touch), and has a "Move to" menu, so a touch
 * screen and a keyboard can move it too.
 */
function BoardCard({
  row,
  title,
  lane,
  fields,
  tinted,
  skip,
  columns,
  held,
  describedBy,
  onOpen,
  onMove,
}: {
  row: TableRow
  title: string
  lane: string
  fields: TableField[]
  /** The columns whose chips are tinted. */
  tinted: Set<string>
  /** Fields a card doesn't list: its title's, and its lane's. */
  skip: (string | undefined)[]
  columns: BoardColumn[]
  held: boolean
  describedBy: string
  onOpen?: (rowId: string) => void
  onMove: (to: BoardColumn) => void
}) {
  const { setNodeRef, listeners, isDragging } = useDraggable({ id: row.id })
  const values = parseRowValues(row)
  const details = rowDetails(fields, values, skip, 3)
  return (
    <div className={cn("group/card relative rounded-xl bg-raised shadow-e1 transition-[opacity,box-shadow,transform] duration-[140ms] hover:-translate-y-px hover:shadow-e2", isDragging && "opacity-50", held && "shadow-e3 ring-2 ring-brand")}>
      <button
        ref={setNodeRef}
        type="button"
        data-card-id={row.id}
        aria-describedby={describedBy}
        onClick={() => onOpen?.(row.id)}
        {...listeners}
        className="block w-full touch-manipulation select-none rounded-xl p-3 pr-9 text-left text-ui outline-none focus-visible:ring-2 focus-visible:ring-brand"
      >
        <p className="font-medium text-ink">{title}</p>
        {details.length ? (
          // Each field as a chip with its name (PTC-31): a choice in its own
          // chip, as the grid draws it; anything else as a label and value.
          <div className="mt-1.5 flex flex-wrap gap-1">
            {details.map(({ f, text }) => (
              <CardField key={f.id} field={f} value={values[f.id]} text={text} tinted={tinted.has(f.id)} />
            ))}
          </div>
        ) : null}
      </button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={`Move ${title}`}
            data-touch-target=""
            className="absolute right-1.5 top-1.5 inline-flex size-7 items-center justify-center rounded-md text-ink-3 opacity-0 transition-opacity hover:bg-hover hover:text-ink focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand group-hover/card:opacity-100 data-[state=open]:opacity-100 [@media(hover:none)]:opacity-100"
          >
            <MoreHorizontal className="size-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="content-float w-52 rounded-xl p-1 shadow-e3">
          <DropdownMenuLabel className="text-meta font-medium text-ink-3">Move to</DropdownMenuLabel>
          {columns.map((c) => (
            <DropdownMenuItem key={c.key} disabled={c.key === lane} aria-current={c.key === lane ? "true" : undefined} onSelect={() => onMove(c)}>
              <span className="flex-1 truncate">{c.label}</span>
              <MenuCheck checked={c.key === lane} />
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

/** One of a card's fields, as a chip: a choice's options as the grid draws them, the rest as its name and value. */
function CardField({ field, value, text, tinted }: { field: TableField; value: unknown; text: string; tinted: boolean }) {
  if (fieldKind(field.type).options && !isHiddenRef(value)) {
    const labels = (Array.isArray(value) ? value : [value]).filter((v): v is string => typeof v === "string" && v !== "")
    const options = optionsOf(field)
    const shown = labels.slice(0, 2)
    const groupOf = (label: string) => {
      const o = field.type === "status" ? options.find((x) => x.label === label) : undefined
      return o ? statusGroupOf(o) : undefined
    }
    return (
      <span title={field.name} data-card-field={field.id} className="inline-flex min-w-0 max-w-full items-center gap-1">
        <span className="sr-only">{field.name}: </span>
        {shown.map((label) => (
          <OptionChip key={label} label={label} color={options.find((o) => o.label === label)?.color} tinted={tinted} group={groupOf(label)} className="h-5 px-1.5 text-2xs" />
        ))}
        {labels.length > shown.length ? <span className="shrink-0 text-2xs text-ink-3">+{labels.length - shown.length}</span> : null}
      </span>
    )
  }
  return (
    <span title={`${field.name}: ${text}`} data-card-field={field.id} className="chip h-5 min-w-0 max-w-full gap-1 px-1.5 text-2xs">
      <span className="shrink-0 text-ink-3">{field.name}</span>
      <span className="truncate text-ink-2">{text}</span>
    </span>
  )
}
