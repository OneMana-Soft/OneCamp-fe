"use client"

import { personHue } from "@/lib/utils/getAvatarColor"
import * as React from "react"
import { cn } from "@/lib/utils/helpers/cn"
import { Button } from "@/components/ui/button"
import {
  AlertTriangle,
  ArrowUpRight,
  AtSign,
  CalendarDays,
  Check,
  CheckSquare,
  CircleDot,
  Hash,
  Link2,
  Mail,
  Network,
  Sigma,
  Tag,
  Type,
  User,
} from "@/lib/icons"
import { PopoverContent } from "@/components/ui/popover"
import { LazyPopover } from "./LazyPopover"
import { Calendar } from "@/components/ui/calendar"
import { CommandList, type CommandListHandle, type CommandListItem } from "@/components/ui/CommandList"
import {
  computedOf,
  formulaOf,
  optionsOf,
  parseFieldConfig,
  relationOf,
  type FieldType,
  type RelationRef,
  type TableField,
} from "@/services/tableService"
import { RelationCell } from "@/components/table/RelationCell"
import { OptionChip, chipsTinted } from "@/components/table/optionChip"
import { showFormulaValue } from "@/lib/tables/formula"
import type { CellKind } from "@/lib/tables/gridKeys"
import { cellValid, formatNumber, numberFormatOf, safeHref, shortDay, urlHost } from "@/lib/tables/cellFormat"
import { parseTypedNumber, typedNumberText } from "@/lib/format/number"
import type { RowHeight } from "@/lib/tables/display"
import { localDay } from "@/lib/utils/timeZone"
import { campHueOf } from "@/lib/campHue"
import { HUE_CLASS } from "@/components/ui/graphics/hues"
import { formatLocale } from "@/lib/tables/numberFormat"
import { isComposingKey } from "@/lib/keys/ime"

/** The twelve column types, each with the one-line hint the type menus show (kept short: the hint gives way to the name, see ColumnMenu's TypeHint). */
export const FIELD_TYPES: { value: FieldType; label: string; hint: string }[] = [
  { value: "text", label: "Text", hint: "Names, notes, anything" },
  { value: "number", label: "Number", hint: "Sums and currency" },
  { value: "select", label: "Select", hint: "One option from a list" },
  { value: "multi_select", label: "Multi-select", hint: "Several, as tags" },
  { value: "date", label: "Date", hint: "Due dates, calendars" },
  { value: "checkbox", label: "Checkbox", hint: "Done or not" },
  { value: "url", label: "URL", hint: "A link that opens" },
  { value: "email", label: "Email", hint: "An address to write to" },
  { value: "person", label: "Person", hint: "Who it belongs to" },
  { value: "relation", label: "Relation", hint: "Link to another table" },
  { value: "formula", label: "Formula", hint: "From other fields" },
  { value: "rollup", label: "Rollup", hint: "Add up what's linked" },
]

