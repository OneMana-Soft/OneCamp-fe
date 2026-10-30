"use client"

// The summary bar under a grid (content.md T14; tables T6b): one footer a
// column, each worked out again only when that column's values change
// (FooterColumns), and behind the grid (a deferred value), so a commit or a
// scroll never waits on it. A chunk of its own (DataTableGrid's SummaryPart):
// the table's first screen draws its rows without it.

import * as React from "react"
import { CircleDashed } from "lucide-react"
import { cn } from "@/lib/utils/helpers/cn"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { GROUP_STATUS } from "@/components/table/optionChip"
import { StatusGlyph } from "@/components/ui/graphics/glyphs"
import { STATUS_GROUPS } from "@/lib/fieldTypes/kindsMore"
import { SUMMARY_LABEL, defaultSummary, summarizeServed, summarizeValues, summaryChoices } from "@/lib/tables/summary"
import { FooterColumns, type FooterColumn } from "@/lib/tables/footerColumns"
import { askedOfServer } from "@/lib/tables/query"
import { formatLocale } from "@/lib/tables/numberFormat"
import type { SummaryFn } from "@/lib/tables/display"
import type { QuerySummaries } from "@/lib/querySpec/types"
import { alignsRight, computedOf, isComputed, type TableField, type TableRow } from "@/services/tableService"
import type { RefusedSums } from "@/lib/tables/types"

/**
 * The summary bar: each column's footer, worked out again only when that
 * column's values change (FooterColumns), and behind the grid (a deferred
 * value), so a commit or a scroll never waits on it.
 */
export const SummaryBar = React.memo(function SummaryBar({
  rows,
  fields,
  summary,
  loaded,
  served,
  windowed,
  refusedSums,
  sumsOut,
  onPick,
}: {
  rows: TableRow[]
  fields: TableField[]
  summary?: Record<string, SummaryFn>
  loaded?: number
  served?: QuerySummaries | null
  /** A view read in windows: a formula's or a rollup's summary is the server's alone (airtable-03). */
  windowed?: boolean
  refusedSums?: RefusedSums | null
  /** Why the server's sums aren't here, once its last re-ask left them out too (V-118): what a formula's says, never on its way for good. */
  sumsOut?: string | null
  onPick?: (fieldId: string, fn: SummaryFn) => void
}) {
  const shown = React.useDeferredValue(rows)
  const [footers] = React.useState(() => new FooterColumns())
  const ids = React.useMemo(() => fields.map((f) => f.id), [fields])
  const columns = footers.read(shown, ids)
  return (
    <tfoot className="sticky bottom-0 z-[4]">
      <tr data-summary-bar="">
        <td data-gutter="" data-sticky-lead="" className="h-[var(--grid-sum-row)] border-t border-line bg-sheet p-0" />
        {fields.map((f, i) => (
          <SummaryCell key={f.id} field={f} column={columns.get(f.id)!} frozen={i === 0} fn={summary?.[f.id] ?? defaultSummary(f)} loaded={loaded} whole={served?.[`field:${f.id}`]} waiting={served === null} serverOnly={!!windowed && isComputed(f)} refused={refusedSums?.fields.includes(`field:${f.id}`) ? refusedSums.why : (sumsOut ?? undefined)} onPick={onPick} />
        ))}
        <td className="border-t border-line bg-sheet" />
      </tr>
    </tfoot>
  )
})

/**
 * One summary cell (T14): "Sum 3,280" in meta, a menu of functions on click.
 * Of the rows loaded alone, it says so ("Sum of 500 loaded"): a 1,200-row
 * budget's Sum was of its first 500, unmarked (the W0 audit). The server's
 * of every row the view keeps (whole), once it answers the cell's function,
 * says the whole view's. Until it answers (waiting), a column it will answer
 * says "Sum …": the loaded rows' partial, then the whole, jumped (DB-22).
 */
