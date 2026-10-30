"use client"

// The grid's cells at rest (tables T6b): each kind's face as plain markup,
// no component, for the grid to draw a row entering its window as one render
// (restCell), and the markup builders the live cells (gridCells, a chunk of
// its own) draw through, so a cell looks the same at rest and live.

import { personHue } from "@/lib/utils/getAvatarColor"
import * as React from "react"
import { cn } from "@/lib/utils/helpers/cn"
import {
  ArrowUpRight,
  CalendarDays,
  Check,
  Mail,
} from "@/lib/icons"
// Tables' own glyph, not in lib/icons (lib/fieldTypes/registry says why).
import { Phone } from "lucide-react"
import {
  computedOf,
  isFromRow,
  optionsOf,
  parseFieldConfig,
  relationOf,
  type RelationRef,
  type TableField,
} from "@/services/tableService"
import type * as RelationFace from "@/components/table/relationFace"
import { skeletonClass } from "@/components/ui/skeleton"
import { durationFormat, durationText, kindText, statusGroupOf, telHref } from "@/lib/fieldTypes/kindsMore"
import { chipsTinted, optionChip, tintedFields } from "@/components/table/optionChip"
import { showFormulaValue } from "@/lib/tables/formula"
import { cellValid, dayOf, formatNumber, leadLine, numberFormatOf, safeHref, urlHost } from "@/lib/tables/cellFormat"
import { shortDate } from "@/lib/utils/date/shortDate"
import { typedNumberText } from "@/lib/format/number"
import { rowLines, type RowHeight } from "@/lib/tables/display"
import { HUE_CLASS } from "@/components/ui/graphics/hues"
import { formatLocale } from "@/lib/tables/numberFormat"
import { fieldKind } from "@/lib/fieldTypes/registry"
import { iconMarkup } from "@/lib/iconMarkup"

/** A select option the grid knows, by its label: for chips a formula's result can borrow. */
export type OptionIndex = Map<string, { color?: string; tinted: boolean }>

export function optionIndexOf(fields: TableField[]): OptionIndex {
  const out: OptionIndex = new Map()
  const tintedIds = tintedFields(fields)
  for (const f of fields) {
    if (!fieldKind(f.type).options) continue
    const tinted = tintedIds.has(f.id)
    for (const o of optionsOf(f)) if (!out.has(o.label)) out.set(o.label, { color: o.color, tinted })
  }
  return out
}

/** What every cell in a grid shares. */
export interface CellContext {
  options: OptionIndex
  /** The columns whose chips are tinted (optionChip tintedFields); without it, each column's own say. */
  tinted?: Set<string>
  rowHeight: RowHeight
  /** Opens a column's menu at its formula, or a rollup's settings (from an error's card). */
  onEditField?: (fieldId: string) => void
  /** In the record panel: values read from the left, as a form does. */
  panel?: boolean
  /** The table the cells are of (a files cell stores and opens its files there). */
  tableId?: string
  /** A link cell's face at rest: a chunk of its own, for tables with link fields (DataTableGrid's RelationFaces); till it lands, the cell holds its place empty. */
  relationFaces?: typeof RelationFace | null
}

export const CELL_PAD = "px-3"

export const FOCUS = "outline-none"

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
export function chipRoom(ctx: CellContext, multi: boolean): { max: number; wrap: boolean } {
  if (ctx.panel) return { max: Infinity, wrap: true }
  const tall = ctx.rowHeight === "tall" || ctx.rowHeight === "xtall"
  return { max: tall ? 8 : multi ? 2 : 1, wrap: tall }
}

/**
 * A checkbox cell's markup: CheckboxCell's, and the grid's at rest (live
 * absent: the grid brings it to life before a click reaches it). A label as
 * big as the cell, so a click or a tap anywhere in it ticks the box, as every
 * cell takes one (TAB-BUG-15): the 16 px box alone did. Pure.
 */