/** A column type's glyph: the header says the type with it, never in words. */
export const FIELD_GLYPH: Record<FieldType, React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>> = {
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

export const fieldTypeLabel = (type: FieldType) => FIELD_TYPES.find((t) => t.value === type)?.label ?? type

/** The kind of control a cell is, for moving around from the keyboard. */
export function cellKind(f: TableField): CellKind {
  switch (f.type) {
    case "formula":
    case "rollup":
      return "computed"
    case "checkbox":
      return "checkbox"
    case "select":
    case "multi_select":
    case "relation":
    case "date":
      return "button"
    case "number":
      return "number"
    default:
      return "text"
  }
}

/** A select option the grid knows, by its label: for chips a formula's result can borrow. */
export type OptionIndex = Map<string, { color?: string; tinted: boolean }>

export function optionIndexOf(fields: TableField[]): OptionIndex {
  const out: OptionIndex = new Map()
  for (const f of fields) {
    if (f.type !== "select" && f.type !== "multi_select") continue
    const tinted = chipsTinted(f)
    for (const o of optionsOf(f)) if (!out.has(o.label)) out.set(o.label, { color: o.color, tinted })
  }
  return out
}

/** What every cell in a grid shares. */
export interface CellContext {
  options: OptionIndex
  rowHeight: RowHeight
  /** Opens a column's menu at its formula (from a formula error's card). */
  onEditField?: (fieldId: string) => void
  /** In the record panel: values read from the left, as a form does. */
  panel?: boolean
}

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

const CELL_PAD = "px-3"
const FOCUS = "outline-none"

export interface CellProps {
  field: TableField
  value: unknown
  /** "row:col", for moving between cells from the keyboard. */
  cellId: string
  primary?: boolean
  readOnly?: boolean
  ctx: CellContext
  onCommit: (value: unknown) => Promise<boolean>
  onLink: (change: { add?: string[]; remove?: string[] }) => void
}

/**
 * How a cell's chips sit: in the record panel, all of them, wrapping; in a
 * tall row, eight, wrapping; else one line of two (one for a single select),
 * then "+N". Chips that wrapped in a 40 px row stretched it past the grid's
 * fixed row height (QA PTC-16).
 */
function chipRoom(ctx: CellContext, multi: boolean): { max: number; wrap: boolean } {
  if (ctx.panel) return { max: Infinity, wrap: true }
  const tall = ctx.rowHeight === "tall" || ctx.rowHeight === "xtall"
  return { max: tall ? 8 : multi ? 2 : 1, wrap: tall }
}

/** The right renderer for a field's type (content.md T08). */
export function Cell({ field, value, cellId, primary, readOnly, ctx, onCommit, onLink }: CellProps) {
  if (field.type === "formula" || field.type === "rollup") {
    return <ComputedCell field={field} value={value} cellId={cellId} ctx={ctx} />
  }
  if (field.type === "checkbox") {
    return <CheckboxCell label={field.name} value={!!value} cellId={cellId} readOnly={readOnly} start={ctx.panel} onCommit={onCommit} />
  }
  if (field.type === "select" || field.type === "multi_select") {
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
  if (field.type === "date") {
    return <DateCell field={field} value={value} cellId={cellId} readOnly={readOnly} onCommit={onCommit} />
  }
  return <TextCell field={field} value={value} cellId={cellId} primary={primary} readOnly={readOnly} ctx={ctx} onCommit={onCommit} />
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
  // A label as big as the cell, so a click or a tap anywhere in it ticks the
  // box, as every cell takes one (TAB-BUG-15): the 16 px box alone did.
  return (
    <label className={cn("flex h-full items-center", start ? "px-3" : "justify-center", !readOnly && "cursor-pointer")}>
      <input
        type="checkbox"
        data-cell={cellId}
        checked={shown}
        disabled={readOnly}
        onChange={(e) => {
          if (e.target.checked) setPop(true)
          change(e.target.checked, onCommit)
        }}
        onAnimationEnd={() => setPop(false)}
        aria-label={label}
        className={cn("v3-check", pop && "animate-spring")}
      />
    </label>
  )
}

/** An option's tile in a picker: its 6 px dot. */
function OptionDot({ color }: { color?: string }) {
  const hue = campHueOf(color)
  return (
    <span className="inline-flex size-6 items-center justify-center">
      <span aria-hidden="true" className={cn("size-2 rounded-[4px]", hue ? cn(HUE_CLASS[hue], "bg-hue") : "bg-ink-3")} />
    </span>
  )
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
  const options = React.useMemo(() => optionsOf(field), [field])
  const tinted = chipsTinted(field)
  const saved = React.useMemo<string[]>(
    () => (multi ? (Array.isArray(value) ? (value as string[]) : []) : typeof value === "string" && value ? [value] : []),
    [multi, value],
  )
  const [selected, change] = useShownValue(saved)
  const [open, setOpen] = React.useState(false)
  const [q, setQ] = React.useState("")
  const list = React.useRef<CommandListHandle>(null)
  const colorOf = (label: string) => options.find((o) => o.label === label)?.color
  const { max: maxChips, wrap } = chipRoom(ctx, multi)

  const items: CommandListItem[] = React.useMemo(() => {
    const ql = q.trim().toLowerCase()
    // Each option by its id; a cell holds the label.
    const out: CommandListItem[] = options
      .filter((o) => !ql || o.label.toLowerCase().includes(ql))
      .map((o) => ({
        id: o.id,
        label: o.label,
        tile: <OptionDot color={o.color} />,
        trailing: selected.includes(o.label) ? <Check className="size-4 text-camp-moss" aria-hidden="true" /> : undefined,
      }))
    if (!multi && selected.length && !ql) out.push({ id: "__clear", label: "Clear", text: "Clear", tile: <span className="size-6" /> })
    return out
  }, [options, q, selected, multi])

  const pick = (item: CommandListItem) => {
    if (item.id === "__clear") {
      change([], () => onCommit(""))
      setOpen(false)
      return
    }
    const label = options.find((o) => o.id === item.id)?.label
    if (label === undefined) return
    if (multi) {
      const next = selected.includes(label) ? selected.filter((s) => s !== label) : [...selected, label]
      change(next, (v) => onCommit(v))
    } else {
      change([label], () => onCommit(label))
      setOpen(false)
    }
  }

  const shown = selected.slice(0, maxChips)
  const more = selected.length - shown.length
  const body = (
    <span className={cn("flex min-w-0 flex-1 items-center gap-1", wrap ? "flex-wrap content-start py-2" : "overflow-hidden")}>
      {shown.map((s) => (
        <OptionChip key={s} label={s} color={colorOf(s)} tinted={tinted} className={ctx.rowHeight === "short" ? "h-5" : undefined} />
      ))}
      {more > 0 ? <span className="chip h-[22px] shrink-0 text-ink-2">+{more}</span> : null}
      {selected.length === 0 && !readOnly ? (
        <span className="text-ui text-ink-3 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 [@media(hover:none)]:opacity-100 [@media(hover:none)]:pointer-events-auto">Select…</span>
      ) : null}
    </span>
  )
  if (readOnly) {
    return (
      <div data-cell={cellId} tabIndex={-1} className={cn("flex h-full items-center", CELL_PAD, FOCUS)} aria-label={`${field.name}: ${selected.join(", ") || "none"}`}>
        {body}
      </div>
    )
  }
  return (
    <LazyPopover
      open={open}
      onOpenChange={(o) => {
        setOpen(o)
        if (!o) setQ("")
      }}
      trigger={
        <button
          type="button"
          data-cell={cellId}
          aria-label={`${field.name}: ${selected.length ? selected.join(", ") : "none chosen"}`}
          className={cn("flex h-full w-full items-center text-left", CELL_PAD, FOCUS)}
        >
          {body}
        </button>
      }
    >
      <PopoverContent align="start" sideOffset={2} className="w-auto rounded-xl bg-transparent p-0 shadow-none" onOpenAutoFocus={(e) => e.preventDefault()}>
        <CommandList
          ref={list}
          label={`${field.name} options`}
          className="w-64"
          items={items}
          query={q}
          onSelect={pick}
          maxHeight={280}
          empty={options.length === 0 ? "No options yet. Add some in the column menu." : `No options match “${q}”`}
          header={
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (list.current?.onKeyDown(e)) e.preventDefault()
              }}
              placeholder={multi ? "Find options" : "Find an option"}
              aria-label="Find an option"
              className="h-7 w-full bg-transparent text-ui text-ink outline-none placeholder:text-ink-3"
            />
          }
        />
      </PopoverContent>
    </LazyPopover>
  )
}