const SummaryCell = React.memo(function SummaryCell({
  field,
  column,
  frozen,
  fn,
  loaded,
  whole,
  waiting,
  serverOnly,
  refused,
  onPick,
}: {
  field: TableField
  column: FooterColumn
  frozen: boolean
  fn: SummaryFn
  loaded?: number
  whole?: Record<string, unknown>
  waiting?: boolean
  /** A formula's or a rollup's in a view read in windows: the server's over every row, or why not; never its loaded rows' (airtable-03). */
  serverOnly?: boolean
  /** The server's words for why it won't work this column's out. */
  refused?: string
  onPick?: (fieldId: string, fn: SummaryFn) => void
}) {
  const served = React.useMemo(() => summarizeServed(field, fn, whole), [field, fn, whole])
  // Not the server's: why, in its words (or the formula's error, which nothing works out).
  const why = served === undefined && serverOnly ? (refused ?? computedOf(field).error) : undefined
  // Only a summary asked of the server waits for it (a formula's, in a view read in windows). One never asked, as a status's counts by group or a sum its formula no longer offers, is the loaded rows'.
  const pending = served === undefined && !why && (!!waiting || !!serverOnly) && askedOfServer(field, fn)
  const result = React.useMemo(
    () =>
      served !== undefined
        ? served
        : why
          ? { label: SUMMARY_LABEL[fn], value: "–" }
          : pending
            ? { label: SUMMARY_LABEL[fn], value: "…", title: "Being worked out over every row" }
            : summarizeValues(field, column.values, fn),
    [served, why, pending, field, column, fn],
  )
  const numeric = alignsRight(field)
  const partial = result && served === undefined && !pending && !why && loaded !== undefined ? `${result.label || SUMMARY_LABEL[fn]} of ${formatLocale(loaded, {})} loaded` : null
  const label = partial ?? result?.label
  const [cell, step] = usePartialStep(partial, result?.value)
  // Where the partial's words aren't all shown, the app's tip says them (DB-29), above the bar.
  const tip = why ?? (partial && step !== "words" ? partial : undefined)
  // A status counts its rows by group, each count after its group's glyph (STEP5 spec E).
  const groups = result?.groups ?? null
  // In a narrow column the words give way (an ellipsis), the value never: the cell lays out from the right, so words
  // that didn't were cut at the column's left edge ("Sum of 500 loaded" in a number's 128 px, V-48).
  const body = result ? (
    <>
      {partial && step === "mark" ? (
        <CircleDashed className="size-3 shrink-0 text-ink-3" aria-hidden="true" data-partial-mark="" />
      ) : label ? (
        <span className="min-w-0 truncate text-ink-3">{partial && step === "loaded" ? LOADED : label}</span>
      ) : null}{" "}
      {groups ? (
        <span className="inline-flex shrink-0 items-center gap-2 tabular-nums text-ink-2" title={result.title} data-sum-value="">
          {STATUS_GROUPS.map((g) => (
            <span key={g} className="inline-flex items-center gap-1">
              <StatusGlyph status={GROUP_STATUS[g]} size={12} />
              {formatLocale(groups[g], {})}
            </span>
          ))}
        </span>
      ) : (
        <span className="shrink-0 tabular-nums text-ink-2" title={result.title} data-sum-value="">
          {result.value}
        </span>
      )}
    </>
  ) : (
    <span className="text-ink-3 opacity-0 transition-opacity group-hover/sum:opacity-100 group-focus-within/sum:opacity-100 [@media(hover:none)]:opacity-100 [@media(hover:none)]:pointer-events-auto">Summarise</span>
  )
  return (
    <td ref={cell} data-frozen={frozen || undefined} data-sticky-lead={frozen || undefined} className="group/sum h-[var(--grid-sum-row)] border-t border-line bg-sheet p-0">
      {onPick ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label={`${field.name} summary: ${result ? `${label} ${result.value}` : "none"}${why ? `. ${why}` : ""}`}
              data-tip={tip}
              className={cn("flex h-[var(--grid-sum-row)] w-full items-center gap-1 truncate px-3 text-meta hover:bg-hover", numeric && "justify-end", tip && "tip-above", tip && numeric && "tip-end")}
            >
              {body}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align={numeric ? "end" : "start"} side="top" className="content-float w-44 rounded-xl p-1 shadow-e3">
            {/* By touch there's no tip: the menu's first line says what the cell's sum is of. */}
            {partial || why ? <DropdownMenuLabel className="text-meta font-normal text-ink-3">{partial ?? why}</DropdownMenuLabel> : null}
            {(["none", ...summaryChoices(field)] as SummaryFn[]).map((s) => (
              <DropdownMenuItem key={s} onSelect={() => onPick(field.id, s)} className={cn(s === fn && "font-medium text-ink")}>
                {SUMMARY_LABEL[s]}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : (
        <span data-tip={tip} className={cn("flex h-[var(--grid-sum-row)] items-center gap-1 truncate px-3 text-meta", numeric && "justify-end", tip && "tip-above", tip && numeric && "tip-end")}>
          {body}
        </span>
      )}
    </td>
  )
})

/** What a partial says where its words don't fit (DB-29). */
const LOADED = "Loaded"

/**
 * How much of a partial's words ("Sum of 500 loaded") fit whole beside its
 * value in the cell, checked again as the column's width changes: all of
 * them, or "Loaded" (DB-29: an ellipsis took exactly the words that say it's
 * partial, and "Sum o… 231,250" read as the whole), or, where even that can't
 * sit whole (beside an 8-digit sum in a number's 128 px), a mark. Text is
 * never cut; the cell's name and its tip keep the words.
 */
function usePartialStep(words: string | null, value: string | undefined) {
  const cell = React.useRef<HTMLTableCellElement>(null)
  const [step, setStep] = React.useState<"words" | "loaded" | "mark">("words")
  React.useLayoutEffect(() => {
    const box = cell.current?.firstElementChild
    if (!words || !(box instanceof HTMLElement)) return
    const check = () => {
      // Not laid out (hidden): nothing to tell.
      if (!box.clientWidth) return
      const s = getComputedStyle(box)
      const sum = box.querySelector<HTMLElement>("[data-sum-value]")?.offsetWidth ?? 0
      const room = box.clientWidth - parseFloat(s.paddingLeft) - parseFloat(s.paddingRight) - (parseFloat(s.columnGap) || 0) - sum
      // From its parts: the font shorthand can read "" in some engines, and a canvas then measures in 10px sans-serif.
      const font = `${s.fontStyle} ${s.fontWeight} ${s.fontSize} ${s.fontFamily}`
      setStep(textWidth(words, font) <= room ? "words" : textWidth(LOADED, font) <= room ? "loaded" : "mark")
    }
    check()
    const sized = new ResizeObserver(check)
    sized.observe(box)
    return () => sized.disconnect()
  }, [words, value])
  return [cell, step] as const
}

let pen: CanvasRenderingContext2D | null | undefined
/** A text's width in a font, measured without laying it out. */
function textWidth(text: string, font: string): number {
  pen ??= document.createElement("canvas").getContext("2d")
  if (!pen) return 0
  pen.font = font
  return pen.measureText(text).width
}
