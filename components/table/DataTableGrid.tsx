"use client"

import * as React from "react"
import { flushSync } from "react-dom"
import type { Virtualizer } from "@tanstack/react-virtual"
import "./table.css"
import { cn } from "@/lib/utils/helpers/cn"
import { useConfirm } from "@/hooks/useConfirm"
import { FileText, Maximize2, Pin, Plus } from "@/lib/icons"
import { UnreadDot } from "@/components/docComments/UnreadDot"
import {
  createRow,
  alignsRight,
  isNumeric,
  type TableField,
  type TableRow,
} from "@/services/tableService"
import { nextCell, swallowsAtEdge, type CellKind } from "@/lib/tables/gridKeys"
import { TABLE_VIEW_BODY } from "@/components/table/TableViewFrame"
import { useKeptRows, useViewWindow } from "@/components/table/viewWindow"
import { placeOfRow } from "@/lib/tables/viewPlaces"
import { optionIndexOf, restCell, waitFace, type CellContext } from "@/components/table/cellFaces"
import { fieldKind } from "@/lib/fieldTypes/registry"
import { tintedFields } from "@/components/table/optionChip"
import { AddColumn, ColumnHeader, settingsPageOf, type ColumnPage } from "@/components/table/ColumnMenu"
import { shownValues, useCellCommit, type CellCommit, type RowEdits } from "@/lib/tables/useCellCommit"
import { rowPx, type RowHeight, type SummaryFn } from "@/lib/tables/display"
import type { QuerySummaries } from "@/lib/querySpec/types"
import type { RefusedSums } from "@/lib/tables/types"
import type { Grouping } from "@/lib/tables/groups"
import type { CampHue } from "@/lib/campHue"
import { HUE_CLASS } from "@/components/ui/graphics/hues"
import type { GroupBody } from "@/components/table/groups/GroupHeaders"
import { useStableCallback } from "@/hooks/useStableCallback"
import { lazyView } from "@/lib/lazy/lazyView"
import { toast } from "@/hooks/use-toast"
import { reloadForNewBuild } from "@/lib/newBuild"
import { ix } from "@/lib/ui/interactive"
import { isComposingKey } from "@/lib/keys/ime"
import { fieldOrder } from "@/lib/tables/fieldOrder"
import type { Columns } from "@/components/table/columnOps"
import { useUndoToast } from "@/components/table/ledger/useUndoToast"
import { Skeleton } from "@/components/ui/skeleton"

export { groupedNumber } from "@/components/table/cellFaces"

interface DataTableGridProps {
  tableId: string
  fields: TableField[]
  rows: TableRow[]
  canManage: boolean
  onChange: () => void // ask the parent to revalidate the bundle
  /**
   * Rows this grid just added (New row, Duplicate), for a page that holds
   * rows past the first page: they're the table's last, so it reads through
   * to them. `focus` for a new row, which then takes the focus (focusRow).
   * Without it, the grid asks for the table again (onChange).
   */
  onCreated?: (rows: TableRow[], focus?: boolean) => void
  /** A row to focus the first cell of, once it's among the rows; onFocused says it was. */
  focusRow?: string | null
  /** The field to select in it instead, shut (someone's cell, from their face). */
  selectField?: string | null
  onFocused?: () => void
  /**
   * The rows in sight came near the last row read, or past it: the page reads
   * on, to the last in sight (its place in the view, read or not).
   */
  onNearEnd?: (last: number) => void
  /**
   * How many rows the view has, read or not (a view the server answers in
   * windows, tables T5c): the places past the rows read are drawn as rows
   * on their way. The last `tail` rows given were added here, and are kept at
   * the view's end. Without it, the rows given are the view's every row.
   */
  count?: number
  tail?: number
  /** A row kept in sight that the view's rules would hide or move, and why (a new one). */
  marked?: { rowId: string; note: string } | null
  /** A cell of a row took the focus. */
  onRowFocus?: (rowId: string) => void
  /**
   * What to say when there are no rows to show: under the column names and
   * above "New row", which both stay, so the next step is right there.
   */
  empty?: React.ReactNode
  /** The reader's row height (T06); medium by default. */
  rowHeight?: RowHeight
  /** Field ids the reader hid. */
  hidden?: string[]
  /** Column widths the reader dragged. */
  widths?: Record<string, number>
  onWidth?: (fieldId: string, px: number) => void
  /** Summary functions the reader chose; a summary bar shows when given. */
  summary?: Record<string, SummaryFn>
  onSummary?: (fieldId: string, fn: SummaryFn) => void
  /** The rows loaded, when they aren't the whole table: each summary says it's of these alone. */
  loaded?: number
  /** The server's summaries over every row the view keeps (a view read in windows; null till they come): a column it answers says the whole view's. */
  served?: QuerySummaries | null
  /** A view read in windows: a formula's or a rollup's summary is the server's alone, never its loaded rows' (airtable-03). */
  windowed?: boolean
  /** A formula's or a rollup's sums the server refused, in its words: those columns say why. */
  refusedSums?: RefusedSums | null
  /** Why the server's sums aren't here, once its last re-ask left them out too (V-118): a formula's column says it. */
  sumsOut?: string | null
  /** From a column's menu. */
  onSort?: (fieldId: string, dir: "asc" | "desc") => void
  onFilter?: (fieldId: string) => void
  onHide?: (fieldId: string) => void
  /** The expand icon in the gutter: opens the row's record panel. */
  onOpenRow?: (rowId: string) => void
  /** Saving cells, when the page shares it with a record panel. */
  commit?: CellCommit
  /** A phone: the gutter and the frozen column share PHONE_LEAD px (the column caps at 140, or 128 beside a touch gutter of two controls). */
  compact?: boolean
  /** A grouped view (tables V2b): its headers, and the rows of its open groups. */
  grouping?: Grouping | null
  /** Each row's colour, as the view colours rows (V3). */
  hues?: ReadonlyMap<string, CampHue> | null
  /** Each row's cells' tints (applyRules cellTints). */
  tints?: ReadonlyMap<string, Record<string, string>> | null
}

/** The summary bar (SummaryBar.tsx): a chunk of its own, off the table's first screen. */
export const SummaryPart = lazyView(() => import("@/components/table/SummaryBar"))
/** The bar over the rows while some are selected (RowSelectionBar.tsx): a chunk of its own, off the table's first screen. */
export const SelectionPart = lazyView(() => import("@/components/table/RowSelectionBar"))
// A column's add, save, duplicate and delete: their own chunk, on first use.
// One that can't load (a deploy since, or no network) says so, and resolves
// unsaved (false): a type change stops changing, a new column's form stays.
// After a deploy, when the server says the old build's chunk is gone, the page
// reloads once for the new build instead (lib/chunkRecovery's one probe).
const withColumns = <T,>(run: (m: typeof import("@/components/table/columnOps")) => T | PromiseLike<T>) =>
  import("@/components/table/columnOps").then(run, async (e: unknown) => {
    if (!(await reloadForNewBuild(e))) toast({ tone: "error", title: "Couldn't change the column: try again" })
    return false as const
  })