/** "2026-10-07" (or a timestamp) as the day it names, in the reader's zone. */
export function dayOf(value: unknown): Date | undefined {
  if (typeof value !== "string" || !value) return undefined
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? undefined : d
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
  const due = parseFieldConfig(field).due === true
  const overdue = due && !!day && day < new Date(new Date().toDateString())
  const pick = (d: Date | undefined) => {
    change(d ? localDay(d) : "", onCommit)
    setOpen(false)
  }
  const text = (
    <span className={cn("min-w-0 truncate tabular-nums", overdue && "text-danger-ink")}>{day ? shortDay(day) : ""}</span>
  )
  if (readOnly) {
    return (
      <div data-cell={cellId} tabIndex={-1} className={cn("flex h-full items-center text-ui", CELL_PAD, FOCUS)}>
        {text}
      </div>
    )
  }
  return (
    <LazyPopover
      open={open}
      onOpenChange={setOpen}
      trigger={
        <button
          type="button"
          data-cell={cellId}
          aria-label={`${field.name}: ${day ? shortDay(day) : "no date"}`}
          className={cn("group/date flex h-full w-full items-center gap-1.5 text-left text-ui", CELL_PAD, FOCUS)}
        >
          {text}
          <CalendarDays
            aria-hidden="true"
            className="pointer-events-none ml-auto size-3.5 shrink-0 text-ink-3 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible/date:opacity-100 group-data-[state=open]/date:opacity-100 [@media(hover:none)]:opacity-100"
          />
        </button>
      }
    >
      <PopoverContent className="content-float w-auto rounded-xl p-0 shadow-e3" align="start">
        <Calendar mode="single" selected={day} defaultMonth={day} onSelect={pick} initialFocus />
        <div className="flex justify-end p-2 pt-0">
          <Button variant="ghost" size="xs" disabled={!day} onClick={() => pick(undefined)}>
            Clear
          </Button>
        </div>
      </PopoverContent>
    </LazyPopover>
  )
}

