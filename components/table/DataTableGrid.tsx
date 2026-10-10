"use client"

import * as React from "react"
import { useVirtualizer } from "@tanstack/react-virtual"
import { cn } from "@/lib/utils/helpers/cn"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useToast } from "@/hooks/use-toast"
import { useConfirm } from "@/hooks/useConfirm"
import { Plus, Trash2, Check, ChevronDown, Sparkles, Loader2, AlertTriangle, Type, Hash, CircleDot, Tag, CalendarDays, CheckSquare, Link2, AtSign, User, ArrowUpRight, Sigma, Network } from "@/lib/icons"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  TableField,
  TableRow,
  FieldType,
  SelectOption,
  RelationRef,
  parseFieldConfig,
  parseRowValues,
  formulaOf,
  relationOf,
  rollupOf,
  computedOf,
  fieldProblem,
  createRow,
  updateRow,
  deleteRow,
  createField,
  updateField,
  deleteField,
  fillTableAIColumn,
  nextRowPosition,
  writableValues,
  changeLinks,
} from "@/services/tableService"
import { RelationCell } from "@/components/table/RelationCell"
import { FormulaEditor } from "@/components/table/FormulaEditor"
import {
  RelationSettings,
  RollupSettings,
  relationDraftOf,
  relationReady,
  rollupReady,
  type RelationDraft,
  type RollupDraft,
} from "@/components/table/LinkSettings"
import { showFormulaValue } from "@/lib/tables/formula"
import { nextCell, swallowsAtEdge, type CellKind } from "@/lib/tables/gridKeys"

interface DataTableGridProps {
  /** Where a new row goes, when rows are filtered out of this view: after every row. */
  nextPosition?: number
  tableId: string
  fields: TableField[]
  rows: TableRow[]
  canManage: boolean
  onChange: () => void // ask the parent to revalidate the bundle
}

const FIELD_TYPES: { value: FieldType; label: string }[] = [
  { value: "text", label: "Text" },
  { value: "number", label: "Number" },
  { value: "select", label: "Select" },
  { value: "multi_select", label: "Multi-select" },
  { value: "date", label: "Date" },
  { value: "checkbox", label: "Checkbox" },
  { value: "url", label: "URL" },
  { value: "email", label: "Email" },
  { value: "person", label: "Person" },
  { value: "relation", label: "Relation" },
  { value: "formula", label: "Formula" },
  { value: "rollup", label: "Rollup" },
]

/**
 * The glyph a column header shows for its type. A column header used to spell
 * its type out in small capitals ("COST NUMBER"), which put a second word in
 * shouting case on every column; the glyph carries the same information, and
 * the type is still named for assistive technology and on hover.
 */
const FIELD_GLYPH: Record<FieldType, React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>> = {
  text: Type,
  number: Hash,
  select: CircleDot,
  multi_select: Tag,
  date: CalendarDays,
  checkbox: CheckSquare,
  url: Link2,
  email: AtSign,
  person: User,
  relation: ArrowUpRight,
  formula: Sigma,
  rollup: Network,
}

const fieldTypeLabel = (type: FieldType) => FIELD_TYPES.find((t) => t.value === type)?.label ?? type

/** A number-like column reads right-aligned in tabular figures, so digits line up by place. */
const isNumeric = (f: TableField) => f.type === "number" || ((f.type === "formula" || f.type === "rollup") && computedOf(f).result === "number")

/**
 * A column's width, by what it holds. The grid lays out at fixed widths
 * (table-layout: fixed) so a column keeps its width as rows scroll in and out:
 * with only the rows on screen in the page, an automatic layout would resize
 * columns to whatever happened to be showing.
 */
export function columnWidth(f: TableField): number {
  switch (f.type) {
    case "checkbox":
      return 96
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
      return 200
    default:
      return 232
  }
}

/** A row's height: a 32px control, 2px of padding a side and its rule. */
export const GRID_ROW_HEIGHT = 37
const HEADER_HEIGHT = 41
/** Rows shown before the grid's frame has been measured. */
const FIRST_SCREEN_ROWS = 40
const ACTIONS_WIDTH = 48

function FieldTypeGlyph({ type }: { type: FieldType }) {
  const Glyph = FIELD_GLYPH[type] ?? Type
  return (
    <span title={fieldTypeLabel(type)} className="inline-flex shrink-0 text-muted-foreground">
      <Glyph className="h-3.5 w-3.5" aria-hidden />
      <span className="sr-only">{fieldTypeLabel(type)}</span>
    </span>
  )
}

const NO_ROLLUP: RollupDraft = { relation: "", field: "", aggregate: "" }

/** Whether a field's settings are complete enough to save. */
function settingsReady(type: FieldType, formula: string, relation: RelationDraft, rollup: RollupDraft): boolean {
  if (type === "formula") return !!formula.trim()
  if (type === "relation") return relationReady(relation)
  if (type === "rollup") return rollupReady(rollup)
  return true
}

// Local working copy of a row's values for snappy inline editing.
type RowValues = Record<string, unknown>

