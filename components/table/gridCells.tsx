"use client"

// The grid's live cells (content.md T08): the one cell in use draws through
// these, with its state, pickers and saves; every other cell is drawn at
// rest (cellFaces' restCell). A chunk of its own (DataTableGrid's liveCells),
// off the table's first screen; the record panel draws its fields with them.

import { rowLines } from "@/lib/tables/display"
import * as React from "react"
import { cn } from "@/lib/utils/helpers/cn"
import { Button } from "@/components/ui/button"
import { AlertTriangle } from "@/lib/icons"
import { PopoverContent } from "@/components/ui/popover"
import { useSheetMode } from "@/components/ui/overlayMode"
import { LazyPopover } from "./LazyPopover"
import { cellPickers, ComboboxCell, kindCells, PickerLoading } from "./cellPickerPart"
import { computedOf, formulaOf, isFromRow, optionsOf, relationOf, type RelationRef, type TableField } from "@/services/tableService"
import { RelationCell } from "@/components/table/RelationCell"
import { showFormulaValue } from "@/lib/tables/formula"
import { dayOf, listText, numberFormatOf } from "@/lib/tables/cellFormat"
import { localDay } from "@/lib/utils/timeZone"
import { fieldKeyDown, isComposingKey } from "@/lib/keys/ime"
import { fieldKind } from "@/lib/fieldTypes/registry"
import { lazyView } from "@/lib/lazy/lazyView"
import {
  CELL_PAD,
  FOCUS,
  checkboxMarkup,
  chipRoom,
  chosenOf,
  computedMarkup,
  dateMarkup,
  savedTextOf,
  selectMarkup,
  textLook,
  textMarkup,
  waitFace,
  type CellContext,
  type CellProps,
} from "@/components/table/cellFaces"

/** A files cell (FilesCell.tsx): a chunk of its own, as few tables have one. */
const filesPart = lazyView(() => import("@/components/table/FilesCell"))

/**
 * What a cell shows: its saved value, or what was just chosen while that is
 * saved. A failed save puts it back.
 */