/** A number as the grid shows it at rest, in the reader's format; null when the text is not one number. */
export function groupedNumber(text: string): string | null {
  const t = text.trim()
  if (t === "" || !/^-?\d*\.?\d+(e[+-]?\d+)?$/i.test(t)) return null
  const n = Number(t)
  return Number.isFinite(n) ? formatLocale(n, { maximumFractionDigits: 6 }) : null
}

/** A person's initials avatar at 20 px, in their hue. */
function PersonDot({ name }: { name: string }) {
  const hue = personHue(name)
  const initial = name.trim().charAt(0).toUpperCase()
  return (
    <span aria-hidden="true" className={cn(HUE_CLASS[hue], "avatar-person inline-flex size-5 shrink-0 items-center justify-center rounded-[10px] text-micro font-semibold text-white")}>
      {initial}
    </span>
  )
}

/** Whether text holds a line break, which only a text area keeps: an input drops it. */
const hasBreak = (text: string) => /[\r\n]/.test(text)

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

/**
 * A typed cell (text, number, URL, email, person) that commits on blur or
 * Enter, so typing never waits on the network. At rest some types read
 * differently from what is typed, drawn over the control until it has the
 * focus: a number grouped with its currency and a true minus, a URL as its
 * host in the brand's text colour with a way out, an email with its mail
 * glyph, a person with their avatar, and long text wrapped in tall rows.
 * Escape puts back what was saved; a row that scrolls out commits.
 *
 * Text is edited in a text area, which keeps its line breaks (TAB-BUG-7): an
 * input dropped them, and the first edit saved the lines run together. Enter
 * saves; Shift+Enter or Alt+Enter adds a line. In the grid it shows its first
 * line at rest (its lines, in tall rows) and grows over the rows below while
 * it's edited; in the record panel it's as tall as its lines. A URL, an email
 * or a person holding a line break is edited the same way, whole, and says
 * "Edit in full".
 *
 * A number is read in the reader's locale, with a currency sign before or
 * after; text that isn't a number is refused, never saved as another number
 * or as nothing: the cell keeps its value, ringed, and says "Not a number"
 * (TAB-BUG-8).
 */
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
  const type = field.type
  const isNumber = type === "number"
  const savedText = isNumber ? typedNumberText(value) : value == null ? "" : String(value)
  const [local, setLocal] = React.useState<string>(savedText)
  React.useEffect(() => {
    setLocal(savedText)
  }, [savedText])

  // What a save sends: a number column's text read as a number, null when it isn't one.
  const typed = isNumber ? parseTypedNumber(local) : local
  const notNumber = typed === null

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

  // Text's lines, and a URL's, an email's or a person's when it holds a break.
  const lines = !isNumber && (type === "text" || hasBreak(savedText))
  const area = React.useRef<HTMLTextAreaElement>(null)
  // In the record panel a text area is as tall as its lines, always.
  React.useLayoutEffect(() => {
    if (lines && ctx.panel && area.current) fitLines(area.current, true)
  }, [lines, ctx.panel, local])

  const tall = ctx.rowHeight === "tall" || ctx.rowHeight === "xtall"
  const fmt = isNumber ? numberFormatOf(field) : null
  const num = typeof typed === "number" ? formatNumber(typed, fmt ?? {}) : null
  const invalid = notNumber || ((type === "url" || type === "email") && !lines && !cellValid(type, local))
  const href = lines ? null : type === "url" ? safeHref(local) : type === "email" && local.trim() && !invalid ? `mailto:${local.trim()}` : null

  // What reads at rest, over the control.
  let atRest: React.ReactNode = null
  if (num) {
    atRest = (
      <span className={cn("flex min-w-0 items-center gap-2 tabular-nums", ctx.panel ? "justify-start" : "justify-end")}>
        {num.fraction !== undefined && fmt?.bar ? (
          <span className="v3-pct-bar" aria-hidden="true">
            <span style={{ transform: `scaleX(${num.fraction})` }} />
          </span>
        ) : null}
        <span className={cn("truncate", num.negative && "text-danger-ink")}>
          {num.prefix ? <span className="text-ink-3">{num.prefix}</span> : null}
          {num.text}
          {num.suffix}
        </span>
      </span>
    )
  } else if (lines) {
    // The grid's text area shows its first line itself; the panel's, every line.
    if (!ctx.panel && local.trim() && type !== "text") {
      atRest = (
        <span className="flex min-w-0 items-center gap-2">
          <span className="truncate">{local}</span>
          <span className="shrink-0 text-meta text-ink-3">Edit in full</span>
        </span>
      )
    } else if (!ctx.panel && tall && local.trim()) {
      atRest = <span className={cn("whitespace-pre-wrap break-words", ctx.rowHeight === "tall" ? "line-clamp-2" : "line-clamp-4")}>{local}</span>
    }
  } else if (type === "url" && local.trim()) {
    atRest = (
      <span className="flex min-w-0 items-center gap-1">
        <span className="truncate text-brand-text group-hover/cell:underline">{urlHost(local)}</span>
        {href ? (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            tabIndex={-1}
            aria-label={`Open ${urlHost(local)}`}
            className="pointer-events-auto shrink-0 text-ink-3 opacity-0 transition-opacity hover:text-ink group-hover/cell:opacity-100 group-focus-within/cell:opacity-100 [@media(hover:none)]:opacity-100 [@media(hover:none)]:pointer-events-auto"
          >
            <ArrowUpRight className="size-3" />
          </a>
        ) : null}
      </span>
    )
  } else if (type === "email" && local.trim()) {
    atRest = (
      <span className="flex min-w-0 items-center gap-1">
        <span className="truncate text-ink">{local}</span>
        {href ? (
          <a href={href} tabIndex={-1} aria-label={`Write to ${local}`} className="pointer-events-auto shrink-0 text-ink-3 opacity-0 transition-opacity hover:text-ink group-hover/cell:opacity-100 group-focus-within/cell:opacity-100 [@media(hover:none)]:opacity-100 [@media(hover:none)]:pointer-events-auto">
            <Mail className="size-3" />
          </a>
        ) : null}
      </span>
    )
  } else if (type === "person" && local.trim()) {
    atRest = (
      <span className="flex min-w-0 items-center gap-1.5">
        <PersonDot name={local} />
        <span className="truncate">{local}</span>
      </span>
    )
  }

  const cover = atRest !== null
  if (readOnly) {
    return (
      <div
        data-cell={cellId}
        tabIndex={-1}
        className={cn("flex h-full items-center text-ui", CELL_PAD, FOCUS, primary && "font-medium", isNumber && "justify-end")}
        title={local}
      >
        {atRest ?? <span className="truncate">{local}</span>}
      </div>
    )
  }
  const control = cn(
    "peer h-full w-full bg-transparent text-ui text-ink outline-none",
    CELL_PAD,
    primary && "font-medium",
    isNumber && (ctx.panel ? "tabular-nums" : "text-right tabular-nums"),
    cover && "text-transparent focus:text-foreground",
  )
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
  return (
    <div
      // A tap anywhere in the cell, on a touch screen, where the text box
      // ignores taps until it has the focus (table.css): the cell takes it,
      // and hands the focus to the box.
      tabIndex={-1}
      onFocus={(e) => e.target === e.currentTarget && e.currentTarget.querySelector<HTMLElement>("[data-cell]")?.focus()}
      className={cn("group/cell relative h-full outline-none", invalid && "ring-1 ring-inset ring-destructive")}
      title={invalid ? (notNumber ? "Not a number" : type === "url" ? "This isn't a web address" : "This isn't an email address") : undefined}
    >
      {lines ? (
        <textarea
          ref={area}
          rows={1}
          data-cell={cellId}
          value={local}
          onChange={(e) => {
            setLocal(e.target.value)
            fit(e.currentTarget, true)
          }}
          onFocus={(e) => fit(e.currentTarget, true)}
          onBlur={(e) => {
            fit(e.currentTarget, false)
            commit()
          }}
          onKeyDown={(e) => {
            escape(e)
            const next = lineBreakKey(e)
            if (next === null) return
            setLocal(next)
            fit(e.currentTarget, true)
          }}
          aria-label={field.name}
          autoComplete="off"
          spellCheck={type === "text" ? undefined : false}
          className={cn(control, "block resize-none overflow-hidden break-words", ctx.panel ? "py-2" : "py-[var(--cell-pad-y)]")}
        />
      ) : (
        <input
          type={isNumber ? "text" : type === "email" ? "email" : type === "url" ? "url" : "text"}
          inputMode={isNumber ? "decimal" : undefined}
          data-cell={cellId}
          value={local}
          onChange={(e) => setLocal(e.target.value)}
          onBlur={commit}
          onKeyDown={escape}
          aria-label={field.name}
          aria-invalid={invalid || undefined}
          autoComplete="off"
          spellCheck={false}
          className={control}
        />
      )}
      {cover ? (
        <span
          aria-hidden="true"
          className={cn(
            "pointer-events-none absolute inset-0 flex text-ui peer-focus:hidden",
            CELL_PAD,
            tall && type === "text" ? "items-start py-2.5" : "items-center",
            isNumber && !ctx.panel && "justify-end",
            primary && "font-medium",
          )}
        >
          {atRest}
        </span>
      ) : null}
    </div>
  )
}