export function checkboxMarkup({
  label,
  checked,
  cellId,
  readOnly,
  start,
  pop,
  live,
}: {
  label: string
  checked: boolean
  cellId: string
  readOnly?: boolean
  start?: boolean
  pop?: boolean
  live?: { onChange: (e: React.ChangeEvent<HTMLInputElement>) => void; onAnimationEnd: () => void }
}) {
  return (
    <label className={cn("flex h-full items-center", start ? "px-3" : "justify-center", !readOnly && "cursor-pointer")}>
      <input
        type="checkbox"
        data-cell={cellId}
        data-rest={live || readOnly ? undefined : ""}
        checked={checked}
        disabled={readOnly}
        readOnly={!live}
        onChange={live?.onChange}
        onAnimationEnd={live?.onAnimationEnd}
        aria-label={label}
        className={cn("v3-check", pop && "animate-spring")}
      />
    </label>
  )
}

/** A select's chosen labels, as its cell holds them. */
export function chosenOf(field: TableField, value: unknown): string[] {
  if (field.type === "multi_select") return Array.isArray(value) ? (value as string[]) : []
  return typeof value === "string" && value ? [value] : []
}

/**
 * A select's chips and the button they sit in: SelectCell's trigger, and the
 * grid's cell at rest (live false: the grid brings it to life before a click
 * or a key reaches it). Neutral chips unless the column opted into tints; a
 * status is the task status lozenge (STEP5 spec E), always on its hue's tint.
 * Pure.
 */
export function selectMarkup({
  field,
  selected,
  cellId,
  readOnly,
  ctx,
  options,
  live = false,
}: {
  field: TableField
  selected: string[]
  cellId: string
  readOnly?: boolean
  ctx: CellContext
  options: ReturnType<typeof optionsOf>
  live?: boolean
}) {
  const multi = field.type === "multi_select"
  const status = field.type === "status"
  const tinted = status || (ctx.tinted ? ctx.tinted.has(field.id) : chipsTinted(field))
  const { max: maxChips, wrap } = chipRoom(ctx, multi)
  const shown = selected.slice(0, maxChips)
  const more = selected.length - shown.length
  const body = (
    <span className={cn("flex min-w-0 flex-1 items-center gap-1", wrap ? "flex-wrap content-start py-2" : "overflow-hidden")}>
      {shown.map((label) => {
        const o = options.find((x) => x.label === label)
        return (
          <React.Fragment key={label}>
            {optionChip({ label, color: o?.color, tinted, group: status && o ? statusGroupOf(o) : undefined, className: ctx.rowHeight === "short" ? "h-5" : undefined })}
          </React.Fragment>
        )
      })}
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
    <button
      type="button"
      data-cell={cellId}
      data-rest={live ? undefined : ""}
      aria-label={`${field.name}: ${selected.length ? selected.join(", ") : "none chosen"}`}
      className={cn("flex h-full w-full items-center text-left", CELL_PAD, FOCUS)}
    >
      {body}
    </button>
  )
}

/**
 * A date cell's day and the button it sits in: DateCell's trigger, and the
 * grid's cell at rest (live false). "7 Oct", with the year only when it isn't
 * this one; overdue in danger-ink when the column's format says it is a due
 * date; a calendar glyph at the right edge on hover. Pure.
 */
export function dateMarkup({ field, text: saved, cellId, readOnly, live = false }: { field: TableField; text: string; cellId: string; readOnly?: boolean; live?: boolean }) {
  const day = dayOf(saved)
  const due = parseFieldConfig(field).due === true
  const overdue = due && !!day && day < new Date(new Date().toDateString())
  const text = <span className={cn("min-w-0 truncate tabular-nums", overdue && "text-danger-ink")}>{day ? shortDate(day) : ""}</span>
  if (readOnly) {
    return (
      <div data-cell={cellId} tabIndex={-1} className={cn("flex h-full items-center text-ui", CELL_PAD, FOCUS)}>
        {text}
      </div>
    )
  }
  return (
    <button
      type="button"
      data-cell={cellId}
      data-rest={live ? undefined : ""}
      aria-label={`${field.name}: ${day ? shortDate(day) : "no date"}`}
      className={cn("group/date flex h-full w-full items-center gap-1.5 text-left text-ui", CELL_PAD, FOCUS)}
    >
      {text}
      {iconMarkup(CalendarDays, {
        "aria-hidden": true,
        className:
          "pointer-events-none ml-auto size-3.5 shrink-0 text-ink-3 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible/date:opacity-100 group-data-[state=open]/date:opacity-100 [@media(hover:none)]:opacity-100",
      })}
    </button>
  )
}