// aiPromptOf reads an AI column's prompt from a parsed field config
// ({"ai":{"prompt":"..."}}); returns "" when the column is not AI-driven.
function aiPromptOf(config: { [k: string]: unknown }): string {
  const ai = config?.ai as { prompt?: string } | undefined
  return (ai?.prompt || "").trim()
}

// aiAutoOf reads an AI column's continuous-autofill flag
// ({"ai":{"auto":true}}); when true the cell recomputes automatically as the
// row is created or edited, instead of only on a manual "Fill column" run.
function aiAutoOf(config: { [k: string]: unknown }): boolean {
  const ai = config?.ai as { auto?: boolean } | undefined
  return Boolean(ai?.auto)
}

/** How long the grid waits after an edit before asking for the table again. */
const REFRESH_AFTER_EDIT_MS = 600

/** The kind of control a cell is, for moving around from the keyboard. */
function cellKind(f: TableField): CellKind {
  switch (f.type) {
    case "formula":
    case "rollup":
      return "computed"
    case "checkbox":
      return "checkbox"
    case "select":
      return "select"
    case "multi_select":
    case "relation":
      return "button"
    case "number":
      return "number"
    case "date":
      return "date"
    default:
      return "text"
  }
}

export function DataTableGrid({ tableId, fields, rows, canManage, onChange, nextPosition }: DataTableGridProps) {
  const { toast } = useToast()
  const confirm = useConfirm()
  const [adding, setAdding] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  const [addingColumn, setAddingColumn] = React.useState(false)
  const [newColName, setNewColName] = React.useState("")
  const [newColType, setNewColType] = React.useState<FieldType>("text")
  const [newColFormula, setNewColFormula] = React.useState("")
  const [newColRelation, setNewColRelation] = React.useState<RelationDraft>(() => relationDraftOf())
  const [newColRollup, setNewColRollup] = React.useState<RollupDraft>(NO_ROLLUP)

  const sortedFields = React.useMemo(
    () => [...fields].sort((a, b) => a.position - b.position),
    [fields],
  )

  // What the callbacks below read, without being made again (and so without
  // rendering every row again) whenever the rows or fields change.
  const latest = React.useRef({ rows, fields, tableId, onChange })
  latest.current = { rows, fields, tableId, onChange }

  // After an edit the table is asked for again (a formula, a rollup or
  // another row may have changed with it), once a burst of edits settles.
  const refreshTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  const refreshSoon = React.useCallback(() => {
    if (refreshTimer.current) clearTimeout(refreshTimer.current)
    refreshTimer.current = setTimeout(() => latest.current.onChange(), REFRESH_AFTER_EDIT_MS)
  }, [])
  React.useEffect(() => () => {
    if (refreshTimer.current) clearTimeout(refreshTimer.current)
  }, [])

  // Edits saved but not yet in the rows the server last sent, by row. A row
  // is saved whole (updateRow takes every value), so a second edit made
  // before the table comes back must carry the first one with it, or it
  // would put the old value back.
  const pending = React.useRef(new Map<string, RowValues>())
  React.useEffect(() => {
    for (const [id, edits] of pending.current) {
      const r = rows.find((x) => x.id === id)
      if (!r) continue
      const now = parseRowValues(r)
      for (const k of Object.keys(edits)) if (JSON.stringify(now[k]) === JSON.stringify(edits[k])) delete edits[k]
      if (Object.keys(edits).length === 0) pending.current.delete(id)
    }
  }, [rows])

  // Commit a single cell edit. The cell already shows it; this saves it, and
  // a failed save asks for the table again, which resets the cell. Resolves
  // false when the save failed. Takes the row it was rendered with, so an
  // edit still saves when its row has left the page (scrolled out, or
  // filtered out by the edit itself).
  const commitCell = React.useCallback(async (row: TableRow, fieldId: string, value: unknown): Promise<boolean> => {
    const { fields, tableId } = latest.current
    const edits = pending.current.get(row.id) ?? {}
    const current = { ...parseRowValues(row), ...edits }
    if (JSON.stringify(current[fieldId]) === JSON.stringify(value)) return true
    pending.current.set(row.id, { ...edits, [fieldId]: value })
    const next: RowValues = writableValues(fields, { ...current, [fieldId]: value })
    try {
      await updateRow(tableId, row.id, next, row.position)
      refreshSoon()
      return true
    } catch {
      const mine = pending.current.get(row.id)
      if (mine) delete mine[fieldId]
      // interceptor surfaces the error; revalidate to reset the cell
      latest.current.onChange()
      return false
    }
  }, [refreshSoon])

  // Link a row to rows of the table a field links to, or unlink it.
  const linkCell = React.useCallback(async (rowId: string, fieldId: string, change: { add?: string[]; remove?: string[] }) => {
    try {
      await changeLinks(latest.current.tableId, rowId, fieldId, change)
    } catch {
      // surfaced by the interceptor
    } finally {
      latest.current.onChange()
    }
  }, [])

  const handleAddRow = async () => {
    setAdding(true)
    try {
      const pos = nextPosition ?? nextRowPosition(rows)
      await createRow(tableId, {}, pos)
      onChange()
    } catch {
      // surfaced by interceptor
    } finally {
      setAdding(false)
    }
  }

  const handleDeleteRow = React.useCallback(async (rowId: string) => {
    setBusy(true)
    try {
      await deleteRow(latest.current.tableId, rowId)
      latest.current.onChange()
    } catch {
      // surfaced
    } finally {
      setBusy(false)
    }
  }, [])

  const handleAddColumn = async () => {
    const name = newColName.trim()
    if (!name) return
    setBusy(true)
    try {
      const pos = sortedFields.length ? Math.max(...sortedFields.map((f) => f.position)) + 1 : 0
      await createField(tableId, {
        name,
        type: newColType,
        position: pos,
        config:
          newColType === "formula"
            ? { formula: newColFormula }
            : newColType === "relation"
              ? { ...newColRelation }
              : newColType === "rollup"
                ? { ...newColRollup }
                : undefined,
      })
      setNewColName("")
      setNewColType("text")
      setNewColFormula("")
      setNewColRelation(relationDraftOf())
      setNewColRollup(NO_ROLLUP)
      setAddingColumn(false)
      onChange()
      toast({ title: "Column added" })
    } catch {
      // surfaced
    } finally {
      setBusy(false)
    }
  }

  const saveColumn = async (
    field: TableField,
    input: { name: string; type: FieldType; config?: Record<string, unknown> },
  ) => {
    try {
      await updateField(tableId, field.id, {
        name: input.name,
        type: input.type,
        config: input.config,
        position: field.position,
      })
      onChange()
      toast({ title: "Column updated" })
    } catch {
      onChange()
    }
  }

  const deleteColumn = async (field: TableField) => {
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

  // Only the rows in view (and a screenful either side) are in the page. A
  // thousand rows of nine editable cells was 35,000 elements and 7,000 inputs:
  // scrolling dropped to 36 frames a second and a keystroke in a cell took
  // 43 ms, all of it the browser reworking a page that size.
  const scrollRef = React.useRef<HTMLDivElement>(null)
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => GRID_ROW_HEIGHT,
    overscan: 12,
    scrollPaddingStart: HEADER_HEIGHT,
    initialRect: { width: 1024, height: 640 },
    getItemKey: (i) => rows[i]?.id ?? i,
  })
  // Until the frame has a size (the first paint, or a test without layout)
  // the virtualizer shows nothing; the first screenful stands in, so the
  // grid never paints empty.
  const measured = virtualizer.getVirtualItems()
  const items =
    measured.length || !rows.length
      ? measured
      : Array.from({ length: Math.min(rows.length, FIRST_SCREEN_ROWS) }, (_, index) => ({
          index,
          start: index * GRID_ROW_HEIGHT,
          end: (index + 1) * GRID_ROW_HEIGHT,
        }))
  const padTop = items.length ? items[0].start : 0
  const padBottom = items.length ? virtualizer.getTotalSize() - items[items.length - 1].end : 0
  const colCount = sortedFields.length + (canManage ? 1 : 0)
  const tableWidth = sortedFields.reduce((w, f) => w + columnWidth(f), 0) + (canManage ? ACTIONS_WIDTH : 0)

  // Keyboard: arrows, Enter and Shift+Enter move between cells (lib/tables/
  // gridKeys). A row out of view is scrolled in first, then focused.
  const focusCell = React.useCallback(
    (row: number, col: number) => {
      const root = scrollRef.current
      if (!root) return
      const place = () => {
        const el = root.querySelector<HTMLElement>(`[data-cell="${row}:${col}"]`)
        if (!el) return false
        el.focus()
        if (el instanceof HTMLInputElement && el.type !== "checkbox" && el.type !== "date") el.select()
        return true
      }
      if (place()) return
      virtualizer.scrollToIndex(row, { align: "auto" })
      requestAnimationFrame(() => {
        if (!place()) requestAnimationFrame(() => void place())
      })
    },
    [virtualizer],
  )

  const onGridKey = React.useCallback(
    (e: React.KeyboardEvent<HTMLTableElement>) => {
      const target = e.target as HTMLElement
      const at = target.closest<HTMLElement>("[data-cell]")?.dataset.cell
      if (!at || e.nativeEvent.isComposing) return
      const [row, col] = at.split(":").map(Number)
      const kind = (target.closest<HTMLElement>("[data-kind]")?.dataset.kind ?? "text") as CellKind
      let atStart = true
      let atEnd = true
      if (target instanceof HTMLInputElement && (kind === "text" || kind === "number")) {
        const s = target.selectionStart ?? 0
        const end = target.selectionEnd ?? 0
        atStart = s === 0 && end === 0
        atEnd = s === target.value.length && end === target.value.length
      }
      const to = nextCell(e, { row, col }, { rows: latest.current.rows.length, cols: sortedFields.length }, { kind, atStart, atEnd })
      if (to) {
        e.preventDefault()
        e.stopPropagation()
        focusCell(to.row, to.col)
      } else if (swallowsAtEdge(e, kind)) {
        e.preventDefault()
        e.stopPropagation()
      }
    },
    [focusCell, sortedFields.length],
  )

  return (
    <div>
    {/* The grid scrolls inside its own frame so the header row can stay in
        view: a sticky header needs its scroll container to be the one that
        scrolls, and an overflow-x wrapper on its own pins it to nothing.
        scroll-pt keeps a cell focused from the keyboard out from under it. */}
    <div ref={scrollRef} className="max-h-[calc(100dvh-16rem)] min-h-[8rem] overflow-auto overscroll-contain scroll-pt-10">
      <table
        className="w-full table-fixed border-separate border-spacing-0 text-sm"
        style={{ minWidth: tableWidth }}
        aria-rowcount={rows.length + 1}
        onKeyDownCapture={onGridKey}
      >
        <colgroup>
          {sortedFields.map((f) => (
            <col key={f.id} style={{ width: columnWidth(f) }} />
          ))}
          {canManage && <col style={{ width: ACTIONS_WIDTH }} />}
        </colgroup>
        <thead className="sticky top-0 z-[1] bg-background">
          <tr>
            {sortedFields.map((f) => (
              <ColumnHeader
                key={f.id}
                field={f}
                fields={sortedFields}
                tableId={tableId}
                canManage={canManage}
                onSave={(input) => saveColumn(f, input)}
                onDelete={() => deleteColumn(f)}
                onFilled={onChange}
              />
            ))}
            {canManage && (
              <th className="border-b border-border/60 px-2 py-1">
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Add a column"
                  className="h-7 w-7"
                  onClick={() => setAddingColumn((v) => !v)}
                  title="Add column"
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </th>
            )}
          </tr>
        </thead>
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
                fields={sortedFields}
                canManage={canManage}
                busy={busy}
                measure={virtualizer.measureElement}
                onCommit={commitCell}
                onLink={linkCell}
                onDelete={handleDeleteRow}
              />
            )
          })}
          {padBottom > 0 && (
            <tr aria-hidden="true">
              <td colSpan={colCount} style={{ height: padBottom, padding: 0, border: 0 }} />
            </tr>
          )}
        </tbody>
      </table>
    </div>

      {addingColumn && canManage && (
        <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg border bg-muted/30 p-2">
          <Input
            value={newColName}
            onChange={(e) => setNewColName(e.target.value)}
            placeholder="Column name"
            aria-label="Column name"
            className="h-8 w-48"
            onKeyDown={(e) => e.key === "Enter" && handleAddColumn()}
          />
          <select
            value={newColType}
            onChange={(e) => setNewColType(e.target.value as FieldType)}
            aria-label="Column type"
            className="h-8 rounded-md border border-border bg-background px-2 text-sm"
          >
            {FIELD_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
          <Button
            size="sm"
            onClick={handleAddColumn}
            disabled={busy || !newColName.trim() || !settingsReady(newColType, newColFormula, newColRelation, newColRollup)}
            className="gap-1.5"
          >
            <Check className="h-3.5 w-3.5" /> Add
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setAddingColumn(false)}>
            Cancel
          </Button>
          {newColType === "formula" && (
            <div className="w-full max-w-md">
              <FormulaEditor tableId={tableId} fields={sortedFields} value={newColFormula} onChange={setNewColFormula} />
            </div>
          )}
          {newColType === "relation" && (
            <div className="w-full max-w-xs">
              <RelationSettings tableId={tableId} draft={newColRelation} onChange={setNewColRelation} />
            </div>
          )}
          {newColType === "rollup" && (
            <div className="w-full max-w-xs">
              <RollupSettings fields={sortedFields} draft={newColRollup} onChange={setNewColRollup} />
            </div>
          )}
        </div>
      )}

      <button
        type="button"
        onClick={handleAddRow}
        disabled={adding}
        className="flex w-full items-center gap-1.5 px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-highlight/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/50"
      >
        <Plus className="h-4 w-4" aria-hidden="true" /> New row
      </button>
    </div>
  )
}

