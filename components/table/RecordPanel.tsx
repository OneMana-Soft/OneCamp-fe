"use client"

import * as React from "react"
import "./table.css"
import { Button } from "@/components/ui/button"
import { ChevronDown, ChevronUp, Link2, Loader2, Maximize2, MessageSquare, Minimize2, Trash2, X } from "@/lib/icons"
import dynamic from "next/dynamic"
import { useCopyToClipboard } from "@/hooks/useCopyToClipboard"
import { tablePath } from "@/lib/tables/route"
import { cn } from "@/lib/utils/helpers/cn"
import { Spark } from "@/components/ui/graphics"
import { useConfirm } from "@/hooks/useConfirm"
import { onEscape } from "@/lib/keys/onEscape"
import { fillTableAIColumn, parseFieldConfig, type TableField, type TableRow } from "@/services/tableService"
import { batchRows, undoChange } from "@/lib/tables/ledger"
import { useUndoToast } from "@/components/table/ledger/useUndoToast"
import { RowHistory } from "@/components/table/history/RowHistory"
import { Cell, lineBreakKey } from "@/components/table/gridCells"
import { optionIndexOf, type CellContext } from "@/components/table/cellFaces"
import { useGrowWithText } from "@/components/ui/textarea"
import { fieldKind } from "@/lib/fieldTypes/registry"
import { fieldKeyDown } from "@/lib/keys/ime"
import { fieldOrder } from "@/lib/tables/fieldOrder"
import { formatLocale } from "@/lib/tables/numberFormat"
import { placeOfRow, rowAtPlace } from "@/lib/tables/viewPlaces"
import { tintedFields } from "@/components/table/optionChip"
import { aiPromptOf } from "@/components/table/ColumnMenu"
import { TableGlyph } from "@/components/table/TableGlyph"
import { shownValues, type CellCommit } from "@/lib/tables/useCellCommit"
import { relativeTime } from "@/lib/utils/relativeTime"
import { ix } from "@/lib/ui/interactive"
import { useAIAvailable } from "@/hooks/useClientConfig"
import { useToast } from "@/hooks/use-toast"
import { useRecordAsPage } from "@/components/table/rowPage/recordWidth"

// A row's comments are a chunk of their own: the editor and the thread cards
// load when a record opens, never with the grid. So is its page (T2), whose
// editor is a chunk of its own again, loaded only for a row with a page.
const RowComments = dynamic(() => import("@/components/table/comments/RowComments"), { loading: () => null })
const RowPage = dynamic(() => import("@/components/table/rowPage/RowPage"), { loading: () => null })

/**
 * Under an AI column's value [AI]: whether a person wrote it, which the AI
 * then leaves be, and "Fill again", which asks the AI for this row's cell
 * whoever wrote it (TAB-BUG-4), where AI is on: with it off (or on the
 * edition without it) the button could only fail.
 */
function AiCellNote({ tableId, field, row, onFilled }: { tableId: string; field: TableField; row: TableRow; onFilled: () => void }) {
  const ai = useAIAvailable()
  const { toast } = useToast()
  const [filling, setFilling] = React.useState(false)
  const kept = !!row.ai_kept?.includes(field.id)
  const fill = async () => {
    setFilling(true)
    try {
      // The model failing is an answer that filled nothing, not an error.
      const res = await fillTableAIColumn(tableId, field.id, [row.id])
      if (!res?.filled) toast({ title: "Couldn't fill this cell", description: "Try again in a moment.", variant: "destructive" })
    } catch {
      // surfaced by the interceptor
    } finally {
      setFilling(false)
      onFilled()
    }
  }
  // This edition has no AI, so it says nothing about AI under a cell, even one
  // an AI edition once filled and a person then wrote over.
  if (!ai) return null
  // A second dd under the value: a dt may have several.
  return (
    <dd className="col-start-2 -mt-0.5 flex items-center gap-2 pb-1 text-meta text-ink-3 max-sm:col-start-1" data-ai-cell-note="">
      {kept ? <span>Written by a person, so AI leaves it be</span> : null}
      {ai ? (
        <button type="button" onClick={() => void fill()} disabled={filling} className="inline-flex items-center gap-1 rounded-sm font-medium text-agent-ink hover:underline disabled:opacity-60">
          {filling ? <Loader2 className="size-3 animate-spin" aria-hidden="true" /> : <Spark size={12} className="text-agent" />}
          {filling ? "Filling…" : "Fill again"}
        </button>
      ) : null}
    </dd>
  )
}