/** A number as the grid shows it at rest, in the reader's format; null when the text is not one number. */
export function groupedNumber(text: string): string | null {
  const t = text.trim()
  if (t === "" || !/^-?\d*\.?\d+(e[+-]?\d+)?$/i.test(t)) return null
  const n = Number(t)
  return Number.isFinite(n) ? formatLocale(n, { maximumFractionDigits: 6 }) : null
}

/** A person's initials avatar at 20 px, in their hue. Pure markup. */
export function personDot(name: string) {
  const hue = personHue(name)
  const initial = name.trim().charAt(0).toUpperCase()
  return (
    <span aria-hidden="true" className={cn(HUE_CLASS[hue], "avatar-person inline-flex size-5 shrink-0 items-center justify-center rounded-[10px] text-micro font-semibold text-white")}>
      {initial}
    </span>
  )
}

/** Whether text holds a line break, which only a text area keeps: an input drops it. */
export const hasBreak = (text: string) => /[\r\n]/.test(text)

/**
 * A text at rest, in a row that shows `lines` of it ("all" in the record): one
 * whole line ending in "…" where it's cut or where more lines follow, or its
 * lines clamped the same way. Text's cells and long text's, so neither draws a
 * line its row cuts through.
 */
export function linesFace(text: string, lines: 1 | 2 | 4 | "all", className?: string) {
  if (lines === 1) {
    const { line, more } = leadLine(text)
    return (
      <span className={cn("min-w-0 truncate", className)}>
        {line}
        {more ? "…" : null}
      </span>
    )
  }
  return <span className={cn("min-w-0 whitespace-pre-wrap break-words", lines === 2 ? "line-clamp-2" : lines === 4 ? "line-clamp-4" : null, className)}>{text}</span>
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
 * saves; Shift+Enter or Alt+Enter adds a line. In the grid it shows at rest
 * one whole line, with "…" where it goes on (its lines, clamped, in tall
 * rows: linesFace) and grows over the rows below while it's edited; in the
 * record panel it's as tall as its lines. A URL, an email
 * or a person holding a line break is edited the same way, whole, and says
 * "Edit in full".
 *
 * A number is read in the reader's locale, with a currency sign before or
 * after; text that isn't a number is refused, never saved as another number
 * or as nothing: the cell keeps its value, ringed, and says "Not a number"
 * (TAB-BUG-8).
 */
/** A cell's text box, opened from the cell: its text selected, as the grid's moves leave it. */
export function openBox(cell: HTMLElement) {
  const box = cell.querySelector<HTMLInputElement | HTMLTextAreaElement>("[data-cell]")
  box?.focus()
  box?.select()
}

/** A text-like cell's text as its row holds it: a number's digits as typed, a duration as its clock. */
export function savedTextOf(field: TableField, value: unknown): string {
  if (field.type === "number") return typedNumberText(value)
  if (field.type === "duration" && typeof value === "number") return durationText(value, durationFormat(field))
  return value == null ? "" : String(value)
}

/**
 * What a text-like cell's text reads as: what a save would send, whether it
 * is valid, and what reads over the box at rest (a number in its format, a
 * link's host, a person's face). TextCell's, while typed in, and the grid's
 * cell at rest. Pure.
 */
export function textLook(field: TableField, local: string, savedText: string, ctx: CellContext) {
  const type = field.type
  const isNumber = type === "number"
  // A duration's seconds read and are typed as a clock, in the field's format.
  const duration = type === "duration"
  // What a save sends: the text read as the field's kind reads what's typed
  // (a number column's in the reader's signs), null when it isn't one.
  const parsed = fieldKind(type).parse?.(local, field) ?? { value: local }
  const typed = "value" in parsed ? parsed.value : null
  const notNumber = "error" in parsed
  // Text's lines, and a URL's, an email's or a person's when it holds a break.
  const lines = !isNumber && !duration && (type === "text" || hasBreak(savedText))
  const tall = ctx.rowHeight === "tall" || ctx.rowHeight === "xtall"
  const fmt = isNumber ? numberFormatOf(field) : null
  const num = !duration && typeof typed === "number" ? formatNumber(typed, fmt ?? {}) : null
  const invalid = notNumber || ((type === "url" || type === "email") && !lines && !cellValid(type, local))
  const href = lines
    ? null
    : type === "url"
      ? safeHref(local)
      : type === "email" && local.trim() && !invalid
        ? `mailto:${local.trim()}`
        : type === "phone" && !invalid
          ? telHref(local)
          : null
  const title = invalid
    ? isNumber
      ? "Not a number"
      : "error" in parsed
        ? parsed.error
        : type === "url"
          ? "This isn't a web address"
          : "This isn't an email address"
    : undefined

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
    // In the grid a text reads at rest as a long text; the panel shows every line.
    if (!ctx.panel && local.trim() && type !== "text" && type !== "long_text") {
      atRest = (
        <span className="flex min-w-0 items-center gap-2">
          <span className="truncate">{local}</span>
          <span className="shrink-0 text-meta text-ink-3">Edit in full</span>
        </span>
      )
    } else if (!ctx.panel && local.trim()) {
      atRest = linesFace(local, rowLines(ctx.rowHeight))
    }
  } else if (type === "url" && local.trim()) {
    atRest = (
      <span className="flex min-w-0 items-center gap-1">
        <span className={cn("truncate", href && "text-brand-text group-hover/cell:underline")}>{urlHost(local)}</span>
        {href ? (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            tabIndex={-1}
            aria-label={`Open ${urlHost(local)}`}
            className="pointer-events-auto shrink-0 text-ink-3 opacity-0 transition-opacity hover:text-ink group-hover/cell:opacity-100 group-focus-within/cell:opacity-100 [@media(hover:none)]:opacity-100 [@media(hover:none)]:pointer-events-auto"
          >
            {iconMarkup(ArrowUpRight, { className: "size-3" })}
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
            {iconMarkup(Mail, { className: "size-3" })}
          </a>
        ) : null}
      </span>
    )
  } else if (type === "phone" && local.trim()) {
    // As typed, tabular; a 28px call button at its edge, never a click on the cell (STEP5 spec E).
    atRest = (
      <span className="flex min-w-0 flex-1 items-center gap-1">
        <span className="min-w-0 flex-1 truncate tabular-nums text-ink">{local}</span>
        {href ? (
          <a
            href={href}
            tabIndex={-1}
            aria-label={`Call ${local}`}
            data-call-button=""
            className="pointer-events-auto -mr-1.5 inline-flex size-7 shrink-0 items-center justify-center rounded-md text-ink-3 opacity-0 transition-opacity hover:bg-hover hover:text-ink group-hover/cell:opacity-100 group-focus-within/cell:opacity-100 [@media(hover:none)]:opacity-100 [@media(hover:none)]:pointer-events-auto"
          >
            {iconMarkup(Phone, { className: "size-3.5" })}
          </a>
        ) : null}
      </span>
    )
  } else if (type === "person" && local.trim()) {
    atRest = (
      <span className="flex min-w-0 items-center gap-1.5">
        {personDot(local)}
        <span className="truncate">{local}</span>
      </span>
    )
  }
  return { type, isNumber, duration, typed, notNumber, lines, tall, invalid, title, atRest }
}

