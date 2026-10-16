"use client"

import * as React from "react"
import { useVirtualizer, type Virtualizer } from "@tanstack/react-virtual"
import "./table.css"
import { cn } from "@/lib/utils/helpers/cn"
import { useToast } from "@/hooks/use-toast"
import { useConfirm } from "@/hooks/useConfirm"
import { Copy, Maximize2, Pin, Plus, Trash2, X } from "@/lib/icons"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { FloatingBar, FloatingBarButton, FloatingBarDivider } from "@/components/ui/FloatingBar"
import {
  createField,
  createRow,
  deleteField,
  deleteRow,
  isNumeric,
  parseFieldConfig,
  parseRowValues,
  updateField,
  writableValues,
  type TableField,
  type TableRow,
} from "@/services/tableService"
import { nextCell, swallowsAtEdge, type CellKind } from "@/lib/tables/gridKeys"
import { TABLE_VIEW_BODY } from "@/components/table/TableViewFrame"
import { Cell, cellKind, optionIndexOf, type CellContext } from "@/components/table/gridCells"
import { AddColumn, ColumnHeader, type ColumnCreateInput, type ColumnPage, type ColumnSaveInput } from "@/components/table/ColumnMenu"
import { useCellCommit, type CellCommit } from "@/lib/tables/useCellCommit"
import { rowPx, type RowHeight, type SummaryFn } from "@/lib/tables/display"
import { SUMMARY_LABEL, defaultSummary, summarize, summaryChoices } from "@/lib/tables/summary"
import { isComposingKey } from "@/lib/keys/ime"
import { formatLocale } from "@/lib/tables/numberFormat"

export { groupedNumber } from "@/components/table/gridCells"

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
  onFocused?: () => void
  /** The rows in view near the last one given: the page reads a page more. */
  onNearEnd?: () => void
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
  /** From a column's menu. */
  onSort?: (fieldId: string, dir: "asc" | "desc") => void
  onFilter?: (fieldId: string) => void
  onHide?: (fieldId: string) => void
  /** The expand icon in the gutter: opens the row's record panel. */
  onOpenRow?: (rowId: string) => void
  /** Saving cells, when the page shares it with a record panel. */
  commit?: CellCommit
  /** A phone: the frozen column caps at 140 px. */
  compact?: boolean
}

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