/**
 * One row of the grid. Memoised on the row's id and values, so asking for the
 * table again after an edit renders only the rows whose values changed.
 */
const GridRow = React.memo(
  function GridRow({
    row,
    rowIndex,
    fields,
    canManage,
    busy,
    measure,
    onCommit,
    onLink,
    onDelete,
  }: {
    row: TableRow
    rowIndex: number
    fields: TableField[]
    canManage: boolean
    busy: boolean
    measure: (el: Element | null) => void
    onCommit: (row: TableRow, fieldId: string, value: unknown) => Promise<boolean>
    onLink: (rowId: string, fieldId: string, change: { add?: string[]; remove?: string[] }) => void
    onDelete: (rowId: string) => void
  }) {
    const values = React.useMemo(() => parseRowValues(row), [row])
    return (
      <tr ref={measure} data-index={rowIndex} aria-rowindex={rowIndex + 2} className="group hover:bg-highlight/50 focus-within:bg-highlight/60">
        {fields.map((f, col) => (
          <td
            key={f.id}
            data-kind={cellKind(f)}
            className={cn("overflow-hidden border-b border-r border-border/40 px-1 py-0.5 align-middle", isNumeric(f) && "text-right")}
          >
            <Cell
              field={f}
              value={values[f.id]}
              cellId={`${rowIndex}:${col}`}
              onCommit={(v) => onCommit(row, f.id, v)}
              onLink={(change) => onLink(row.id, f.id, change)}
            />
          </td>
        ))}
        {canManage && (
          <td className="border-b border-border/40 px-2 py-0.5 text-right">
            <Button
              variant="ghost"
              size="icon"
              aria-label="Delete this row"
              className="h-7 w-7 text-danger-ink opacity-0 pointer-events-none transition-opacity group-hover:opacity-100 group-hover:pointer-events-auto focus-visible:opacity-100 focus-visible:pointer-events-auto"
              disabled={busy}
              onClick={() => onDelete(row.id)}
              title="Delete row"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </td>
        )}
      </tr>
    )
  },
  (a, b) =>
    a.row.id === b.row.id &&
    a.row.values === b.row.values &&
    a.rowIndex === b.rowIndex &&
    a.fields === b.fields &&
    a.canManage === b.canManage &&
    a.busy === b.busy &&
    a.measure === b.measure &&
    a.onCommit === b.onCommit &&
    a.onLink === b.onLink &&
    a.onDelete === b.onDelete,
)