/** What a live text cell (TextCell) adds to its markup: its box's handlers and state. */
export interface TextLive {
  area: React.RefObject<HTMLTextAreaElement | null>
  /** The box holds typing of its own, which Escape puts back. */
  own: boolean
  onArea: (e: React.ChangeEvent<HTMLTextAreaElement>) => void
  onAreaFocus: (e: React.FocusEvent<HTMLTextAreaElement>) => void
  onAreaBlur: (e: React.FocusEvent<HTMLTextAreaElement>) => void
  onAreaKey: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void
  onInput: (e: React.ChangeEvent<HTMLInputElement>) => void
  onInputBlur: () => void
  onInputKey: (e: React.KeyboardEvent<HTMLInputElement>) => void
}

/**
 * A text-like cell's markup: its box, and what reads over it at rest. Live
 * (TextCell) with its handlers; without them, the grid's cell at rest, a
 * read-only box the grid brings to life before a click or a key reaches it
 * (DataTableGrid's rest cells). The same markup either way, so nothing moves
 * as a cell comes to life. Pure.
 */
export function textMarkup({
  field,
  cellId,
  primary,
  readOnly,
  ctx,
  local,
  look,
  live,
}: {
  field: TableField
  cellId: string
  primary?: boolean
  readOnly?: boolean
  ctx: CellContext
  local: string
  look: ReturnType<typeof textLook>
  live?: TextLive
}) {
  const { type, isNumber, duration, lines, tall, invalid, title, atRest } = look
  const cover = atRest !== null
  if (readOnly) {
    return (
      <div
        data-cell={cellId}
        tabIndex={-1}
        className={cn("flex h-full items-center text-ui", CELL_PAD, FOCUS, primary && "font-medium", (isNumber || duration) && "justify-end")}
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
    (isNumber || duration) && (ctx.panel ? "tabular-nums" : "text-right tabular-nums"),
    cover && "text-transparent focus:text-foreground",
  )
  const rest = live ? undefined : ""
  return (
    <div
      // A tap anywhere in the cell, on a touch screen, where the text box
      // ignores taps until it has the focus (table.css), opens the box. The
      // cell can hold the focus itself, selected but shut (a face's jump;
      // the grid's keys open it).
      tabIndex={-1}
      data-cell-box=""
      onClick={live ? (e) => e.target === e.currentTarget && openBox(e.currentTarget) : undefined}
      className={cn("group/cell relative h-full outline-none", invalid && "ring-1 ring-inset ring-destructive")}
      title={title}
    >
      {lines ? (
        <textarea
          ref={live?.area}
          rows={1}
          data-cell={cellId}
          data-rest={rest}
          readOnly={!live}
          value={local}
          onChange={live?.onArea}
          onFocus={live?.onAreaFocus}
          onBlur={live?.onAreaBlur}
          data-escape-own={live?.own ? "" : undefined}
          onKeyDown={live?.onAreaKey}
          aria-label={field.name}
          autoComplete="off"
          spellCheck={type === "text" || type === "long_text" ? undefined : false}
          className={cn(control, "block resize-none overflow-hidden break-words", ctx.panel ? "py-2" : "py-[var(--cell-pad-y)]")}
        />
      ) : (
        <input
          type={isNumber ? "text" : type === "email" ? "email" : type === "url" ? "url" : type === "phone" ? "tel" : "text"}
          inputMode={isNumber ? "decimal" : type === "phone" ? "tel" : undefined}
          data-cell={cellId}
          data-rest={rest}
          readOnly={!live}
          value={local}
          onChange={live?.onInput}
          onBlur={live?.onInputBlur}
          data-escape-own={live?.own ? "" : undefined}
          onKeyDown={live?.onInputKey}
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
            tall && (type === "text" || type === "long_text") ? "items-start py-2.5" : "items-center",
            (isNumber || duration) && !ctx.panel && "justify-end",
            primary && "font-medium",
          )}
        >
          {atRest}
        </span>
      ) : null}
    </div>
  )
}