/** The default (medium) row height. */
export const GRID_ROW_HEIGHT = 40
const HEADER_HEIGHT = 36
const GUTTER = 44
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
  onFocused,
  onNearEnd,
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
  onSort,
  onFilter,
  onHide,
  onOpenRow,
  commit: shared,
  compact,
}: DataTableGridProps) {
  const { toast } = useToast()
  const confirm = useConfirm()
  const [adding, setAdding] = React.useState(false)
  const [selected, setSelected] = React.useState<Set<string>>(() => new Set())
  const [menu, setMenu] = React.useState<{ field: string; page: ColumnPage } | null>(null)

  const sortedFields = React.useMemo(() => {
    const hide = new Set(hidden || [])
    return [...fields].sort((a, b) => a.position - b.position).filter((f) => !hide.has(f.id))
  }, [fields, hidden])

  const own = useCellCommit({ tableId, rows, onChange })
  const { commitCell, linkCell } = shared ?? own

  const latest = React.useRef({ rows })
  latest.current = { rows }

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

  const deleteSelected = () => {
    const ids = [...selected]
    confirm({
      title: ids.length === 1 ? "Delete the selected row?" : `Delete ${ids.length} selected rows?`,
      description: "They're removed for everyone. This can't be undone.",
      confirmText: "Delete selected",
      destructive: true,
      onConfirm: async () => {
        try {
          await Promise.all(ids.map((id) => deleteRow(tableId, id)))
          setSelected(new Set())
          toast({ title: ids.length === 1 ? "Row deleted" : `${ids.length} rows deleted` })
        } catch {
          // surfaced
        } finally {
          onChange()
        }
      },
    })
  }

  // Copies go after every row, one after another, in the order shown.
  const duplicateSelected = async () => {
    const ids = new Set(selected)
    const picked = rows.filter((r) => ids.has(r.id))
    const made: TableRow[] = []
    try {
      for (const r of picked) made.push(await createRow(tableId, writableValues(fields, parseRowValues(r))))
      setSelected(new Set())
      toast({ title: picked.length === 1 ? "Row duplicated" : `${picked.length} rows duplicated` })
    } catch {
      // surfaced
    } finally {
      const added = made.filter((r) => r?.id)
      if (onCreated && added.length) onCreated(added)
      else onChange()
    }
  }

  const createColumn = async (input: ColumnCreateInput) => {
    const pos = fields.length ? Math.max(...fields.map((f) => f.position)) + 1 : 0
    try {
      const f = await createField(tableId, { name: input.name, type: input.type, position: pos, config: input.config })
      onChange()
      // A plain type opens its menu on its name.
      if (f?.id && input.type !== "formula" && input.type !== "relation" && input.type !== "rollup") setMenu({ field: f.id, page: "main" })
    } catch {
      // surfaced
    }
  }

  // Resolves whether it saved. A save sends what the menu changed and nothing
  // of the page's copy: its place, sent with a rename or an option, put back a
  // column someone had moved meanwhile, and its name a rename.
  const saveColumn = async (field: TableField, input: ColumnSaveInput): Promise<boolean> => {
    try {
      await updateField(tableId, field.id, input)
      return true
    } catch {
      // surfaced
      return false
    } finally {
      onChange()
    }
  }

  const duplicateColumn = async (field: TableField) => {
    const pos = Math.max(...fields.map((f) => f.position)) + 1
    const { result: _r, error: _e, ...cfg } = parseFieldConfig(field) as Record<string, unknown>
    void _r
    void _e
    try {
      await createField(tableId, { name: `${field.name} copy`, type: field.type, position: pos, config: cfg })
      onChange()
    } catch {
      // surfaced
    }
  }

  const deleteColumn = (field: TableField) => {
    confirm({
      title: `Delete the column "${field.name}"?`,
      description: "Its cells are emptied in every row. This can't be undone.",
      confirmText: "Delete column",
      destructive: true,
      onConfirm: async () => {
        try {
          await deleteField(tableId, field.id)
          onChange()
          toast({ title: "Column deleted" })
        } catch {
          // surfaced
        }
      },
    })
  }

  // ---- layout -------------------------------------------------------------
  const touch = React.useMemo(touchScreen, [])
  const height = rowPx(rowHeight, touch)
  const scrollRef = React.useRef<HTMLDivElement>(null)
  const frameRef = React.useRef<HTMLDivElement>(null)
  const tableRef = React.useRef<HTMLTableElement>(null)
  // The rows' window lives in GridBody, so scrolling renders the rows and
  // nothing else: the header's column menus and the summary bar stay put.
  // focusCell reaches the virtualizer through this ref.
  const virtualizerRef = React.useRef<Virtualizer<HTMLDivElement, Element> | null>(null)
  const widthOf = (f: TableField, i: number) => {
    const w = widths?.[f.id] ?? columnWidth(f)
    return compact && i === 0 ? Math.min(w, 140) : w
  }
  // The gutter, the fields, and a last column at the end (Add column for an
  // editor, nothing for a reader) that takes whatever room is left: with
  // every column a fixed width, a fixed-layout table shares spare room out
  // across all of them, so a new table's one column started a third of the
  // way across, behind a stretched row-number gutter.
  const colCount = sortedFields.length + 2
  const tableWidth = GUTTER + sortedFields.reduce((w, f, i) => w + widthOf(f, i), 0) + ADD_COL

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
      ringCell.current = (e.target as HTMLElement).closest<HTMLElement>("tbody td[data-kind]")
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

  // ---- keyboard -----------------------------------------------------------
  const focusCell = React.useCallback(
    (row: number, col: number) => {
      const root = scrollRef.current
      if (!root) return
      const place = () => {
        const el = root.querySelector<HTMLElement>(`[data-cell="${row}:${col}"]`)
        if (!el) return false
        el.focus()
        if (el instanceof HTMLTextAreaElement || (el instanceof HTMLInputElement && el.type !== "checkbox" && el.type !== "date")) el.select()
        return true
      }
      if (place()) return
      virtualizerRef.current?.scrollToIndex(row, { align: "auto" })
      requestAnimationFrame(() => {
        if (!place()) requestAnimationFrame(() => void place())
      })
    },
    [],
  )

  // The row the page asked to focus (one just added), once it's here: its first cell.
  React.useEffect(() => {
    if (!focusRow) return
    const index = rows.findIndex((r) => r.id === focusRow)
    if (index < 0) return
    focusCell(index, 0)
    onFocused?.()
  }, [focusRow, rows, focusCell, onFocused])

  const onGridKey = React.useCallback(
    (e: React.KeyboardEvent<HTMLTableElement>) => {
      const target = e.target as HTMLElement
      const at = target.closest<HTMLElement>("[data-cell]")?.dataset.cell
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
      const kind = (target.closest<HTMLElement>("[data-kind]")?.dataset.kind ?? "text") as CellKind
      let atStart = true
      let atEnd = true
      let lines: { first: boolean; last: boolean } | undefined
      if ((target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) && (kind === "text" || kind === "number")) {
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
    [focusCell, sortedFields.length, toggleRow],
  )

  const ctx = React.useMemo<CellContext>(
    () => ({
      options: optionIndexOf(fields),
      rowHeight,
      onEditField: canManage ? (fieldId) => setMenu({ field: fieldId, page: "formula" }) : undefined,
    }),
    [fields, rowHeight, canManage],
  )

  const anySelected = selected.size > 0
  const allSelected = rows.length > 0 && selected.size === rows.length
  const showSummary = !!summary && rows.length > 0

  return (
    <div ref={frameRef} className="v3-grid relative" data-scrolled-x="false" data-row-height={rowHeight}>
      {/* The grid scrolls inside its own frame so the header row can stay in
          view; scroll-pt keeps a cell focused from the keyboard out from
          under it. */}
      <div ref={scrollRef} className={cn(TABLE_VIEW_BODY, "scroll-pt-9")} data-table-grid="">
        <div className="relative" style={{ minWidth: tableWidth }}>
          <table
            ref={tableRef}
            className="w-full table-fixed border-separate border-spacing-0 text-ui"
            style={{ minWidth: tableWidth }}
            aria-rowcount={rows.length + 1}
            onKeyDownCapture={onGridKey}
            onFocus={onFocusIn}
            onBlur={onFocusOut}
          >
            <colgroup>
              <col style={{ width: GUTTER }} />
              {sortedFields.map((f, i) => (
                <col key={f.id} style={{ width: widthOf(f, i) }} />
              ))}
              <col data-spare="" />
            </colgroup>
            <thead className="sticky top-0 z-[4]">
              <tr>
                <th scope="col" data-gutter="" className="h-9 p-0">
                  {canManage && rows.length > 0 ? (
                    <span className="flex h-9 items-center justify-center">
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
                    onSave={(input) => saveColumn(f, input)}
                    onDelete={() => deleteColumn(f)}
                    onDuplicate={f.type === "relation" || f.type === "rollup" ? undefined : () => void duplicateColumn(f)}
                    onSort={onSort ? (dir) => onSort(f.id, dir) : undefined}
                    onFilter={onFilter ? () => onFilter(f.id) : undefined}
                    onHide={onHide && i > 0 ? () => onHide(f.id) : undefined}
                    onFilled={onChange}
                    onHover={showRule}
                    onResizeStart={onWidth ? startResize : undefined}
                    onAutoFit={onWidth ? autoFit : undefined}
                  />
                ))}
                {canManage ? <AddColumn tableId={tableId} fields={sortedFields} onCreate={createColumn} /> : <th aria-hidden="true" className="h-9 p-0" />}
              </tr>
            </thead>
            <GridBody
              rows={rows}
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
              onToggle={toggleRow}
              onOpen={onOpenRow}
              afterRows={afterRows}
              onNearEnd={onNearEnd}
              marked={marked}
            />
            {showSummary ? (
              <tfoot className="sticky bottom-0 z-[4]">
                <tr data-summary-bar="">
                  <td data-gutter="" className="h-8 border-t border-line bg-sheet p-0" />
                  {sortedFields.map((f, i) => (
                    <SummaryCell
                      key={f.id}
                      field={f}
                      rows={rows}
                      frozen={i === 0}
                      fn={summary?.[f.id] ?? defaultSummary(f)}
                      loaded={loaded}
                      onPick={onSummary ? (fn) => onSummary(f.id, fn) : undefined}
                    />
                  ))}
                  <td className="border-t border-line bg-sheet" />
                </tr>
              </tfoot>
            ) : null}
          </table>
          <div ref={ringRef} className="v3-cell-ring pointer-events-none absolute left-0 top-0 z-[3] data-[in-frozen=true]:z-[5]" data-cell-ring="" data-on="false" aria-hidden="true" />
          <div ref={ruleRef} className="v3-col-rule pointer-events-none absolute left-0 top-0 z-[3]" data-on="false" aria-hidden="true" />
        </div>
      </div>

      {/* Outside the scrolling frame, so it is as wide as the grid's sheet
          however wide the columns run. */}
      {rows.length === 0 && empty && <div>{empty}</div>}

      <button
        type="button"
        onClick={handleAddRow}
        disabled={adding}
        data-new-row=""
        className="flex h-9 w-full items-center gap-2 pl-3.5 text-ui text-ink-3 transition-colors hover:bg-hover hover:text-ink focus-visible:bg-hover focus-visible:outline-none"
      >
        <Plus className="size-4" aria-hidden="true" /> New row
      </button>

      {anySelected && canManage ? (
        <div className="pointer-events-none sticky bottom-4 z-[6] flex justify-center">
          <FloatingBar label="Selected rows" className="pointer-events-auto" onEscape={() => setSelected(new Set())}>
            <span className="px-2 text-ui-sm font-medium text-ink">
              {selected.size} {selected.size === 1 ? "row" : "rows"}
            </span>
            <FloatingBarDivider />
            <FloatingBarButton label="Duplicate" onClick={() => void duplicateSelected()}>
              <Copy className="size-4" />
            </FloatingBarButton>
            <FloatingBarButton label="Delete" onClick={deleteSelected} className="text-danger-ink">
              <Trash2 className="size-4" />
            </FloatingBarButton>
            <FloatingBarDivider />
            <FloatingBarButton label="Clear the selection" onClick={() => setSelected(new Set())}>
              <X className="size-4" />
            </FloatingBarButton>
          </FloatingBar>
        </div>
      ) : null}
    </div>
  )
}

/**
 * One summary cell (T14): "Sum 3,280" in meta, a menu of functions on click.
 * Of the rows loaded alone, it says so ("Sum of 500 loaded"): a 1,200-row
 * budget's Sum was of its first 500, unmarked (the W0 audit).
 */
function SummaryCell({ field, rows, frozen, fn, loaded, onPick }: { field: TableField; rows: TableRow[]; frozen: boolean; fn: SummaryFn; loaded?: number; onPick?: (fn: SummaryFn) => void }) {
  const result = React.useMemo(() => summarize(field, rows, fn), [field, rows, fn])
  const numeric = isNumeric(field)
  const label = result && loaded !== undefined ? `${result.label} of ${formatLocale(loaded, {})} loaded` : result?.label
  const body = result ? (
    <>
      <span className="text-ink-3">{label}</span> <span className="tabular-nums text-ink-2">{result.value}</span>
    </>
  ) : (
    <span className="text-ink-3 opacity-0 transition-opacity group-hover/sum:opacity-100 [@media(hover:none)]:opacity-100 [@media(hover:none)]:pointer-events-auto">Summarise</span>
  )
  return (
    <td data-frozen={frozen || undefined} className="group/sum h-8 border-t border-line bg-sheet p-0">
      {onPick ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label={`${field.name} summary: ${result ? `${label} ${result.value}` : "none"}`}
              className={cn("flex h-8 w-full items-center gap-1 truncate px-3 text-meta hover:bg-hover", numeric && "justify-end")}
            >
              {body}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align={numeric ? "end" : "start"} side="top" className="content-float w-44 rounded-xl p-1 shadow-e3">
            {(["none", ...summaryChoices(field)] as SummaryFn[]).map((s) => (
              <DropdownMenuItem key={s} onSelect={() => onPick(s)} className={cn(s === fn && "font-medium text-ink")}>
                {SUMMARY_LABEL[s]}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : (
        <span className={cn("flex h-8 items-center gap-1 truncate px-3 text-meta", numeric && "justify-end")}>{body}</span>
      )}
    </td>
  )
}

/**
 * The grid's rows: the virtualizer and the window of rows it shows. Scrolling
 * renders this and the rows that enter, never the rest of the grid (the
 * header's menus, the summary bar, the toolbar), which re-rendered on every
 * scroll frame while the virtualizer lived in DataTableGrid.
 */
const GridBody = React.memo(function GridBody({
  rows,
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
  onNearEnd,
  marked,
}: {
  rows: TableRow[]
  height: number
  scrollRef: React.RefObject<HTMLDivElement | null>
  virtualizerRef: React.MutableRefObject<Virtualizer<HTMLDivElement, Element> | null>
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
  onNearEnd?: () => void
  marked?: { rowId: string; note: string } | null
}) {
  // Every row is one of the four preset heights (the cells clip), so rows
  // are never measured: measuring put a ResizeObserver and a layout read on
  // each row the window mounted while scrolling.
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => height,
    overscan: 12,
    scrollPaddingStart: HEADER_HEIGHT,
    initialRect: { width: 1024, height: 640 },
    getItemKey: (i) => rows[i]?.id ?? i,
  })
  virtualizerRef.current = virtualizer
  React.useEffect(() => {
    virtualizer.measure()
  }, [height, virtualizer])
  React.useLayoutEffect(() => {
    afterRows()
  })
  const measured = virtualizer.getVirtualItems()
  const items =
    measured.length || !rows.length
      ? measured
      : Array.from({ length: Math.min(rows.length, FIRST_SCREEN_ROWS) }, (_, index) => ({
          index,
          start: index * height,
          end: (index + 1) * height,
        }))
  const padTop = items.length ? items[0].start : 0
  const padBottom = items.length ? virtualizer.getTotalSize() - items[items.length - 1].end : 0
  const anySelected = selected.size > 0
  // Within a few screens of the last row given: the page reads on.
  const last = items.length ? items[items.length - 1].index : -1
  React.useEffect(() => {
    if (onNearEnd && rows.length && last >= rows.length - NEAR_END_ROWS) onNearEnd()
  }, [onNearEnd, last, rows.length])
  return (
    <tbody>
      {padTop > 0 && (
        <tr aria-hidden="true">
          <td colSpan={colCount} style={{ height: padTop, padding: 0, border: 0 }} />
        </tr>
      )}
      {items.map((item) => {
        const row = rows[item.index]
        if (!row) return null
        return (
          <GridRow
            key={row.id}
            row={row}
            rowIndex={item.index}
            height={height}
            fields={fields}
            canManage={canManage}
            selected={selected.has(row.id)}
            selecting={anySelected}
            ctx={ctx}
            onCommit={onCommit}
            onLink={onLink}
            onToggle={onToggle}
            onOpen={onOpen}
            note={marked?.rowId === row.id ? marked.note : undefined}
          />
        )
      })}
      {padBottom > 0 && (
        <tr aria-hidden="true">
          <td colSpan={colCount} style={{ height: padBottom, padding: 0, border: 0 }} />
        </tr>
      )}
    </tbody>
  )
})

/**
 * One row of the grid. Memoised on the row's id and values, so asking for the
 * table again after an edit renders only the rows whose values changed.
 */
const GridRow = React.memo(
  function GridRow({
    row,
    rowIndex,
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
  }: {
    row: TableRow
    rowIndex: number
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
  }) {
    const values = React.useMemo(() => parseRowValues(row), [row])
    return (
      <tr
        data-index={rowIndex}
        data-selected={selected || undefined}
        aria-rowindex={rowIndex + 2}
        aria-selected={selected || undefined}
        data-marked={note ? "" : undefined}
        className="group"
        style={{ height }}
      >
        <td data-gutter="" className="p-0" title={note}>
          <span className="relative flex h-full items-center justify-center">
            <span
              className={cn(
                "text-meta tabular-nums text-ink-3 transition-opacity",
                (selecting || selected) && canManage && "opacity-0",
                canManage && "group-hover:opacity-0",
              )}
            >
              {note ? <Pin className="size-3.5 text-camp-sun-ink" aria-label={`New row. ${note}`} /> : rowIndex + 1}
            </span>
            {canManage ? (
              <input
                type="checkbox"
                aria-label={`Select row ${rowIndex + 1}`}
                checked={selected}
                onChange={() => onToggle(row.id)}
                className={cn(
                  "v3-check absolute left-2 transition-opacity [@media(hover:none)]:left-0.5",
                  selected || selecting ? "opacity-100" : "pointer-events-none opacity-0 group-hover:pointer-events-auto group-hover:opacity-100 focus-visible:pointer-events-auto focus-visible:opacity-100 [@media(hover:none)]:pointer-events-auto [@media(hover:none)]:opacity-100",
                )}
              />
            ) : null}
            {onOpen ? (
              // On a touch screen it keeps 8 px clear of the first cell, and
              // the checkbox moves out of its way: a browser gives a tap near
              // a small button to the button, and this one took taps meant
              // for the cell (TAB-BUG-15).
              <button
                type="button"
                aria-label={`Open row ${rowIndex + 1}`}
                onClick={() => onOpen(row.id)}
                className="pointer-events-none absolute right-0.5 inline-flex size-5 items-center justify-center rounded-md text-ink-3 opacity-0 transition-opacity hover:bg-press hover:text-ink group-hover:pointer-events-auto group-hover:opacity-100 focus-visible:pointer-events-auto focus-visible:opacity-100 [@media(hover:none)]:pointer-events-auto [@media(hover:none)]:right-2 [@media(hover:none)]:opacity-100"
              >
                <Maximize2 className="size-3" />
              </button>
            ) : null}
          </span>
        </td>
        {fields.map((f, col) => (
          <td key={f.id} data-kind={cellKind(f)} data-frozen={col === 0 || undefined} className={cn("overflow-hidden p-0 align-middle", isNumeric(f) && "text-right")}>
            <Cell
              field={f}
              value={values[f.id]}
              cellId={`${rowIndex}:${col}`}
              primary={col === 0}
              ctx={ctx}
              onCommit={(v) => onCommit(row, f.id, v)}
              onLink={(change) => onLink(row.id, f.id, change)}
            />
          </td>
        ))}
        <td className="p-0" />
      </tr>
    )
  },
  (a, b) =>
    a.row.id === b.row.id &&
    a.row.values === b.row.values &&
    a.rowIndex === b.rowIndex &&
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
    a.note === b.note,
)