// ColumnHeader renders a column title; for managers it opens a dropdown to
// rename, change type, manage select options, and delete the column.
function ColumnHeader({
  field,
  fields,
  tableId,
  canManage,
  onSave,
  onDelete,
  onFilled,
}: {
  field: TableField
  /** The table's fields, for a formula to use. */
  fields: TableField[]
  tableId: string
  canManage: boolean
  onSave: (input: { name: string; type: FieldType; config?: Record<string, unknown> }) => void
  onDelete: () => void
  onFilled: () => void
}) {
  const { toast } = useToast()
  const [open, setOpen] = React.useState(false)
  const [name, setName] = React.useState(field.name)
  const [type, setType] = React.useState<FieldType>(field.type)
  const [options, setOptions] = React.useState<SelectOption[]>(
    () => parseFieldConfig(field).options || [],
  )
  const [newOption, setNewOption] = React.useState("")
  const [relation, setRelation] = React.useState<RelationDraft>(() => relationDraftOf(field))
  const [rollup, setRollup] = React.useState<RollupDraft>(() => {
    const r = rollupOf(field)
    return { relation: r.relation, field: r.field, aggregate: r.aggregate }
  })
  const [formula, setFormula] = React.useState<string>(() => formulaOf(field).formula)
  const [aiPrompt, setAiPrompt] = React.useState<string>(() => aiPromptOf(parseFieldConfig(field)))
  const [aiAuto, setAiAuto] = React.useState<boolean>(() => aiAutoOf(parseFieldConfig(field)))
  const [filling, setFilling] = React.useState(false)

  React.useEffect(() => {
    if (open) {
      setName(field.name)
      setType(field.type)
      setOptions(parseFieldConfig(field).options || [])
      setRelation(relationDraftOf(field))
      const r = rollupOf(field)
      setRollup({ relation: r.relation, field: r.field, aggregate: r.aggregate })
      setFormula(formulaOf(field).formula)
      setAiPrompt(aiPromptOf(parseFieldConfig(field)))
      setAiAuto(aiAutoOf(parseFieldConfig(field)))
      setNewOption("")
    }
  }, [open, field])

  const isSelect = type === "select" || type === "multi_select"
  const isRelation = type === "relation"
  const isFormula = type === "formula"
  const isRollup = type === "rollup"
  // AI columns are plain content columns (text/number/url/email) driven by a
  // prompt. Select/relation columns have their own structured config instead,
  // and a formula or a rollup works its cells out itself.
  const aiEligible = !isSelect && !isRelation && !isFormula && !isRollup
  const problem = fieldProblem(field)
  const ready = settingsReady(type, formula, relation, rollup)
  const savedAiPrompt = aiPromptOf(parseFieldConfig(field))

  const save = () => {
    const trimmed = name.trim()
    if (!trimmed) return
    if (!ready) return
    const config: Record<string, unknown> = isSelect
      ? { options }
      : isRelation
        ? { ...relation }
        : isFormula
          ? { formula }
          : isRollup
            ? { ...rollup }
            : {}
    if (aiEligible && aiPrompt.trim()) {
      config.ai = { prompt: aiPrompt.trim(), auto: aiAuto }
    }
    onSave({ name: trimmed, type, config })
    setOpen(false)
  }

  const handleFill = async () => {
    setFilling(true)
    try {
      const res = await fillTableAIColumn(tableId, field.id)
      toast({
        title: "AI fill complete",
        description: `Filled ${res.filled} ${res.filled === 1 ? "row" : "rows"}${
          res.skipped ? `, skipped ${res.skipped}` : ""
        }.`,
      })
      onFilled()
    } catch {
      // surfaced by interceptor
    } finally {
      setFilling(false)
    }
  }

  const addOption = () => {
    const label = newOption.trim()
    if (!label || options.some((o) => o.label === label)) return
    setOptions((prev) => [...prev, { label }])
    setNewOption("")
  }

  if (!canManage) {
    return (
      <th scope="col" className={cn("border-b border-r border-border/60 px-3 py-2 font-medium text-muted-foreground", isNumeric(field) ? "text-right" : "text-left")}>
        <span className={cn("inline-flex max-w-full items-center gap-1.5", isNumeric(field) && "flex-row-reverse")}>
          <FieldTypeGlyph type={field.type} />
          <span className="truncate">{field.name}</span>
          {savedAiPrompt && <Sparkles className="h-3 w-3 shrink-0 text-muted-foreground" aria-label="Filled by AI" />}
          {problem && <AlertTriangle className="h-3 w-3 shrink-0 text-danger-ink" aria-label={problem} />}
        </span>
      </th>
    )
  }

  return (
    <th scope="col" className="border-b border-r border-border/60 px-1 py-1 text-left font-medium text-muted-foreground">
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger asChild>
          <button
            className={cn(
              "group/col flex w-full items-center gap-1.5 rounded-md px-2 py-1 transition-colors hover:bg-muted/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
              isNumeric(field) && "flex-row-reverse",
            )}
            aria-label={`${field.name}, ${fieldTypeLabel(field.type)} column. Edit column`}
          >
            <FieldTypeGlyph type={field.type} />
            <span className="truncate">{field.name}</span>
            {savedAiPrompt && <Sparkles className="h-3 w-3 shrink-0 text-muted-foreground" aria-label="Filled by AI" />}
            {problem && <AlertTriangle className="h-3 w-3 shrink-0 text-danger-ink" aria-label={problem} />}
            <ChevronDown className={cn("h-3.5 w-3.5 shrink-0 opacity-0 transition-opacity group-hover/col:opacity-60 group-focus-visible/col:opacity-60", isNumeric(field) ? "mr-auto" : "ml-auto")} aria-hidden />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className={cn(isFormula || isRollup || isRelation ? "w-80" : "w-64", "p-3")} onCloseAutoFocus={(e) => e.preventDefault()}>
          <div className="space-y-2">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Name</label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="h-8"
                onKeyDown={(e) => e.key === "Enter" && save()}
                autoFocus
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Type</label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value as FieldType)}
                className="h-8 w-full rounded-md border border-border bg-background px-2 text-sm"
              >
                {FIELD_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>

            {isSelect && (
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Options</label>
                <div className="space-y-1">
                  {options.map((o, i) => (
                    <div key={o.label} className="flex items-center justify-between rounded-md bg-muted/40 px-2 py-1 text-sm">
                      <span className="truncate">{o.label}</span>
                      <button
 aria-label="Remove option"                        className="text-danger-ink opacity-70 hover:opacity-100"
                        onClick={() => setOptions((prev) => prev.filter((_, j) => j !== i))}
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
                <div className="flex items-center gap-1">
                  <Input
                    value={newOption}
                    onChange={(e) => setNewOption(e.target.value)}
                    placeholder="Add option"
                    className="h-7 text-sm"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault()
                        addOption()
                      }
                    }}
                  />
                  <Button aria-label="Add option" size="icon" variant="ghost" className="h-7 w-7" onClick={addOption}>
                    <Plus className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            )}

            {isFormula && (
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Formula</label>
                <FormulaEditor tableId={tableId} fields={fields} fieldId={field.id} value={formula} onChange={setFormula} />
              </div>
            )}

            {isRelation && <RelationSettings tableId={tableId} field={field.type === "relation" ? field : undefined} draft={relation} onChange={setRelation} />}

            {isRollup && <RollupSettings fields={fields.filter((f) => f.id !== field.id)} draft={rollup} onChange={setRollup} />}

            {problem && (
              <p className="flex items-start gap-1 text-2xs leading-snug text-danger-ink">
                <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                {problem}
              </p>
            )}

            {aiEligible && (
              <div className="space-y-1 rounded-md border border-border bg-muted/40 p-2">
                <label className="flex items-center gap-1 text-xs font-medium text-foreground">
                  <Sparkles className="h-3 w-3" /> AI autofill
                </label>
                <textarea
                  value={aiPrompt}
                  onChange={(e) => setAiPrompt(e.target.value)}
                  placeholder="Describe what to put in this cell, e.g. 'Summarize the row in one line'"
                  rows={3}
                  aria-label="What AI should put in each cell"
                  className="w-full resize-none rounded-md border border-input bg-background px-2 py-1 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                />
                <p className="text-2xs leading-tight text-muted-foreground">
                  Each cell is generated from this column&apos;s prompt and the row&apos;s other
                  values. Save first, then fill.
                </p>
                <label className="flex cursor-pointer items-start gap-2 rounded-md px-1 py-1 text-2xs leading-tight text-muted-foreground hover:bg-highlight">
                  <input
                    type="checkbox"
                    checked={aiAuto}
                    onChange={(e) => setAiAuto(e.target.checked)}
                    className="mt-0.5 h-3.5 w-3.5 accent-[var(--primary)]"
                  />
                  <span>
                    <span className="font-medium text-foreground">Autofill on change</span>
                    {": recompute each cell automatically when a row is added or edited."}
                  </span>
                </label>
                {savedAiPrompt && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full gap-1.5"
                    disabled={filling}
                    onClick={handleFill}
                  >
                    {filling ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Sparkles className="h-3.5 w-3.5" />
                    )}
                    {filling ? "Filling…" : "Fill column with AI"}
                  </Button>
                )}
              </div>
            )}

            <div className="flex items-center justify-between pt-1">
              <Button size="sm" variant="ghost" className="text-danger-ink" onClick={onDelete}>
                <Trash2 className="h-3.5 w-3.5 mr-1" /> Delete
              </Button>
              <Button size="sm" onClick={save} disabled={!name.trim() || !ready}>
                <Check className="h-3.5 w-3.5 mr-1" /> Save
              </Button>
            </div>
          </div>
        </DropdownMenuContent>
      </DropdownMenu>
    </th>
  )
}