export function useShownValue<T>(value: T): [T, (next: T, commit: (v: T) => Promise<boolean>) => void] {
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

/** The right renderer for a field's type (content.md T08). */
export function Cell({ field, value, cellId, primary, readOnly, ctx, onCommit, onLink }: CellProps) {
  if (field.type === "formula" || field.type === "rollup") {
    return <ComputedCell field={field} value={value} cellId={cellId} ctx={ctx} />
  }
  if (isFromRow(field)) {
    return <kindCells.View fallback={<KindWait field={field} value={value} cellId={cellId} />} render={(m) => <m.RowStampCell field={field} value={value} cellId={cellId} />} />
  }
  if (field.type === "checkbox") {
    return <CheckboxCell label={field.name} value={!!value} cellId={cellId} readOnly={readOnly} start={ctx.panel} onCommit={onCommit} />
  }
  if (field.type === "rating" || field.type === "people" || field.type === "long_text") {
    const wait = <KindWait field={field} value={value} cellId={cellId} />
    const lines = rowLines(ctx.rowHeight)
    return (
      <kindCells.View
        fallback={wait}
        render={(m) =>
          field.type === "rating" ? (
            <m.RatingCell field={field} value={value} cellId={cellId} readOnly={readOnly} onCommit={onCommit} />
          ) : field.type === "people" ? (
            <m.PeopleCell field={field} value={value} cellId={cellId} readOnly={readOnly} onCommit={onCommit} />
          ) : (
            <m.LongTextCell field={field} value={value} cellId={cellId} readOnly={readOnly} lines={lines} panel={ctx.panel} onCommit={onCommit} />
          )
        }
      />
    )
  }
  if (fieldKind(field.type).options) {
    return <SelectCell field={field} value={value} cellId={cellId} readOnly={readOnly} ctx={ctx} onCommit={onCommit} />
  }
  if (field.type === "relation") {
    const { target, tableId, tableName } = relationOf(field)
    const linksTable = target === "table"
    return (
      <div data-cell={cellId} tabIndex={-1} className={cn("h-full", FOCUS)}>
        <RelationCell
          value={value}
          room={chipRoom(ctx, true)}
          target={target}
          tableId={tableId}
          tableName={tableName}
          readOnly={readOnly || (linksTable && !tableName)}
          onLink={linksTable ? onLink : undefined}
          onCommit={(refs: RelationRef[]) => void onCommit(refs)}
        />
      </div>
    )
  }
  if (field.type === "attachment") {
    return (
      <div data-cell={cellId} tabIndex={-1} className={cn("h-full", FOCUS)}>
        {/* Its chunk loads with the first files cell drawn; until then, the names. */}
        <filesPart.View
          fallback={<span className="flex h-full items-center truncate px-3 text-meta text-ink-2">{Array.isArray(value) ? listText(value) : ""}</span>}
          render={(m) => <m.FilesCell value={value} tableId={ctx.tableId} room={chipRoom(ctx, true)} readOnly={readOnly} onCommit={onCommit} />}
        />
      </div>
    )
  }
  if (field.type === "date") {
    return <DateCell field={field} value={value} cellId={cellId} readOnly={readOnly} onCommit={onCommit} />
  }
  return <TextCell field={field} value={value} cellId={cellId} primary={primary} readOnly={readOnly} ctx={ctx} onCommit={onCommit} />
}

/** A B1 kind's cell while its chunk (kindCells) is on its way: its text, where the cell will be. */
function KindWait({ field, value, cellId }: { field: TableField; value: unknown; cellId: string }) {
  return waitFace({ field, value, cellId })
}

export function CheckboxCell({
  label,
  value,
  cellId,
  readOnly,
  start,
  onCommit,
}: {
  label: string
  value: boolean
  cellId: string
  readOnly?: boolean
  /** Sit at the start of the cell (the record panel), not its middle. */
  start?: boolean
  onCommit: (v: unknown) => Promise<boolean>
}) {
  const [shown, change] = useShownValue(value)
  // The springy check: only when someone ticks it, never for a box that was
  // already ticked when the table opened.
  const [pop, setPop] = React.useState(false)
  return checkboxMarkup({
    label,
    checked: shown,
    cellId,
    readOnly,
    start,
    pop,
    live: {
      onChange: (e) => {
        if (e.target.checked) setPop(true)
        change(e.target.checked, onCommit)
      },
      onAnimationEnd: () => setPop(false),
    },
  })
}

/**
 * A select or multi-select cell: its chips at rest (neutral unless the column
 * opted into tints), and a CommandList picker on click or Enter, with search.
 * It was the browser's own select under a chip.
 */
export function SelectCell({
  field,
  value,
  cellId,
  readOnly,
  ctx,
  onCommit,
}: {
  field: TableField
  value: unknown
  cellId: string
  readOnly?: boolean
  ctx: CellContext
  onCommit: (v: unknown) => Promise<boolean>
}) {
  const multi = field.type === "multi_select"
  const status = field.type === "status"
  const options = React.useMemo(() => optionsOf(field), [field])
  const saved = React.useMemo<string[]>(() => chosenOf(field, value), [field, value])
  const [selected, change] = useShownValue(saved)
  const [open, setOpen] = React.useState(false)

  // A pick toggles a multi-select's option, and chooses a select's.
  const pickLabel = (label: string) => {
    if (multi) {
      const next = selected.includes(label) ? selected.filter((s) => s !== label) : [...selected, label]
      change(next, (v) => onCommit(v))
    } else {
      change([label], () => onCommit(label))
      setOpen(false)
    }
  }
  const clear = () => {
    change([], () => onCommit(""))
    setOpen(false)
  }

  const button = selectMarkup({ field, selected, cellId, readOnly, ctx, options, live: true })
  if (readOnly) return button
  if (status) {
    // The combobox (SA-3), grouped, with the cell as its trigger.
    return (
      <ComboboxCell
        trigger={button}
        picker={(m, open, setOpen) => (
          <m.StatusCombobox trigger={button} open={open} onOpenChange={setOpen} name={field.name} options={options} selected={selected[0] ?? ""} onPick={pickLabel} onClear={clear} />
        )}
      />
    )
  }
  return (
    <LazyPopover open={open} onOpenChange={setOpen} trigger={button}>
      <PopoverContent align="start" sideOffset={2} className="w-auto rounded-xl bg-transparent p-0 shadow-none" onOpenAutoFocus={(e) => e.preventDefault()}>
        <cellPickers.View
          fallback={<PickerLoading />}
          render={(m) => <m.OptionPicker name={field.name} options={options} selected={selected} multi={multi} onPick={pickLabel} onClear={clear} />}
        />
      </PopoverContent>
    </LazyPopover>
  )
}

/**
 * A date cell: "7 Oct" (with the year only when it isn't this one), opening
 * the calendar; overdue in danger-ink when the column's format says it is a
 * due date; a calendar glyph at the right edge on hover.
 */
export function DateCell({
  field,
  value,
  cellId,
  readOnly,
  onCommit,
}: {
  field: TableField
  value: unknown
  cellId: string
  readOnly?: boolean
  onCommit: (v: unknown) => Promise<boolean>
}) {
  const saved = typeof value === "string" ? value : ""
  const [shown, change] = useShownValue(saved)
  const [open, setOpen] = React.useState(false)
  const day = dayOf(shown)
  const pick = (d: Date | undefined) => {
    change(d ? localDay(d) : "", onCommit)
    setOpen(false)
  }
  const button = dateMarkup({ field, text: shown, cellId, readOnly, live: true })
  if (readOnly) return button
  return (
    <LazyPopover
      open={open}
      onOpenChange={setOpen}
      trigger={button}
    >
      <PopoverContent className="content-float w-auto rounded-xl p-0 shadow-e3" align="start">
        <cellPickers.View fallback={<PickerLoading />} render={(m) => <m.DayPicker day={day} onPick={pick} />} />
      </PopoverContent>
    </LazyPopover>
  )
}

/** How tall a grid cell's text editor grows while it's edited, before it scrolls. */
const LINES_MAX_PX = 240

/**
 * A text area editing a cell's lines, as tall as they are: at least its cell,
 * at most `max`, past which it scrolls; `data-grown` when it's taller than
 * its cell. Closed, it's its cell's height again, at its first line.
 */
export function fitLines(el: HTMLTextAreaElement, open: boolean, max = Infinity) {
  if (!open) {
    el.style.height = ""
    el.scrollTop = 0
    delete el.dataset.grown
    return
  }
  const cell = el.parentElement?.clientHeight ?? 0
  el.style.height = "auto"
  const h = Math.min(Math.max(el.scrollHeight, cell), max)
  el.style.height = `${h}px`
  if (h > cell + 1) el.dataset.grown = ""
  else delete el.dataset.grown
}

/**
 * Enter in a text area editing a cell: Shift+Enter, or Alt+Enter as in a
 * spreadsheet, puts a line break where the caret is and gives the new text;
 * Enter alone saves, by leaving it. Null for any other key, and for Enter;
 * an input method's Enter, picking a word, is left to it (lib/keys/ime).
 */
export function lineBreakKey(e: React.KeyboardEvent<HTMLTextAreaElement>): string | null {
  if (e.key !== "Enter" || isComposingKey(e.nativeEvent)) return null
  e.preventDefault()
  const el = e.currentTarget
  if (!e.shiftKey && !e.altKey) {
    el.blur()
    return null
  }
  el.setRangeText("\n", el.selectionStart, el.selectionEnd, "end")
  return el.value
}

export function TextCell({
  field,
  value,
  cellId,
  primary,
  readOnly,
  ctx,
  onCommit,
}: {
  field: TableField
  value: unknown
  cellId: string
  primary?: boolean
  readOnly?: boolean
  ctx: CellContext
  onCommit: (value: unknown) => Promise<boolean>
}) {
  const savedText = savedTextOf(field, value)
  const [local, setLocal] = React.useState<string>(savedText)
  React.useEffect(() => {
    setLocal(savedText)
  }, [savedText])
  const look = textLook(field, local, savedText, ctx)
  const { typed, notNumber, lines } = look

  // The latest typing, for a commit when the row leaves the page while its
  // cell still has the focus: removing a focused element does not blur it.
  const pending = React.useRef<{ due: boolean; commit: () => void } | null>(null)
  pending.current = { due: local !== savedText && !notNumber, commit: () => void onCommit(typed) }
  React.useEffect(
    () => () => {
      const p = pending.current
      if (p?.due) p.commit()
    },
    [],
  )

  const commit = () => {
    if (local === savedText || notNumber) return
    void onCommit(typed)
  }

  const area = React.useRef<HTMLTextAreaElement>(null)
  // In the record panel a text area is as tall as its lines, always.
  React.useLayoutEffect(() => {
    if (lines && ctx.panel && area.current) fitLines(area.current, true)
  }, [lines, ctx.panel, local])

  const escape = (e: React.KeyboardEvent) => {
    if (e.key === "Escape" && local !== savedText) {
      e.preventDefault()
      e.stopPropagation()
      setLocal(savedText)
    }
  }
  // The grid's text area grows while it's edited; the panel's always fits its lines.
  const fit = (el: HTMLTextAreaElement, open: boolean) => {
    if (!ctx.panel) fitLines(el, open, LINES_MAX_PX)
  }
  return textMarkup({
    field,
    cellId,
    primary,
    readOnly,
    ctx,
    local,
    look,
    live: {
      area,
      own: local !== savedText,
      onArea: (e) => {
        setLocal(e.target.value)
        fit(e.currentTarget, true)
      },
      onAreaFocus: (e) => fit(e.currentTarget, true),
      onAreaBlur: (e) => {
        fit(e.currentTarget, false)
        commit()
      },
      onAreaKey: fieldKeyDown((e) => {
        escape(e)
        const next = lineBreakKey(e)
        if (next === null) return
        setLocal(next)
        fit(e.currentTarget, true)
      }),
      onInput: (e) => setLocal(e.target.value),
      onInputBlur: commit,
      onInputKey: fieldKeyDown(escape),
    },
  })
}

/**
 * What a formula or a rollup gives (T10): one step quieter than typed values
 * (ink-2), numbers tabular and right-aligned; a result that names an option
 * of a select column reads as that option's chip; an error is "#ERROR" in the
 * cell, never the raw message, with a card on hover or focus that says what
 * went wrong and offers to edit the formula, or the rollup's settings.
 */
export function ComputedCell({ field, value, cellId, ctx }: { field: TableField; value: unknown; cellId: string; ctx: CellContext }) {
  const shown = showFormulaValue(value, computedOf(field).result, numberFormatOf(field))
  if (shown.kind === "error") return <ComputedError field={field} message={shown.message} reach={{ "data-cell": cellId, tabIndex: -1 }} onEdit={ctx.onEditField} />
  return computedMarkup(field, cellId, ctx, shown)
}

function ComputedError({
  field,
  message,
  reach,
  onEdit,
}: {
  field: TableField
  message: string
  reach: { "data-cell": string; tabIndex: number }
  onEdit?: (fieldId: string) => void
}) {
  const [open, setOpen] = React.useState(false)
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  const show = (on: boolean) => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => setOpen(on), on ? 120 : 160)
  }
  // Hover is a mouse's or a pen's. A finger's tap opens the card by focus,
  // and every tap ends with the finger leaving, which must not start the
  // grace that puts the card away before its button can be pressed.
  const hover = (on: boolean) => (e: React.PointerEvent) => {
    if (e.pointerType !== "touch") show(on)
  }
  // Pressing its button is the card's work done: it goes at once, and no
  // hover timer brings it back. On a phone the settings sheet leaves the focus
  // on the button, so nothing else would put the card away, and it stayed
  // under the settings it opened.
  const edit = () => {
    if (timer.current) clearTimeout(timer.current)
    setOpen(false)
    onEdit?.(field.id)
  }
  React.useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current)
  }, [])
  const descId = React.useId()
  const formula = field.type === "formula" ? formulaOf(field).formula : ""
  return (
    <LazyPopover
      anchor
      open={open}
      onOpenChange={setOpen}
      trigger={
        <div
          {...reach}
          aria-describedby={descId}
          onPointerEnter={hover(true)}
          onPointerLeave={hover(false)}
          onFocus={() => setOpen(true)}
          onBlur={() => show(false)}
          className={cn("flex h-full items-center gap-1 text-meta font-medium text-danger-ink", CELL_PAD, FOCUS)}
        >
          <AlertTriangle className="size-3.5 shrink-0" aria-hidden="true" />
          <span>#ERROR</span>
          <span id={descId} className="sr-only">
            {message}
          </span>
        </div>
      }
    >
      <PopoverContent
        align="start"
        sideOffset={4}
        onOpenAutoFocus={(e) => e.preventDefault()}
        onPointerEnter={hover(true)}
        onPointerLeave={hover(false)}
        data-overlay-holds-body=""
        data-overlay-holds-footer={onEdit ? "" : undefined}
        className="content-float w-[280px] rounded-xl p-0 shadow-e3"
        role="note"
      >
        <ErrorCard
          message={message}
          formula={formula}
          action={field.type === "rollup" ? "Edit rollup" : "Edit formula"}
          onAction={onEdit ? edit : undefined}
        />
      </PopoverContent>
    </LazyPopover>
  )
}

/**
 * A broken cell's card, laid out as every overlay is (app/overlay.css): its
 * words are the body and its button is pinned in the footer. On a phone the
 * card is a sheet, so it takes the sheets' 16 px gutters and its button their
 * full size; drawn only while the card is up, so only an open card asks.
 */
function ErrorCard({ message, formula, action, onAction }: { message: string; formula: string; action: string; onAction?: () => void }) {
  const sheet = useSheetMode()
  const gutter = sheet ? "px-4" : "px-3"
  return (
    <>
      <div data-overlay-body="" className={cn("min-h-0 space-y-2 pt-3", gutter, onAction ? "pb-2" : "pb-3")}>
        <p className="text-ui-sm text-ink">{message}</p>
        {formula ? <p className="truncate font-mono text-meta text-ink-2"><span className="v3-wavy">{formula}</span></p> : null}
      </div>
      {onAction ? (
        <div data-overlay-footer="" className={cn("flex", gutter, sheet ? "pt-1" : "pb-3")}>
          <Button size={sheet ? "lg" : "xs"} variant="secondary" className={cn(sheet && "h-11 flex-1")} onClick={onAction}>
            {action}
          </Button>
        </div>
      ) : null}
    </>
  )
}