/**
 * A row opened as a record (content.md T15): a panel at the right, 480 px on
 * the sheet with e3, the primary field as its title and every other field as
 * a label-and-value line, each value the same editor the grid uses and saved
 * through the same path (useCellCommit). J and K (or the arrows in its header)
 * step through the rows the view shows; Escape closes it.
 */
export function RecordPanel({
  tableId,
  tableName,
  fields,
  rows,
  count,
  tail = 0,
  alone = false,
  onReach,
  rowId,
  canManage,
  commit,
  onStep,
  onClose,
  onChange,
  focusThread,
}: {
  tableId: string
  tableName: string
  fields: TableField[]
  /** The rows the view shows, in its order: in a view read in windows, its rows read, then its last `tail`, added here. */
  rows: TableRow[]
  /** How many rows the view has, read or not (lib/tables/viewPlaces): rows' own length unless it reads in windows. */
  count?: number
  tail?: number
  /** A row the view hasn't reached (the address named it): opened by itself, with no place and no steps. */
  alone?: boolean
  /** The record stepped to a place: the view reads on to the place after it. */
  onReach?: (place: number) => void
  rowId: string
  canManage: boolean
  commit: CellCommit
  onStep: (rowId: string) => void
  onClose: () => void
  onChange: () => void
  /** A thread on the row a link named, which its comments open at. */
  focusThread?: string | null
}) {
  const confirm = useConfirm()
  const offerUndo = useUndoToast(onChange)
  const sorted = React.useMemo(() => fieldOrder(fields), [fields])
  const index = rows.findIndex((r) => r.id === rowId)
  const row = index >= 0 ? rows[index] : undefined
  // Its place in the view, and the row a step away, read or not (viewPlaces).
  const of = count ?? rows.length
  const place = index >= 0 && !alone ? placeOfRow(index, rows.length, of, tail) : -1
  const stepTo = React.useCallback(
    (by: number): TableRow | undefined => {
      if (place < 0) return undefined
      const at = rowAtPlace(place + by, rows.length, of, tail)
      return at >= 0 ? rows[at] : undefined
    },
    [place, rows, of, tail],
  )
  React.useEffect(() => {
    if (place >= 0) onReach?.(place + 1)
  }, [place, onReach])
  // Its values as the grid's cells show them, an edit still saving included.
  const rowEdits = row ? commit.edits.get(row.id) : undefined
  const values = React.useMemo(() => (row ? shownValues(row, rowEdits) : {}), [row, rowEdits])
  const ctx = React.useMemo<CellContext>(() => ({ options: optionIndexOf(fields), tinted: tintedFields(fields), rowHeight: "medium", panel: true, tableId }), [fields, tableId])
  const panelRef = React.useRef<HTMLDivElement>(null)
  // A cell a new comment goes on, and each cell's count of open comments.
  const [commentOn, setCommentOn] = React.useState<string | null>(null)
  const [cellCounts, setCellCounts] = React.useState<Record<string, number>>({})
  const { copy } = useCopyToClipboard()
  // A record opens beside the grid, or as a page across the window (T2).
  const [asPage, setAsPage] = useRecordAsPage()
  React.useEffect(() => {
    setCommentOn(null)
    setCellCounts({})
  }, [rowId])

  const step = React.useCallback(
    (by: number) => {
      const next = stepTo(by)
      if (next) onStep(next.id)
    },
    [stepTo, onStep],
  )

  React.useEffect(() => {
    const typingIn = (t: EventTarget | null) => t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))
    const onKey = (e: KeyboardEvent) => {
      if (!typingIn(e.target) && !e.metaKey && !e.ctrlKey && !e.altKey && (e.key === "j" || e.key === "k")) {
        e.preventDefault()
        step(e.key === "j" ? 1 : -1)
      }
    }
    window.addEventListener("keydown", onKey)
    // Esc closes it, after a picker open in it; not from a field.
    const stopEscape = onEscape("panel", (e) => (typingIn(e.target) ? false : onClose()))
    return () => {
      window.removeEventListener("keydown", onKey)
      stopEscape()
    }
  }, [onClose, step])

  React.useEffect(() => {
    panelRef.current?.focus({ preventScroll: true })
  }, [])

  if (!row) return null
  const [primary, ...rest] = sorted
  const title = primary ? String(values[primary.id] ?? "") : ""

  const remove = () =>
    confirm({
      title: "Delete this row?",
      description: "It's removed for everyone, and kept in the table's trash.",
      confirmText: "Delete row",
      destructive: true,
      onConfirm: async () => {
        try {
          const next = stepTo(1) ?? stepTo(-1)
          const done = await batchRows(tableId, { delete: [row.id] })
          offerUndo("Row deleted", () => undoChange(tableId, done.change_set))
          if (next) onStep(next.id)
          else onClose()
        } catch {
          // surfaced
        } finally {
          onChange()
        }
      },
    })

  return (
    <aside
      ref={panelRef}
      tabIndex={-1}
      role="dialog"
      data-escape-own=""
      aria-label={title ? `${title}, a row of ${tableName}` : `A row of ${tableName}`}
      data-record-panel=""
      data-record-as-page={asPage ? "" : undefined}
      className={cn(
        "content-float fixed inset-y-2 right-2 z-[var(--z-popover)] flex flex-col overflow-hidden rounded-[16px] bg-sheet shadow-e3 outline-none [--float-from-y:0px] max-sm:inset-x-0 max-sm:bottom-0 max-sm:top-auto max-sm:h-[88dvh] max-sm:w-full max-sm:rounded-b-none max-sm:shadow-sheet",
        asPage ? "left-2 sm:w-auto" : "w-[min(480px,calc(100vw-16px))]",
      )}
    >
      <header className="flex h-12 shrink-0 items-center gap-1 px-3" data-touch-group="">
        <TableGlyph id={tableId} size="sm" />
        <span className="ml-1.5 min-w-0 flex-1 truncate text-ui-sm text-ink-3">
          {place >= 0 ? `${tableName} · ${formatLocale(place + 1, {})} of ${formatLocale(of, {})}` : tableName}
        </span>
        <Button variant="ghost" size="icon-sm" aria-label="Previous row (K)" disabled={!stepTo(-1)} onClick={() => step(-1)}>
          <ChevronUp className="size-4" />
        </Button>
        <Button variant="ghost" size="icon-sm" aria-label="Next row (J)" disabled={!stepTo(1)} onClick={() => step(1)}>
          <ChevronDown className="size-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          className="max-sm:hidden"
          aria-label={asPage ? "Back to the side panel" : "Open as a page"}
          aria-pressed={asPage}
          onClick={() => setAsPage(!asPage)}
        >
          {asPage ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Copy a link to this row"
          onClick={() => void copy(`${window.location.origin}${tablePath(tableId, { row: row.id })}`, "A link to this row is on your clipboard.")}
        >
          <Link2 className="size-4" />
        </Button>
        {canManage ? (
          <Button variant="ghost" size="icon-sm" aria-label="Delete this row" onClick={remove}>
            <Trash2 className="size-4" />
          </Button>
        ) : null}
        <Button variant="ghost" size="icon-sm" aria-label="Close" onClick={onClose}>
          <X className="size-4" />
        </Button>
      </header>
      <div key={row.id} className="table-sub-in min-h-0 flex-1 overflow-y-auto px-6 pb-8 pt-2">
        <div className={cn(asPage && "mx-auto w-full max-w-[760px]")}>
        {primary ? (
          <PanelTitle
            key={`${row.id}:${title}`}
            label={primary.name}
            value={title}
            readOnly={primary.type === "formula" || primary.type === "rollup"}
            onCommit={(v) => void commit.commitCell(row, primary.id, v)}
          />
        ) : null}
        <dl className="space-y-0.5">
          {rest.map((f) => {
            const Glyph = fieldKind(f.type).glyph
            return (
              <div key={f.id} className="grid min-h-9 grid-cols-[148px_minmax(0,1fr)] items-start gap-2 max-sm:grid-cols-1 max-sm:gap-0.5">
                <dt className="group/field flex h-9 items-center gap-1.5 text-ui-sm text-ink-3">
                  <Glyph className="size-3.5 shrink-0" aria-hidden />
                  <span className="truncate">{f.name}</span>
                  <CellCommentButton field={f} count={cellCounts[f.id] ?? 0} onClick={() => setCommentOn(f.id)} />
                </dt>
                <dd className="-mx-3 flex min-h-9 items-stretch rounded-lg transition-colors hover:bg-hover focus-within:bg-raised focus-within:shadow-e1 [&>*]:min-h-9 [&>*]:w-full">
                  <Cell
                    field={f}
                    value={values[f.id]}
                    cellId={`panel:${f.id}`}
                    ctx={ctx}
                    onCommit={(v) => commit.commitCell(row, f.id, v)}
                    onLink={(change) => void commit.linkCell(row.id, f.id, change)}
                  />
                </dd>
                {f.description?.trim() ? (
                  // What the field is for, under its value: a dt may have several dds.
                  <dd className="col-start-2 -mt-0.5 whitespace-pre-wrap break-words pb-1 text-meta text-ink-3 max-sm:col-start-1" data-field-description="">
                    {f.description.trim()}
                  </dd>
                ) : null}
                {aiPromptOf(parseFieldConfig(f)) ? <AiCellNote tableId={tableId} field={f} row={row} onFilled={onChange} /> : null}
              </div>
            )
          })}
        </dl>
        <RowPage tableId={tableId} rowId={row.id} page={row.page} />
        <RowComments
          rowId={row.id}
          fields={fields}
          target={commentOn}
          onTargetDone={() => setCommentOn(null)}
          focusThread={focusThread}
          onCellCounts={setCellCounts}
        />
        <p className="mt-6 text-meta text-ink-3">
          {row.updated_at ? `Edited ${relativeTime(row.updated_at)}` : null}
          {row.created_at ? ` · Added ${relativeTime(row.created_at)}` : null}
        </p>
        <RowHistory tableId={tableId} rowId={row.id} fields={fields} />
        </div>
      </div>
    </aside>
  )
}