/**
 * What a cell shows: its saved value, or what was just chosen while that is
 * saved. A checkbox or a select used to wait for the save and then for the
 * whole table to come back before it moved (two round trips, about 870 ms on
 * the demo); now it moves when it is clicked. A failed save puts it back.
 */
function useShownValue<T>(value: T): [T, (next: T, commit: (v: T) => Promise<boolean>) => void] {
  const [shown, setShown] = React.useState(value)
  const saved = React.useRef(value)
  React.useEffect(() => {
    saved.current = value
    setShown(value)
  }, [value])
  const change = React.useCallback((next: T, commit: (v: T) => Promise<boolean>) => {
    setShown(next)
    void commit(next).then((ok) => {
      if (!ok) setShown(saved.current)
    })
  }, [])
  return [shown, change]
}

// Cell renders the right editor for a field type. Edits commit on blur / change.
function Cell({
  field,
  value,
  cellId,
  onCommit,
  onLink,
}: {
  field: TableField
  value: unknown
  /** "row:col", for moving between cells from the keyboard. */
  cellId: string
  onCommit: (value: unknown) => Promise<boolean>
  /** Links or unlinks rows of the table a relation links to. */
  onLink: (change: { add?: string[]; remove?: string[] }) => void
}) {
  if (field.type === "formula" || field.type === "rollup") {
    return <ComputedCell field={field} value={value} cellId={cellId} />
  }

  if (field.type === "checkbox") {
    return <CheckboxCell label={field.name} value={!!value} cellId={cellId} onCommit={onCommit} />
  }

  if (field.type === "select") {
    return <SelectCell field={field} value={(value as string) || ""} cellId={cellId} onCommit={onCommit} />
  }

  if (field.type === "multi_select") {
    return <MultiSelectCell field={field} value={value} cellId={cellId} onCommit={onCommit} />
  }

  if (field.type === "relation") {
    const { target, tableId, tableName } = relationOf(field)
    const linksTable = target === "table"
    return (
      <div data-cell={cellId} tabIndex={-1} className="outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/50">
        <RelationCell
          value={value}
          target={target}
          tableId={tableId}
          // A table the reader can't open comes without its name: its links show, but stay as they are.
          readOnly={linksTable && !tableName}
          onLink={linksTable ? onLink : undefined}
          onCommit={(refs: RelationRef[]) => void onCommit(refs)}
        />
      </div>
    )
  }

  const inputType =
    field.type === "number"
      ? "number"
      : field.type === "date"
        ? "date"
        : field.type === "email"
          ? "email"
          : field.type === "url"
            ? "url"
            : "text"

  return <TextCell type={inputType} label={field.name} value={value} cellId={cellId} onCommit={onCommit} />
}