/**
 * What a formula or a rollup gives (T10): one step quieter than typed values
 * (ink-2), numbers tabular and right-aligned; a result that names an option
 * of a select column reads as that option's chip; an error is "#ERROR" in the
 * cell, never the raw message, with a card on hover or focus that says what
 * went wrong and offers to edit the formula.
 */
export function ComputedCell({ field, value, cellId, ctx }: { field: TableField; value: unknown; cellId: string; ctx: CellContext }) {
  const shown = showFormulaValue(value, computedOf(field).result)
  const reach = { "data-cell": cellId, tabIndex: -1 } as const
  const base = cn("flex h-full items-center text-ui text-ink-2", CELL_PAD, FOCUS)
  switch (shown.kind) {
    case "blank":
      return <div {...reach} className={base} />
    case "error":
      return <ComputedError field={field} message={shown.message} reach={reach} onEdit={ctx.onEditField} />
    case "checkbox":
      return (
        <div {...reach} className={cn(base, !ctx.panel && "justify-center")} aria-label={shown.checked ? "Yes" : "No"}>
          {shown.checked && <Check className="size-4 text-ink-2" />}
        </div>
      )
    case "number":
      return <div {...reach} className={cn(base, "tabular-nums", !ctx.panel && "justify-end")}>{shown.text}</div>
    default: {
      const asChip = ctx.options.get(shown.text)
      const chipFormat = parseFieldConfig(field).show === "chip"
      if (asChip || (chipFormat && shown.text)) {
        return (
          <div {...reach} className={base} title={shown.text}>
            <OptionChip label={shown.text} color={asChip?.color} tinted={asChip?.tinted ?? false} />
          </div>
        )
      }
      return (
        <div {...reach} className={base} title={shown.text}>
          <span className="truncate">{shown.text}</span>
        </div>
      )
    }
  }
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
          onPointerEnter={() => show(true)}
          onPointerLeave={() => show(false)}
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
        onPointerEnter={() => show(true)}
        onPointerLeave={() => show(false)}
        className="content-float w-[280px] space-y-2 rounded-xl p-3 shadow-e3"
        role="note"
      >
        <p className="text-ui-sm text-ink">{message}</p>
        {formula ? <p className="truncate font-mono text-meta text-ink-2"><span className="v3-wavy">{formula}</span></p> : null}
        {onEdit ? (
          <Button size="xs" variant="secondary" onClick={() => onEdit(field.id)}>
            Edit formula
          </Button>
        ) : null}
      </PopoverContent>
    </LazyPopover>
  )
}