/**
 * A field's comment button in the record: shown on hover and focus (always on
 * a touch screen), and kept in view with its count while its cell has open
 * comments. It starts a comment on that cell in the comments below.
 */
function CellCommentButton({ field, count, onClick }: { field: TableField; count: number; onClick: () => void }) {
  const label = count > 0 ? `Comment on ${field.name}, ${count} ${count === 1 ? "comment" : "comments"}` : `Comment on ${field.name}`
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      data-touch-target=""
      data-cell-comments={count || undefined}
      className={cn(
        "ml-auto flex h-6 shrink-0 items-center gap-0.5 rounded-md px-1 text-meta text-ink-3 transition-[opacity,color,background-color] duration-[140ms] ease-out hover:bg-hover hover:text-ink focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring",
        count > 0 ? "opacity-100" : "opacity-0 group-hover/field:opacity-100 group-focus-within/field:opacity-100 [@media(hover:none)]:opacity-100",
      )}
    >
      <MessageSquare className="size-3.5" aria-hidden="true" />
      {count > 0 ? <span className="tabular-nums">{count}</span> : null}
    </button>
  )
}

/**
 * The record's title: its primary value at title size, saved on blur or
 * Enter. A text area as tall as its lines, as a text cell is, so a title
 * with line breaks keeps them (TAB-BUG-7).
 */