function CheckboxCell({ label, value, cellId, onCommit }: { label: string; value: boolean; cellId: string; onCommit: (v: unknown) => Promise<boolean> }) {
  const [shown, change] = useShownValue(value)
  // The springy check (the playful layer): only when someone ticks it, never
  // for a box that was already ticked when the table opened.
  const [pop, setPop] = React.useState(false)
  return (
    <div className="flex justify-center py-1">
      <input
        type="checkbox"
        data-cell={cellId}
        checked={shown}
        onChange={(e) => {
          if (e.target.checked) setPop(true)
          change(e.target.checked, onCommit)
        }}
        onAnimationEnd={() => setPop(false)}
        aria-label={label}
        className={cn("h-4 w-4 rounded-sm border-border accent-[var(--primary)]", pop && "animate-spring")}
      />
    </div>
  )
}

function SelectCell({ field, value, cellId, onCommit }: { field: TableField; value: string; cellId: string; onCommit: (v: unknown) => Promise<boolean> }) {
  const options = parseFieldConfig(field).options || []
  const [shown, change] = useShownValue(value)
  return (
    <select
      data-cell={cellId}
      value={shown}
      onChange={(e) => change(e.target.value, onCommit)}
      aria-label={field.name}
      className="h-8 w-full cursor-pointer appearance-none truncate bg-transparent px-2 text-sm outline-none focus-visible:bg-background focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/50"
    >
      <option value=""></option>
      {options.map((o) => (
        <option key={o.label} value={o.label}>
          {o.label}
        </option>
      ))}
    </select>
  )
}