/** A grouped view's headers: a chunk of its own. */
export const GroupPart = lazyView(() => import("@/components/table/groups/GroupHeaders"))
/** A link cell's chips at rest (cellFaces' restCell): a chunk of its own, asked for by a table that shows a link field. */
const RelationFaces = lazyView(() => import("@/components/table/relationFace"))

/**
 * The live cells (gridCells): the one cell in use draws through them, every
 * other at rest (cellFaces). A chunk of its own, off the table's first
 * screen, asked for as the grid mounts; liveCellsIn says once it is in.
 */
let liveCellsIn = false
export const LiveCells = lazyView(() =>
  import("@/components/table/gridCells").then((m) => {
    liveCellsIn = true
    return m
  }),
)
const warmLiveCells = () => LiveCells.warm().then(
  () => true,
  () => false,
)

/**
 * A column's width, by what it holds. The grid lays out at fixed widths
 * (table-layout: fixed) so a column keeps its width as rows scroll in and out.
 */
export function columnWidth(f: TableField): number {
  switch (f.type) {
    case "checkbox":
      return 120
    case "number":
      return 128
    case "date":
      return 152
    case "select":
      return 168
    case "formula":
    case "rollup":
      return isNumeric(f) ? 136 : 184
    case "multi_select":
    case "person":
    case "relation":
      return 200
    default:
      return 232
  }
}

const HEADER_HEIGHT = 36
/**
 * On a phone the gutter and the frozen first column share this many pixels:
 * 44 + 140, or 56 + 128 where a touch gutter holds two controls. So a 390 px
 * screen keeps 174 px beside them, where a 168 px choice cell fits whole
 * rather than partly under the frozen column.
 */
const PHONE_LEAD = 184

/** "2 comments": what a row's comment mark says. */
const commentsLabel = (n: number) => `${n} ${n === 1 ? "comment" : "comments"}`
/** The open button's name: the row, its comments and its page. Pure. */
const openRowLabel = (n: number, row: Pick<TableRow, "comments" | "page">) =>
  `Open row ${n}${row.comments ? `, ${commentsLabel(row.comments)}` : ""}${row.page ? ", which has a page" : ""}`
const ADD_COL = 48
/** Rows shown before the grid's frame has been measured. */
const FIRST_SCREEN_ROWS = 40
/** How near the last row given the view gets before the page reads more: about three screens. */
const NEAR_END_ROWS = 60

const touchScreen = () => typeof window !== "undefined" && !!window.matchMedia?.("(hover: none)").matches


/**
 * A table's grid on the v3 sheet (content.md T06–T10, T14, T19): no outer
 * box, a 36 px sticky header, hairline rows and no column rules, a row-number
 * gutter that turns into a checkbox and an expand icon on hover, the primary
 * column frozen with a shadow that fades in once the grid scrolls sideways,
 * one brand ring that glides to the focused cell, a summary bar and a bulk bar
 * for the rows selected.
 *
 * Only the rows in view (and a screenful either side) are in the page: a
 * thousand rows of nine editable cells was 35,000 elements and 7,000 inputs.
 * Scrolling does no React work: the frozen shadow and the ring's place in a
 * frozen column are written from one scroll listener straight to the DOM.
 */