function PanelTitle({ label, value, readOnly, onCommit }: { label: string; value: string; readOnly?: boolean; onCommit: (v: string) => void }) {
  const [text, setText] = React.useState(value)
  const ref = React.useRef<HTMLTextAreaElement>(null)
  // As tall as its text, not fitLines: a title's parent is the whole record,
  // and a cell's least height made it as tall as the record's visible part.
  useGrowWithText(ref, text)
  if (readOnly) return <h2 className="mb-4 whitespace-pre-wrap break-words font-display text-title-2 text-ink">{value || "Untitled"}</h2>
  return (
    <textarea
      ref={ref}
      rows={1}
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => text !== value && onCommit(text)}
      data-escape-own={text !== value ? "" : undefined}
      onKeyDown={fieldKeyDown((e) => {
        const next = lineBreakKey(e)
        if (next !== null) setText(next)
        if (e.key === "Escape" && text !== value) {
          e.stopPropagation()
          setText(value)
        }
      })}
      aria-label={label}
      placeholder="Untitled"
      {...ix("field")}
      className="-mx-2 mb-4 block w-[calc(100%+16px)] resize-none overflow-hidden break-words rounded-lg bg-transparent px-2 py-1 font-display text-title-2 text-ink placeholder:text-ink-3"
    />
  )
}