/** A formula's or a rollup's result, but an error, as plain markup: ComputedCell's, and the grid's cell at rest, the same. Pure. */
export function computedMarkup(field: TableField, cellId: string, ctx: CellContext, shown: Exclude<ReturnType<typeof showFormulaValue>, { kind: "error" }>) {
  const reach = { "data-cell": cellId, tabIndex: -1 } as const
  const base = cn("flex h-full items-center text-ui text-ink-2", CELL_PAD, FOCUS)
  switch (shown.kind) {
    case "blank":
      return <div {...reach} className={base} />
    case "checkbox":
      return (
        <div {...reach} className={cn(base, !ctx.panel && "justify-center")} aria-label={shown.checked ? "Yes" : "No"}>
          {shown.checked && iconMarkup(Check, { className: "size-4 text-ink-2" })}
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
            {optionChip({ label: shown.text, color: asChip?.color, tinted: asChip?.tinted ?? false })}
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

/**
 * A cell at rest, as plain markup (tables T6b): what the grid draws for
 * every cell but the one in use, so a row entering the window renders as one
 * component rather than one a cell and more (44 a row of the fluidity
 * table's 13 fields). Each kind draws through its live cell's own markup, so
 * nothing moves as a cell comes to life; the grid brings one to life (Cell)
 * as the pointer goes down on it, a click reaches it, or a key would type in
 * it (DataTableGrid). A cell to bring to life carries data-rest. Null: a
 * kind drawn only live (a formula's error, people, ratings, long text, files
 * and what a row says of itself).
 */
export function restCell({ field, value, cellId, primary, readOnly, ctx }: Omit<CellProps, "onCommit" | "onLink">): React.ReactNode | null {
  if (field.type === "formula" || field.type === "rollup") {
    const shown = showFormulaValue(value, computedOf(field).result, numberFormatOf(field))
    return shown.kind === "error" ? null : computedMarkup(field, cellId, ctx, shown)
  }
  if (field.type === "checkbox") return checkboxMarkup({ label: field.name, checked: !!value, cellId, readOnly, start: ctx.panel })
  if (isFromRow(field) || field.type === "rating" || field.type === "people" || field.type === "long_text" || field.type === "attachment") return null
  if (fieldKind(field.type).options) return selectMarkup({ field, selected: chosenOf(field, value), cellId, readOnly, ctx, options: optionsOf(field) })
  if (field.type === "relation") {
    const { target, tableName } = relationOf(field)
    const refs = Array.isArray(value) ? (value as RelationRef[]) : []
    const fixed = readOnly || (target === "table" && !tableName)
    const people = target === "user"
    const faces = ctx.relationFaces
    return (
      <div data-cell={cellId} tabIndex={-1} data-rest={fixed ? undefined : ""} className={cn("h-full", FOCUS)}>
        {faces ? (
          faces.relationMarkup({ refs, room: chipRoom(ctx, true), readOnly: fixed, people, add: fixed ? null : faces.relationAdd(refs, people) })
        ) : refs.length > 0 ? (
          // A linked cell never reads as unlinked while its chips' chunk comes (DB-29): a pill where they will be.
          <div className="flex h-full items-center px-3">
            <div className={cn(skeletonClass(), "h-[22px] w-16")} data-relation-wait="" />
          </div>
        ) : null}
      </div>
    )
  }
  if (field.type === "date") return dateMarkup({ field, text: typeof value === "string" ? value : "", cellId, readOnly })
  const savedText = savedTextOf(field, value)
  return textMarkup({ field, cellId, primary, readOnly, ctx, local: savedText, look: textLook(field, savedText, savedText, ctx) })
}

/** A cell while the live cells' chunk is on its way, for a kind with no face at rest: its text, where the cell will be. Pure. */
export function waitFace({ field, value, cellId }: { field: TableField; value: unknown; cellId: string }) {
  const text = kindText(field, value) ?? (typeof value === "string" ? leadLine(value).line : "")
  return (
    <div data-cell={cellId} tabIndex={-1} className={cn("flex h-full items-center truncate text-ui text-ink-2", CELL_PAD, FOCUS)}>
      {text}
    </div>
  )
}