export function DataTableGrid({
  tableId,
  fields,
  rows,
  canManage,
  onChange,
  onCreated,
  focusRow,
  selectField,
  onFocused,
  onNearEnd,
  count,
  tail = 0,
  marked,
  onRowFocus,
  empty,
  rowHeight = "medium",
  hidden,
  widths,
  onWidth,
  summary,
  onSummary,
  loaded,
  served,
  windowed,
  refusedSums,
  sumsOut,
  onSort,
  onFilter,
  onHide,
  onOpenRow,
  commit: shared,
  compact,
  grouping,
  hues,
  tints,
}: DataTableGridProps) {
  const confirm = useConfirm()
  const offerUndo = useUndoToast(onChange)
  const [adding, setAdding] = React.useState(false)
  const [selected, setSelected] = React.useState<Set<string>>(() => new Set())
  const [menu, setMenu] = React.useState<{ field: string; page: ColumnPage } | null>(null)

  const sortedFields = React.useMemo(() => {
    const hide = new Set(hidden || [])
    return fieldOrder(fields).filter((f) => !hide.has(f.id))
  }, [fields, hidden])

  const own = useCellCommit({ tableId, rows, onChange })
  const { commitCell, linkCell, edits } = shared ?? own

  // A grouped view's open rows under their headers: until those and the counts are in, rows on their way, never ungrouped first.
  const heads = GroupPart.useLoaded(!!grouping)
  const linkFaces = RelationFaces.useLoaded(sortedFields.some((f) => f.type === "relation"))
  const counts = grouping?.counts
  const body = React.useMemo(() => {
    if (!grouping) return null
    return heads && counts ? heads.groupedBody(rows, grouping, counts, tail) : { rows: [], layout: null }
  }, [grouping, heads, counts, rows, tail])
  const shown = body?.rows ?? rows

  const latest = React.useRef({ rows: shown })
  latest.current = { rows: shown }

  // A selection keeps only rows still shown.
  React.useEffect(() => {
    setSelected((s) => {
      if (!s.size) return s
      const ids = new Set(rows.map((r) => r.id))
      const next = new Set([...s].filter((id) => ids.has(id)))
      return next.size === s.size ? s : next
    })
  }, [rows])

  const toggleRow = React.useCallback((id: string) => {
    setSelected((s) => {
      const next = new Set(s)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const handleAddRow = async () => {
    setAdding(true)
    try {
      const r = await createRow(tableId, {})
      if (onCreated && r?.id) onCreated([r], true)
      else onChange()
    } catch {
      // surfaced by interceptor
    } finally {
      setAdding(false)
    }
  }

  // A column's changes, from the columns' own chunk (columnOps).
  const cols: Columns = { tableId, fields, onChange, confirm, offerUndo, openMenu: (id) => setMenu({ field: id, page: "main" }) }

  // ---- layout -------------------------------------------------------------
  const touch = React.useMemo(touchScreen, [])
  const height = rowPx(rowHeight, touch)
  const scrollRef = React.useRef<HTMLDivElement>(null)
  const frameRef = React.useRef<HTMLDivElement>(null)
  const tableRef = React.useRef<HTMLTableElement>(null)
  // The rows' window lives in GridBody, so scrolling renders the rows and
  // nothing else: the header's column menus and the summary bar stay put.
  // focusCell reaches the virtualizer through this ref.
  const virtualizerRef = React.useRef<Virtualizer<HTMLElement, Element> | null>(null)
  const widthOf = (f: TableField) => widths?.[f.id] ?? columnWidth(f)
  // The gutter's width is table.css's --grid-gutter: 44px, or 56px on a touch
  // screen where it holds both a checkbox and an open button (gutterPair). On
  // a phone the frozen first column gives up what the gutter takes past 44
  // (PHONE_LEAD).
  const frozenWidth = sortedFields.length === 0 ? "0px" : compact ? `min(${widthOf(sortedFields[0])}px, calc(${PHONE_LEAD}px - var(--grid-gutter)))` : `${widthOf(sortedFields[0])}px`
  // The gutter, the fields, and a last column at the end (Add column for an
  // editor, nothing for a reader) that takes whatever room is left: with
  // every column a fixed width, a fixed-layout table shares spare room out
  // across all of them, so a new table's one column started a third of the
  // way across, behind a stretched row-number gutter.
  const colCount = sortedFields.length + 2
  const tableWidth = `calc(var(--grid-gutter) + ${frozenWidth} + ${sortedFields.slice(1).reduce((w, f) => w + widthOf(f), 0) + ADD_COL}px)`
  // How far the gutter and the frozen column reach in from the grid's start:
  // a cell brought into view stops beside them (globals.css's data-scroll-lead).
  const gridLead = `calc(var(--grid-gutter) + ${frozenWidth})`
  const gutterPair = canManage && !!onOpenRow

  // ---- the gliding ring and the frozen shadow ----------------------------
  const ringRef = React.useRef<HTMLDivElement>(null)
  const ruleRef = React.useRef<HTMLDivElement>(null)
  const ringCell = React.useRef<HTMLElement | null>(null)
  const placeRing = React.useCallback(() => {
    const ring = ringRef.current
    const td = ringCell.current
    const table = tableRef.current
    if (!ring || !table) return
    if (!td || !td.isConnected) {
      ring.dataset.on = "false"
      return
    }
    const t = table.getBoundingClientRect()
    const c = td.getBoundingClientRect()
    ring.style.width = `${c.width}px`
    ring.style.height = `${c.height}px`
    ring.style.transform = `translate(${c.left - t.left}px, ${c.top - t.top}px)`
    ring.dataset.inFrozen = td.hasAttribute("data-frozen") ? "true" : "false"
    ring.dataset.on = "true"
  }, [])
  const onFocusIn = React.useCallback(
    (e: React.FocusEvent) => {
      const td = (e.target as HTMLElement).closest<HTMLElement>("tbody td[data-kind]")
      ringCell.current = td
      // The gutter and the frozen column stay over the cells scrolled under
      // them, and a browser brings a cell into view without counting them: a
      // cell taking the focus there (a tap on the part that shows, or the
      // keys) comes out beside them rather than half under.
      const frozen = scrollRef.current?.querySelector<HTMLElement>("thead th[data-frozen]")
      if (td && frozen && scrollRef.current && !td.hasAttribute("data-frozen")) {
        const under = frozen.getBoundingClientRect().right - td.getBoundingClientRect().left
        if (under > 0) scrollRef.current.scrollLeft -= under
      }
      placeRing()
      const at = (e.target as HTMLElement).closest<HTMLElement>("tbody tr[data-index]")?.dataset.index
      const id = at === undefined ? undefined : latest.current.rows[Number(at)]?.id
      if (id) onRowFocus?.(id)
    },
    [placeRing, onRowFocus],
  )
  const onFocusOut = React.useCallback((e: React.FocusEvent) => {
    const to = e.relatedTarget as HTMLElement | null
    if (to && tableRef.current?.contains(to) && to.closest("tbody td[data-kind]")) return
    ringCell.current = null
    if (ringRef.current) ringRef.current.dataset.on = "false"
  }, [])
  React.useEffect(() => {
    const el = scrollRef.current
    const frame = frameRef.current
    if (!el || !frame) return
    let raf = 0
    let wasX = false
    const onScroll = () => {
      const x = el.scrollLeft > 0
      if (x !== wasX) {
        wasX = x
        frame.dataset.scrolledX = x ? "true" : "false"
      }
      // Only a ring in the frozen column moves against the content.
      if (ringRef.current?.dataset.inFrozen === "true" && !raf) {
        raf = requestAnimationFrame(() => {
          raf = 0
          placeRing()
        })
      }
    }
    el.addEventListener("scroll", onScroll, { passive: true })
    return () => {
      el.removeEventListener("scroll", onScroll)
      if (raf) cancelAnimationFrame(raf)
    }
  }, [placeRing])
  // Rows re-rendered (scrolled, new heights or columns): the ring follows
  // its cell, or hides when the cell has scrolled out of the window.
  const afterRows = React.useCallback(() => {
    if (ringCell.current) placeRing()
  }, [placeRing])
  React.useLayoutEffect(() => {
    afterRows()
  })

  // The hover rule at a column's right edge, and dragging it to resize.
  const showRule = React.useCallback((index: number | null) => {
    const rule = ruleRef.current
    const table = tableRef.current
    if (!rule || !table || rule.dataset.resizing === "true") return
    if (index === null) {
      rule.dataset.on = "false"
      return
    }
    const th = table.querySelector<HTMLElement>(`thead th[data-col-index="${index}"]`)
    if (!th) return
    rule.style.height = `${table.offsetHeight}px`
    rule.style.transform = `translateX(${th.offsetLeft + th.offsetWidth - 1}px)`
    rule.dataset.on = "true"
  }, [])
  const startResize = React.useCallback(
    (e: React.PointerEvent, index: number) => {
      const table = tableRef.current
      const col = table?.querySelectorAll("col")[index + 1] as HTMLTableColElement | undefined
      const th = table?.querySelector<HTMLElement>(`thead th[data-col-index="${index}"]`)
      const field = sortedFields[index]
      const rule = ruleRef.current
      if (!col || !th || !field || !table || !rule) return
      e.preventDefault()
      e.stopPropagation()
      const startX = e.clientX
      const startW = th.offsetWidth
      const left = th.offsetLeft
      rule.dataset.resizing = "true"
      rule.style.height = `${table.offsetHeight}px`
      let w = startW
      const move = (ev: PointerEvent) => {
        w = Math.max(80, Math.min(640, startW + ev.clientX - startX))
        col.style.width = `${w}px`
        rule.style.transform = `translateX(${left + w - 1}px)`
      }
      const up = () => {
        window.removeEventListener("pointermove", move)
        window.removeEventListener("pointerup", up)
        rule.dataset.resizing = "false"
        rule.dataset.on = "false"
        onWidth?.(field.id, Math.round(w))
      }
      window.addEventListener("pointermove", move)
      window.addEventListener("pointerup", up)
    },
    [sortedFields, onWidth],
  )
  const autoFit = React.useCallback(
    (index: number) => {
      const field = sortedFields[index]
      if (field) onWidth?.(field.id, columnWidth(field))
    },
    [sortedFields, onWidth],
  )

  // ---- cells at rest, and the one in use ------------------------------------
  // Every cell is drawn at rest, as plain markup (gridCells' restCell), but
  // the one in use, which is drawn live (Cell): a row entering the window
  // renders as one component, not one a cell. A cell comes to life as the
  // mouse comes onto it or a finger presses it, so the press, the caret and
  // the click land on its live controls; by its click, when the mouse found it
  // at rest (the focus in a live cell, or the keys on this one) or the click
  // came without a press (a key on a button, a test's click), made again on
  // the live control at the same place, with the caret a press left; and
  // before a key that would type in it. The arrows move between cells at rest.
  // A cell stays live until another comes to life. GridBody holds it: held
  // here, each hover rendered every column header.
  const liveRef = React.useRef<(cell: LiveCell) => void>(null)
  // The cell under the mouse: brought to life once the chunk is in, if it came first.
  const hovered = React.useRef<Element | null>(null)
  // A cell comes to life once the live cells' chunk is in (asked for as the
  // grid mounts); a click before then is made again once it is.
  const bringToLife = React.useCallback((td: Element | null | undefined): boolean => {
    const row = td?.closest<HTMLElement>("tr[data-row]")?.dataset.row
    const field = (td as HTMLElement | null | undefined)?.dataset.field
    if (!liveCellsIn || !td || !row || !field || !td.querySelector("[data-rest]")) return false
    flushSync(() => liveRef.current?.({ row, field }))
    return true
  }, [])
  // The mouse never takes the focus from the cell holding it. Brought to life,
  // that cell, or the one in use as another comes to life, is drawn anew and
  // the focus goes with its old box: while the mouse rested on the cell
  // clicked before (drawn anew under it), a word typed in the cell the keys
  // had reached lost every key after the first. Its click still opens a cell
  // the mouse left at rest (onRestClick).
  const bringToLifeUnderMouse = React.useCallback(
    (td: Element | null) => {
      const focused = document.activeElement?.closest("tbody td[data-field]")
      if (focused && tableRef.current?.contains(focused) && (focused === td || !focused.querySelector("[data-rest]"))) return
      bringToLife(td)
    },
    [bringToLife],
  )
  React.useEffect(() => {
    void warmLiveCells().then(() => bringToLifeUnderMouse(hovered.current))
  }, [bringToLifeUnderMouse])
  // A mouse's press is aimed at what was under it when it went down, and so is
  // a pen's at a computer, while a cell brought to life then is drawn after:
  // so a cell comes to life as such a pointer comes onto it, and its press
  // never brings one to life, which would send its click nowhere (a cell still
  // at rest opens by its click, onRestClick). A tap's press and click are
  // aimed afresh after the finger lifts, so only a finger's press brings a
  // cell to life, as it goes down.
  const onPointerOver = React.useCallback(
    (e: React.PointerEvent) => {
      if (e.pointerType === "touch") return
      hovered.current = (e.target as HTMLElement).closest("tbody td[data-field]")
      bringToLifeUnderMouse(hovered.current)
    },
    [bringToLifeUnderMouse],
  )
  const onPointerDown = React.useCallback(
    (e: React.PointerEvent) => {
      if (e.pointerType !== "touch") return
      bringToLife((e.target as HTMLElement).closest("tbody td[data-field]"))
    },
    [bringToLife],
  )
  const onRestClick = React.useCallback(
    (e: React.MouseEvent) => {
      const target = e.target as HTMLElement
      const td = target.closest<HTMLElement>("tbody td[data-field]")
      const root = td?.firstElementChild
      if (!td || !root || !target.closest("[data-rest]")) return
      const path = placeIn(root, target)
      // A click that came with a press keeps the caret, or a drag's selection,
      // that the press put in the box at rest, as a box the mouse came onto
      // keeps the press's own; a click without one selects the whole text.
      const pressed = e.detail > 0 ? selectionOf(target) : null
      e.preventDefault()
      e.stopPropagation()
      const again = () => {
        if (!bringToLife(td)) return
        const same = path && follow(td.firstElementChild, path)
        if (!(same instanceof HTMLElement)) return
        same.focus()
        if (same instanceof HTMLInputElement || same instanceof HTMLTextAreaElement) {
          if (pressed) same.setSelectionRange(...pressed)
          else same.select()
        }
        same.click()
      }
      if (liveCellsIn) again()
      else void warmLiveCells().then(again)
    },
    [bringToLife],
  )

  // A row given's place in the view: the rows read are its first, the rows
  // added here its last.
  const layout = body?.layout
  const length = layout ? layout.length : body ? Math.min(count ?? rows.length, FIRST_SCREEN_ROWS) : (count ?? rows.length)
  const placeOf = React.useRef((i: number) => i)
  placeOf.current = (i: number) => (layout ? layout.placeOf(i) : placeOfRow(i, rows.length, length, tail))

  // ---- keyboard -----------------------------------------------------------
  const focusCell = React.useCallback(
    (row: number, col: number, shut = false) => {
      const root = scrollRef.current
      if (!root) return
      const place = () => {
        const el = root.querySelector<HTMLElement>(`[data-cell="${row}:${col}"]`)
        if (!el) return false
        // Selected and shut: a text box's cell takes the focus, not the box.
        const to = shut ? (el.closest<HTMLElement>("[data-cell-box]") ?? el) : el
        to.focus()
        if (to instanceof HTMLTextAreaElement || (to instanceof HTMLInputElement && to.type !== "checkbox" && to.type !== "date")) to.select()
        // A box at rest is read-only, and a browser reveals no selection in one: brought into view here.
        to.scrollIntoView({ block: "nearest", inline: "nearest" })
        return true
      }
      if (place()) return
      virtualizerRef.current?.scrollToIndex(placeOf.current(row), { align: "auto" })
      requestAnimationFrame(() => {
        if (!place()) requestAnimationFrame(() => void place())
      })
    },
    [],
  )

  // The row the page asked to focus (one just added, or someone's), once it's here.
  React.useEffect(() => {
    if (!focusRow) return
    const index = shown.findIndex((r) => r.id === focusRow)
    if (index < 0) return
    focusCell(index, Math.max(0, sortedFields.findIndex((f) => f.id === selectField)), !!selectField)
    onFocused?.()
  }, [focusRow, selectField, shown, sortedFields, focusCell, onFocused])

  const onGridKey = React.useCallback(
    (e: React.KeyboardEvent<HTMLTableElement>) => {
      const target = e.target as HTMLElement
      // A key that would type in a text box at rest: the cell comes to life,
      // and the key goes on to its live box, everything selected for it to
      // replace (as a move between cells leaves a box). F2 opens it as is.
      if (target.hasAttribute("data-rest") && (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) && typesIn(e) && (e.key === "Process" || !isComposingKey(e.nativeEvent))) {
        const id = target.dataset.cell
        const td = target.closest("tbody td[data-field]")
        // Before the live cells' chunk is in, the key is held back (the box can't take it yet).
        if (!bringToLife(td)) {
          e.preventDefault()
          void warmLiveCells()
          return
        }
        const box = td?.querySelector<HTMLInputElement | HTMLTextAreaElement>(`[data-cell="${id}"]`)
        box?.focus()
        if (e.key === "F2") {
          e.preventDefault()
          box?.setSelectionRange(box.value.length, box.value.length)
        } else box?.select()
        return
      }
      // A cell selected but shut holds the focus itself, its text box inside (TextCell).
      const shut = target.hasAttribute("data-cell-box")
      const at = (shut ? target.querySelector<HTMLElement>("[data-cell]") : target.closest<HTMLElement>("[data-cell]"))?.dataset.cell
      if (!at || isComposingKey(e.nativeEvent)) return
      const [row, col] = at.split(":").map(Number)
      // Shift+Space selects the focused cell's row.
      if (e.key === " " && e.shiftKey) {
        const id = latest.current.rows[row]?.id
        if (id) {
          e.preventDefault()
          toggleRow(id)
        }
        return
      }
      // Enter or F2 opens a shut cell's box, and a typed key opens it to
      // replace what's there (the key goes on to the box, and to nothing else).
      if (shut && (e.key === "Enter" || e.key === "F2" || (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey))) {
        e.stopPropagation()
        if (e.key.length > 1) e.preventDefault()
        bringToLife(target.closest("tbody td[data-field]"))
        return focusCell(row, col)
      }
      const kind = (target.closest<HTMLElement>("[data-kind]")?.dataset.kind ?? "text") as CellKind
      let atStart = true
      let atEnd = true
      let lines: { first: boolean; last: boolean } | undefined
      // A box at rest is read-only with all of it selected: there is no caret
      // to move through, so the arrows go to the next cell from it.
      if ((target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) && (kind === "text" || kind === "number") && !target.hasAttribute("data-rest")) {
        const s = target.selectionStart ?? 0
        const end = target.selectionEnd ?? 0
        atStart = s === 0 && end === 0
        atEnd = s === target.value.length && end === target.value.length
        if (target instanceof HTMLTextAreaElement) lines = { first: !target.value.slice(0, s).includes("\n"), last: !target.value.slice(end).includes("\n") }
      }
      const to = nextCell(e, { row, col }, { rows: latest.current.rows.length, cols: sortedFields.length }, { kind, atStart, atEnd, lines })
      if (to) {
        e.preventDefault()
        e.stopPropagation()
        focusCell(to.row, to.col)
      } else if (swallowsAtEdge(e, kind)) {
        e.preventDefault()
        e.stopPropagation()
      }
    },
    [focusCell, sortedFields.length, toggleRow, bringToLife],
  )

  const ctx = React.useMemo<CellContext>(
    () => ({
      options: optionIndexOf(fields),
      tinted: tintedFields(fields),
      rowHeight,
      onEditField: canManage ? (fieldId) => setMenu({ field: fieldId, page: settingsPageOf(fields.find((f) => f.id === fieldId)?.type) ?? "formula" }) : undefined,
      tableId,
      relationFaces: linkFaces,
    }),
    [fields, rowHeight, canManage, tableId, linkFaces],
  )

  const anySelected = selected.size > 0
  const allSelected = rows.length > 0 && selected.size === rows.length
  const showSummary = !!summary && rows.length > 0
  // One function for every footer's menu, whatever the page passes: a new one each render re-rendered every footer.
  const pickSummary = useStableCallback((fieldId: string, fn: SummaryFn) => onSummary?.(fieldId, fn))
  const toggleGroup = useStableCallback((path: string[]) => grouping && heads && counts && grouping.onShut(heads.toggleShut(grouping.shut, path, counts)))
  const groups = React.useMemo(
    () =>
      layout && heads && grouping
        ? { layout, heads, levels: grouping.levels, all: fields, summary, held: grouping.read ? undefined : rows, onToggle: toggleGroup, px: heads.headerPx(touch), partial: grouping.partial }
        : null,
    [layout, heads, grouping, fields, summary, rows, toggleGroup, touch],
  )

  return (
    <div ref={frameRef} className="v3-grid relative" data-scrolled-x="false" data-row-height={rowHeight} data-gutter-pair={gutterPair ? "" : undefined}>
      {/* The grid scrolls inside its own frame so the header row can stay in
          view; scroll-pt keeps a cell focused from the keyboard out from
          under it, and data-scroll-lead the cells out from under the gutter
          and the frozen column, which are data-sticky-lead (globals.css). */}
      <div ref={scrollRef} className={cn(TABLE_VIEW_BODY, "scroll-pt-9")} style={{ "--scroll-lead": gridLead } as React.CSSProperties} data-scroll-lead="" data-table-grid="">
        <div className="relative" style={{ minWidth: tableWidth }}>
          <table
            ref={tableRef}
            className="w-full table-fixed border-separate border-spacing-0 text-ui"
            style={{ minWidth: tableWidth }}
            aria-rowcount={length + 1}
            aria-busy={(!!body && !layout) || undefined}
            onKeyDownCapture={onGridKey}
            onPointerOver={onPointerOver}
            onPointerDownCapture={onPointerDown}
            onClickCapture={onRestClick}
            onFocus={onFocusIn}
            onBlur={onFocusOut}
          >
            <colgroup>
              <col style={{ width: "var(--grid-gutter)" }} />
              {sortedFields.map((f, i) => (
                <col key={f.id} style={{ width: i === 0 ? frozenWidth : widthOf(f) }} />
              ))}
              <col data-spare="" />
            </colgroup>
            <thead className="sticky top-0 z-[4]">
              <tr>
                <th scope="col" data-gutter="" data-sticky-lead="" className="h-9 p-0">
                  {canManage && rows.length > 0 ? (
                    // Above the rows' checkboxes, where they stand (GridRow).
                    <span className="flex h-9 items-center pl-1.5 [@media(hover:none)]:pl-0">
                      <input
                        type="checkbox"
                        aria-label={allSelected ? "Clear the selection" : "Select every row"}
                        checked={allSelected}
                        onChange={() => setSelected(allSelected ? new Set() : new Set(rows.map((r) => r.id)))}
                        className={cn("v3-check transition-opacity", anySelected ? "opacity-100" : "opacity-0 hover:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100 [@media(hover:none)]:pointer-events-auto")}
                      />
                    </span>
                  ) : null}
                </th>
                {sortedFields.map((f, i) => (
                  <ColumnHeader
                    key={f.id}
                    index={i}
                    field={f}
                    fields={sortedFields}
                    tableId={tableId}
                    canManage={canManage}
                    frozen={i === 0}
                    openPage={menu?.field === f.id ? menu.page : null}
                    onOpenPage={(page) => setMenu(page ? { field: f.id, page } : null)}
                    onSave={(input) => withColumns((m) => m.saveColumn(cols, f, input))}
                    onDelete={() => void withColumns((m) => m.deleteColumn(cols, f))}
                    onDuplicate={f.type === "relation" || f.type === "rollup" ? undefined : () => void withColumns((m) => m.duplicateColumn(cols, f))}
                    onSort={onSort ? (dir) => onSort(f.id, dir) : undefined}
                    onFilter={onFilter ? () => onFilter(f.id) : undefined}
                    onHide={onHide && i > 0 ? () => onHide(f.id) : undefined}
                    onFilled={onChange}
                    onHover={showRule}
                    onResizeStart={onWidth ? startResize : undefined}
                    onAutoFit={onWidth ? autoFit : undefined}
                  />
                ))}
                {canManage ? <AddColumn tableId={tableId} fields={sortedFields} onCreate={(input) => withColumns((m) => m.createColumn(cols, input))} /> : <th aria-hidden="true" className="h-9 p-0" />}
              </tr>
            </thead>
            <GridBody
              rows={shown}
              count={length}
              tail={tail}
              height={height}
              scrollRef={scrollRef}
              virtualizerRef={virtualizerRef}
              colCount={colCount}
              fields={sortedFields}
              canManage={canManage}
              selected={selected}
              ctx={ctx}
              onCommit={commitCell}
              onLink={linkCell}
              edits={edits}
              onToggle={toggleRow}
              onOpen={onOpenRow}
              afterRows={afterRows}
              floatRoom={anySelected && canManage && showSummary}
              onNearEnd={onNearEnd}
              marked={marked}
              liveRef={liveRef}
              groups={groups}
              hues={hues}
              tints={tints}
            />
            {showSummary ? (
              <SummaryPart.View
                // Its height held while its chunk comes, so the rows don't move.
                fallback={
                  <tfoot className="sticky bottom-0 z-[4]">
                    <tr>
                      <td colSpan={colCount} className="h-[var(--grid-sum-row)] border-t border-line bg-sheet p-0" />
                    </tr>
                  </tfoot>
                }
                render={(m) => <m.SummaryBar rows={rows} fields={sortedFields} summary={summary} loaded={loaded} served={served} windowed={windowed} refusedSums={refusedSums} sumsOut={sumsOut} onPick={onSummary ? pickSummary : undefined} />}
              />
            ) : null}
          </table>
          <div ref={ringRef} className="v3-cell-ring pointer-events-none absolute left-0 top-0 z-[3] data-[in-frozen=true]:z-[5]" data-cell-ring="" data-on="false" aria-hidden="true" />
          <div ref={ruleRef} className="v3-col-rule pointer-events-none absolute left-0 top-0 z-[3]" data-on="false" aria-hidden="true" />
        </div>
      </div>

      {/* Outside the scrolling frame, so it is as wide as the grid's sheet
          however wide the columns run. */}
      {length === 0 && empty && <div>{empty}</div>}

      <button
        type="button"
        onClick={handleAddRow}
        disabled={adding}
        data-new-row=""
        {...ix("row")}
        className="flex h-[var(--grid-new-row)] w-full items-center gap-2 pl-3.5 text-ui text-ink-3 hover:text-ink"
      >
        <Plus className="size-4" aria-hidden="true" /> New row
      </button>

      {anySelected && canManage ? (
        // The bar floats on the New row line, stuck to the screen's foot while that line is under it (DB-23). On a phone
        // that line is often under the foot, and the bar lay over the summary bar's sums (A4, 29 Oct): there it floats
        // over the rows, 8 px over the summary bar, and the rows end with room for it (table.css, --float-foot).
        <div className="contents" data-float-over-sums={showSummary ? "" : undefined}>
          <div className="pointer-events-none sticky bottom-4 z-[6] flex justify-center" data-selection-float="">
            <SelectionPart.View
              fallback={null}
              render={(m) => {
                // Its actions are the chunk's too, off the table's first load.
                const s = { tableId, fields, rows, ids: selected, clear: () => setSelected(new Set()), confirm, offerUndo, onChange, onCreated }
                return <m.RowSelectionBar count={selected.size} onDuplicate={() => void m.duplicateRows(s)} onDelete={() => m.deleteRows(s)} onClear={s.clear} />
              }}
            />
          </div>
        </div>
      ) : null}
    </div>
  )
}

/** The one cell drawn live: its row and field. */
interface LiveCell {
  row: string
  field: string
}

/** Whether a key would type in a text box: a character, a deletion, a paste or a cut, F2, or an input method's first key. */
function typesIn(e: React.KeyboardEvent): boolean {
  if (e.key === "F2" || e.key === "Backspace" || e.key === "Delete" || e.key === "Process") return true
  if ((e.metaKey || e.ctrlKey) && !e.altKey) return e.key === "v" || e.key === "x"
  return e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey && !(e.key === " " && e.shiftKey)
}

/** Where el sits under root, as the index of each element on the way down. */
function placeIn(root: Element, el: Element): number[] | null {
  const path: number[] = []
  for (let n: Element | null = el; n !== root; n = n.parentElement) {
    if (!n?.parentElement) return null
    path.unshift(Array.prototype.indexOf.call(n.parentElement.children, n))
  }
  return path
}

/** A text box's selection, start and end (one place for a caret); null for a control without one, as a checkbox or an email box. */
function selectionOf(el: Element): [number, number] | null {
  if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) return null
  const { selectionStart: start, selectionEnd: end } = el
  return start === null || end === null ? null : [start, end]
}

/** The element at path under root: a live cell's markup is its resting cell's, place for place. */
function follow(root: Element | null, path: number[]): Element | null {
  let n: Element | null = root
  for (const i of path) n = n?.children[i] ?? null
  return n
}

/**
 * The grid's rows: the virtualizer and the window of rows it shows. Scrolling
 * renders this and the rows that enter, never the rest of the grid (the
 * header's menus, the summary bar, the toolbar), which re-rendered on every
 * scroll frame while the virtualizer lived in DataTableGrid.
 */
const GridBody = React.memo(function GridBody({
  rows,
  count,
  tail,
  height,
  scrollRef,
  virtualizerRef,
  colCount,
  fields,
  canManage,
  selected,
  ctx,
  onCommit,
  onLink,
  onToggle,
  onOpen,
  afterRows,
  floatRoom,
  onNearEnd,
  marked,
  edits,
  liveRef,
  groups,
  hues,
  tints,
}: {
  rows: TableRow[]
  /** The view's rows, read or not; the last tail of rows are its last. */
  count: number
  tail: number
  height: number
  scrollRef: React.RefObject<HTMLDivElement | null>
  virtualizerRef: React.MutableRefObject<Virtualizer<HTMLElement, Element> | null>
  colCount: number
  fields: TableField[]
  canManage: boolean
  selected: Set<string>
  ctx: CellContext
  onCommit: (row: TableRow, fieldId: string, value: unknown) => Promise<boolean>
  onLink: (rowId: string, fieldId: string, change: { add?: string[]; remove?: string[] }) => void
  onToggle: (rowId: string) => void
  onOpen?: (rowId: string) => void
  afterRows: () => void
  /** Room after the last row for the selection bar, which on a phone floats over the rows' foot (A4): the last row scrolls clear of it. */
  floatRoom: boolean
  onNearEnd?: (last: number) => void
  marked?: { rowId: string; note: string } | null
  /** What each row's cells show over its copy until it's read again (useCellCommit). */
  edits: ReadonlyMap<string, RowEdits>
  /** Where bringToLife sets the one cell drawn live: every other is drawn at rest. */
  liveRef: React.RefObject<((cell: LiveCell) => void) | null>
  groups: GroupBody | null
  hues?: ReadonlyMap<string, CampHue> | null
  tints?: ReadonlyMap<string, Record<string, string>> | null
}) {
  // The window over the view's places (viewWindow): a row read, one added
  // here (the last tail), or a row on its way, drawn as a placeholder.
  const layout = groups?.layout
  const head = groups?.px
  const sizeOf = React.useMemo(() => layout && ((p: number) => (layout.header(p) ? (head as number) : height)), [layout, head, height])
  const { virtualizer, items, padTop, padBottom, rowAt } = useViewWindow({
    given: rows.length,
    count,
    tail,
    rowPx: height,
    sizeOf,
    readTo: layout?.readTo,
    scrollRef,
    overscan: 12,
    scrollPaddingStart: HEADER_HEIGHT,
    initialRect: { width: 1024, height: 640 },
    firstScreen: FIRST_SCREEN_ROWS,
    nearEnd: NEAR_END_ROWS,
    onNearEnd,
  })
  virtualizerRef.current = virtualizer
  const [live, setLive] = React.useState<LiveCell | null>(null)
  liveRef.current = setLive
  React.useLayoutEffect(() => {
    afterRows()
  })
  const anySelected = selected.size > 0
  const keep = useKeptRows(sameRow)
  return (
    <tbody>
      {padTop > 0 && (
        <tr aria-hidden="true">
          <td colSpan={colCount} style={{ height: padTop, padding: 0, border: 0 }} />
        </tr>
      )}
      {items.map((item) => {
        const spot = layout?.at(item.index)
        if (spot && "group" in spot) {
          const H = groups?.heads.GroupHeaderRow
          return H && groups && <H key={`g${JSON.stringify(spot.group.key)}`} {...spot} place={item.index} height={groups.px} fields={fields} levels={groups.levels} all={groups.all} summary={groups.summary} held={groups.held} onToggle={groups.onToggle} partial={groups.partial} />
        }
        const at = spot ? spot.row : rowAt(item.index)
        const row = rows[at]
        if (!row) return <PlaceholderRow key={`~${item.index}`} height={height} colCount={colCount} />
        const props: GridRowProps = {
          row,
          rowIndex: at,
          place: item.index,
          num: spot ? spot.n : item.index,
          hue: hues?.get(row.id),
          tints: tints?.get(row.id),
          height,
          fields,
          canManage,
          selected: selected.has(row.id),
          selecting: anySelected,
          ctx,
          onCommit,
          onLink,
          onToggle,
          onOpen,
          note: marked?.rowId === row.id ? marked.note : undefined,
          liveField: live?.row === row.id ? live.field : null,
          edits: edits.get(row.id),
        }
        // The same element as last time while sameRow holds: React skips it.
        return keep(row.id, props, (p) => <GridRow key={row.id} {...p} />)
      })}
      {padBottom > 0 && (
        <tr aria-hidden="true">
          <td colSpan={colCount} style={{ height: padBottom, padding: 0, border: 0 }} />
        </tr>
      )}
      {floatRoom && (
        <tr aria-hidden="true" data-float-room="">
          <td colSpan={colCount} />
        </tr>
      )}
    </tbody>
  )
})

/**
 * A row of the view on its way from the server (a window not read yet): its
 * height held, so the scrollbar is the view's, with a quiet bar where its
 * first cell's text will be.
 */
function PlaceholderRow({ height, colCount }: { height: number; colCount: number }) {
  return (
    <tr aria-hidden="true" data-placeholder="" style={{ height }}>
      <td data-gutter="" data-sticky-lead="" className="p-0" />
      <td colSpan={Math.max(1, colCount - 1)} className="px-3 py-0">
        <Skeleton className="h-2 w-32 max-w-[40%]" />
      </td>
    </tr>
  )
}

/**
 * One row of the grid: one render as it enters the window. GridBody keeps
 * its element while sameRow holds (the row's id and values, not the object),
 * so asking for the table again after an edit, or a scroll, renders only the
 * rows whose values changed or that came into the window. A row in
 * React.memo with a comparator was two components a row (the memo, then the
 * row), and rows entering a scroll were half of what it rendered.
 */
interface GridRowProps {
row: TableRow
/** Its index among the rows given: its cells' addresses, which the keyboard reads. */
rowIndex: number
/** Its place in the grid, and its number in the view (a grouped view's headers have places, not numbers). */
place: number
num: number
hue?: CampHue
/** Its cells' tints, by field. */
tints?: Record<string, string>
height: number
fields: TableField[]
canManage: boolean
selected: boolean
selecting: boolean
ctx: CellContext
onCommit: (row: TableRow, fieldId: string, value: unknown) => Promise<boolean>
onLink: (rowId: string, fieldId: string, change: { add?: string[]; remove?: string[] }) => void
onToggle: (rowId: string) => void
onOpen?: (rowId: string) => void
/** Why the row shows here though the view's rules would hide or move it. */
note?: string
/** The field of this row's that is drawn live (Cell); the rest are drawn at rest (restCell). */
liveField: string | null
/** The edits its copy doesn't show yet: its cells show them, those on their way as saving. */
edits?: RowEdits
}

function GridRow({
  row,
  rowIndex,
  place,
  num,
  hue,
  tints,
  height,
  fields,
  canManage,
  selected,
  selecting,
  ctx,
  onCommit,
  onLink,
  onToggle,
  onOpen,
  note,
  liveField,
  edits,
}: GridRowProps) {
  const values = React.useMemo(() => shownValues(row, edits), [row, edits])
  return (
    <tr
      data-index={rowIndex}
      data-row={row.id}
      data-selected={selected || undefined}
      aria-rowindex={place + 2}
      aria-selected={selected || undefined}
      data-marked={note ? "" : undefined}
      className="group"
      style={{ height }}
    >
      <td data-gutter="" data-sticky-lead="" className="p-0" title={note}>
        <span className="relative flex h-full items-center justify-center">
          {hue ? <span aria-hidden="true" data-row-hue={hue} className={cn("absolute inset-y-0 left-0 w-[3px] bg-hue", HUE_CLASS[hue])} /> : null}
          {/* The number gives way to the row's checkbox and open button where they show:
              under the pointer, and always on a touch screen (DB-26: "1↗" at 390). */}
          <span
            className={cn(
              "text-meta tabular-nums text-ink-3 transition-opacity",
              (selecting || selected) && canManage && "opacity-0",
              (canManage || onOpen) && "group-hover:opacity-0 [@media(hover:none)]:opacity-0",
            )}
          >
            {note ? <Pin className="size-3.5 text-camp-sun-ink" aria-label={`New row. ${note}`} /> : num + 1}
          </span>
          {canManage ? (
            <input
              type="checkbox"
              aria-label={`Select row ${num + 1}`}
              checked={selected}
              onChange={() => onToggle(row.id)}
              className={cn(
                // 6-22 px under the pointer, ending where the open button starts; 0-24 on a touch screen.
                "v3-check absolute left-1.5 transition-opacity [@media(hover:none)]:left-0",
                selected || selecting ? "opacity-100" : "pointer-events-none opacity-0 group-hover:pointer-events-auto group-hover:opacity-100 focus-visible:pointer-events-auto focus-visible:opacity-100 [@media(hover:none)]:pointer-events-auto [@media(hover:none)]:opacity-100",
              )}
            />
          ) : null}
          {row.comments ? (
            // People are talking about this row: a dot in the corner, and
            // the open button says how many comments its open threads hold.
            <span data-row-comments={row.comments} title={commentsLabel(row.comments)} className="pointer-events-none absolute right-1 top-1 flex group-hover:opacity-0">
              <UnreadDot className="block" />
            </span>
          ) : null}
          {row.page ? (
            // The row has a page of its own (rows as pages): a small page
            // mark in the other corner, and the open button says so.
            <span data-row-page="" title="This row has a page" className="pointer-events-none absolute bottom-1 right-1 flex text-ink-3 group-hover:opacity-0">
              <FileText className="size-2.5" aria-hidden />
            </span>
          ) : null}
          {onOpen ? (
            // On a touch screen it is a 24 px tap, 8 px clear of the first
            // cell, beside the checkbox's 24 px and sharing no pixel with it
            // (table.css widens the gutter for the two): a browser gives a tap
            // near a small button to the button, and this one took taps meant
            // for the cell (TAB-BUG-15).
            <button
              type="button"
              aria-label={openRowLabel(num + 1, row)}
              onClick={() => onOpen(row.id)}
              className="pointer-events-none absolute right-0.5 inline-flex size-5 items-center justify-center rounded-md text-ink-3 opacity-0 transition-opacity hover:bg-press hover:text-ink group-hover:pointer-events-auto group-hover:opacity-100 focus-visible:pointer-events-auto focus-visible:opacity-100 [@media(hover:none)]:pointer-events-auto [@media(hover:none)]:right-2 [@media(hover:none)]:size-6 [@media(hover:none)]:opacity-100"
            >
              <Maximize2 className="size-3" />
            </button>
          ) : null}
        </span>
      </td>
      {fields.map((f, col) => {
        const cellId = `${rowIndex}:${col}`
        // At rest, plain markup: one render a row, not one a cell.
        const rest = f.id === liveField ? null : restCell({ field: f, value: values[f.id], cellId, primary: col === 0, ctx })
        const saving = !!edits && f.id in edits.saving
        return (
          <td key={f.id} data-field={f.id} data-kind={fieldKind(f.type).cell} data-frozen={col === 0 || undefined} data-sticky-lead={col === 0 || undefined} data-tint={tints?.[f.id]} aria-busy={saving || undefined} data-saving={saving || undefined} className={cn("overflow-hidden p-0 align-middle", alignsRight(f) && "text-right")}>
            {rest ?? (
              <LiveCells.View
                // Until the live cells' chunk is in: the cell as it rests, or its text.
                fallback={restCell({ field: f, value: values[f.id], cellId, primary: col === 0, ctx }) ?? waitFace({ field: f, value: values[f.id], cellId })}
                render={(m) => (
                  <m.Cell
                    field={f}
                    value={values[f.id]}
                    cellId={cellId}
                    primary={col === 0}
                    ctx={ctx}
                    onCommit={(v) => onCommit(row, f.id, v)}
                    onLink={(change) => onLink(row.id, f.id, change)}
                  />
                )}
              />
            )}
          </td>
        )
      })}
      <td className="p-0" />
    </tr>
  )
}

/** Whether a row drawn with a renders as it would with b (GridBody keeps its element). */
function sameRow(a: GridRowProps, b: GridRowProps): boolean {
  return (
    a.row.id === b.row.id &&
    a.row.values === b.row.values &&
    a.row.comments === b.row.comments &&
    a.row.page === b.row.page &&
    a.rowIndex === b.rowIndex &&
    a.place === b.place &&
    a.num === b.num &&
    a.hue === b.hue &&
    a.tints === b.tints &&
    a.height === b.height &&
    a.fields === b.fields &&
    a.canManage === b.canManage &&
    a.selected === b.selected &&
    a.selecting === b.selecting &&
    a.ctx === b.ctx &&
    a.onCommit === b.onCommit &&
    a.onLink === b.onLink &&
    a.onToggle === b.onToggle &&
    a.onOpen === b.onOpen &&
    a.note === b.note &&
    a.liveField === b.liveField &&
    a.edits === b.edits
  )
}