function MultiSelectCell({ field, value, cellId, onCommit }: { field: TableField; value: unknown; cellId: string; onCommit: (v: unknown) => Promise<boolean> }) {
  const options = parseFieldConfig(field).options || []
  const saved = React.useMemo(() => (Array.isArray(value) ? (value as string[]) : []), [value])
  const [selected, change] = useShownValue(saved)
  const toggle = (label: string) => {
    const next = selected.includes(label) ? selected.filter((s) => s !== label) : [...selected, label]
    change(next, onCommit)
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          data-cell={cellId}
          aria-label={`${field.name}: ${selected.length ? selected.join(", ") : "none chosen"}`}
          className="flex min-h-8 w-full flex-wrap items-center gap-1 px-2 py-1 text-left text-sm outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/50"
        >
          {selected.length === 0 ? null : (
            selected.map((s) => (
              <span key={s} className="rounded-sm bg-muted px-1.5 py-0.5 text-xs">
                {s}
              </span>
            ))
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-48 p-1">
        {options.length === 0 ? (
          <p className="px-2 py-1.5 text-xs text-muted-foreground">No options. Add some in the column menu.</p>
        ) : (
          options.map((o) => (
            <button
              key={o.label}
              onClick={() => toggle(o.label)}
              className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-highlight"
            >
              <input type="checkbox" readOnly checked={selected.includes(o.label)} className="h-3.5 w-3.5" tabIndex={-1} aria-hidden="true" />
              {o.label}
            </button>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

// TextCell is an uncontrolled-on-edit input that commits on blur / Enter,
// keeping typing snappy without a round trip per keystroke. Escape puts back
// what was saved; scrolling the row out of the page commits what was typed.
function TextCell({
  type,
  label,
  value,
  cellId,
  onCommit,
}: {
  type: string
  label: string
  value: unknown
  cellId: string
  onCommit: (value: unknown) => Promise<boolean>
}) {
  const savedText = value == null ? "" : String(value)
  const [local, setLocal] = React.useState<string>(savedText)
  React.useEffect(() => {
    setLocal(savedText)
  }, [savedText])

  const parse = React.useCallback(
    (text: string): unknown => {
      if (type !== "number") return text
      const n = text.trim() === "" ? "" : Number(text)
      return n === "" || Number.isNaN(n) ? "" : n
    },
    [type],
  )

  // The latest typing, for a commit when the row leaves the page while its
  // cell still has the focus: removing a focused element does not blur it.
  const pending = React.useRef<{ text: string; saved: string; commit: () => void } | null>(null)
  pending.current = { text: local, saved: savedText, commit: () => void onCommit(parse(local)) }
  React.useEffect(
    () => () => {
      const p = pending.current
      if (p && p.text !== p.saved) p.commit()
    },
    [],
  )

  const commit = () => {
    if (local === savedText) return
    void onCommit(parse(local))
  }

  // Numbers are typed as text, in a decimal keypad on a phone: a number input
  // has no caret position to read (so the grid could not tell when Left and
  // Right should leave the cell) and changed its value on Up and Down.
  const isNumber = type === "number"
  return (
    <input
      type={isNumber ? "text" : type}
      inputMode={isNumber ? "decimal" : undefined}
      data-cell={cellId}
      value={local}
      onChange={(e) => setLocal(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Escape" && local !== savedText) {
          e.preventDefault()
          e.stopPropagation()
          setLocal(savedText)
        }
      }}
      aria-label={label}
      autoComplete="off"
      spellCheck={type === "text" ? undefined : false}
      className={cn(
        "h-8 w-full bg-transparent px-2 text-sm outline-none focus:bg-background focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/50",
        isNumber && "text-right tabular-nums",
        // A date picker's calendar glyph on every row is noise: it shows on the
        // row under the pointer and on the focused cell.
        type === "date" && "tabular-nums [&::-webkit-calendar-picker-indicator]:opacity-0 group-hover:[&::-webkit-calendar-picker-indicator]:opacity-50 focus:[&::-webkit-calendar-picker-indicator]:opacity-50",
      )}
    />
  )
}


// ComputedCell shows what a formula or a rollup gives for the row, as the
// server worked it out. It can't be edited: change the field instead. It can
// be reached from the keyboard, so moving along a row does not skip it.
function ComputedCell({ field, value, cellId }: { field: TableField; value: unknown; cellId: string }) {
  const shown = showFormulaValue(value, computedOf(field).result)
  const reach = { "data-cell": cellId, tabIndex: -1 } as const
  const ring = "outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/50"
  switch (shown.kind) {
    case "blank":
      return <div {...reach} className={cn("h-8", ring)} />
    case "error":
      return (
        <div {...reach} className={cn("flex h-8 items-center px-2 text-xs text-danger-ink", ring)} title={shown.message}>
          <AlertTriangle className="mr-1 h-3 w-3 shrink-0" />
          <span className="truncate">{shown.message}</span>
        </div>
      )
    case "checkbox":
      return (
        <div {...reach} className={cn("flex h-8 items-center justify-center", ring)} aria-label={shown.checked ? "Yes" : "No"}>
          {shown.checked && <Check className="h-4 w-4 text-foreground" />}
        </div>
      )
    case "number":
      return <div {...reach} className={cn("flex h-8 items-center justify-end px-2 text-sm tabular-nums", ring)}>{shown.text}</div>
    default:
      return (
        <div {...reach} className={cn("flex h-8 items-center px-2 text-sm", ring)} title={shown.text}>
          <span className="truncate">{shown.text}</span>
        </div>
      )
  }
}
