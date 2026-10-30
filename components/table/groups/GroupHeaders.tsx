"use client"

// A grouped view's headers (tables V2b): the group's value, how many rows it
// holds and, in the grid, its totals under the summary bar's columns. One
// button opens or collapses the group. A chunk of its own (DataTableGrid's
// GroupPart): a table that doesn't group never loads it.

import * as React from "react"
import { Check, ChevronRight } from "@/lib/icons"
import { cn } from "@/lib/utils/helpers/cn"
import { ix } from "@/lib/ui/interactive"
import { optionChip } from "@/components/table/optionChip"
import { statusGroupOf } from "@/lib/fieldTypes/kindsMore"
import { filterKind } from "@/lib/fieldTypes/registry"
import { defaultSummary, summarizeServed, summarizeValues, type Summary } from "@/lib/tables/summary"
import { formatLocale } from "@/lib/tables/numberFormat"
import type { SummaryFn } from "@/lib/tables/display"
import { groupLabel, type GroupLayout, type GroupOf } from "@/lib/tables/groups"
import type { GroupRule } from "@/lib/tables/viewRules"
import { alignsRight, optionsOf, parseRowValues, type TableField, type TableRow } from "@/services/tableService"

export { groupedBody, toggleShut } from "@/lib/tables/groups"

/** What a grouped grid's body draws its headers with: its places, this chunk, the levels and a header's totals. */
export interface GroupBody {
  layout: GroupLayout
  heads: typeof import("@/components/table/groups/GroupHeaders")
  levels: GroupRule[]
  all: TableField[]
  summary?: Record<string, SummaryFn>
  held?: TableRow[]
  onToggle: (path: string[]) => void
  px: number
  partial?: boolean
}

/** A header's height, whatever the rows' height: a touch screen's is a finger's. */
export const headerPx = (touch: boolean) => (touch ? 44 : 40)

// Each row's values, read once while the row is the same object: a commit
// writes one row again, and its group's totals read the rest from here.
const read = new WeakMap<TableRow, Record<string, unknown>>()
function valuesOf(row: TableRow): Record<string, unknown> {
  let v = read.get(row)
  if (!v) read.set(row, (v = parseRowValues(row)))
  return v
}

interface HeaderProps {
  group: GroupOf
  depth: number
  shut: boolean
  levels: GroupRule[]
  /** Every field of the table: the one a level groups by may be hidden. */
  all: TableField[]
  onToggle: (path: string[]) => void
  /** Only part of the table is loaded (Grouping.partial): the count is of the group's rows loaded, and says so. */
  partial?: boolean
}

/** The group's value as its header shows it: a choice's chip in its own hue, a tick, or its words. */
function Face({ field, value, granularity }: { field: TableField | undefined; value: string; granularity?: GroupRule["granularity"] }) {
  const label = field ? groupLabel(field, value, granularity) : value
  if (field && value && (field.type === "select" || field.type === "status")) {
    const o = optionsOf(field).find((x) => x.label === value)
    return optionChip({ label, color: o?.color, tinted: true, group: field.type === "status" && o ? statusGroupOf(o) : undefined })
  }
  return (
    <span className={cn("inline-flex min-w-0 items-center gap-1.5 truncate text-ui-sm font-medium", value ? "text-ink" : "text-ink-3")}>
      {field && filterKind(field) === "checkbox" ? (
        <span
          aria-hidden="true"
          className={cn(
            "inline-grid size-3.5 shrink-0 place-content-center rounded-[4px]",
            value === "true" ? "bg-[var(--camp-moss)] text-white" : "bg-raised ring-[1.5px] ring-inset ring-line-3",
          )}
        >
          {value === "true" ? <Check className="size-2.5" strokeWidth={3} /> : null}
        </span>
      ) : null}
      <span className="truncate">{label}</span>
    </span>
  )
}

/** The header's button: its chevron, the group's value and its count. Opens or collapses the group. */
function Toggle({ group, depth, shut, levels, all, onToggle, partial }: HeaderProps) {
  const rule = levels[depth - 1]
  const field = all.find((f) => f.id === rule?.field)
  const value = group.key[depth - 1]
  const n = formatLocale(group.count, {})
  // Of a table loaded in part, the group's rows loaded, never read as all of its rows (the rules bar says how much is loaded).
  const count = partial ? `${n} loaded` : `${n} ${group.count === 1 ? "row" : "rows"}`
  return (
    <button
      type="button"
      aria-expanded={!shut}
      aria-label={`${shut ? "Expand" : "Collapse"} ${field?.name ?? ""}: ${field ? groupLabel(field, value, rule.granularity) : value}, ${count}`}
      onClick={() => onToggle(group.key)}
      {...ix("row")}
      // Each level steps in, so a subgroup reads as inside its group.
      style={{ paddingLeft: 8 + (depth - 1) * 16 }}
      className="group/head flex h-full w-full min-w-0 items-center gap-2 pr-2 text-left outline-none focus-visible:focus-halo"
    >
      <ChevronRight
        aria-hidden="true"
        className={cn("size-3.5 shrink-0 text-ink-3 transition-transform duration-150 group-hover/head:text-ink", !shut && "rotate-90")}
      />
      <Face field={field} value={value} granularity={rule?.granularity} />
      {/* ink-2: ink-3 on its pill over the top level's 7% band read 4.28:1 in light, under AA (DB-24). */}
      <span data-group-count="" className="shrink-0 rounded-sm bg-hover px-1.5 text-meta tabular-nums text-ink-2">
        {partial ? count : n}
      </span>
    </button>
  )
}

// A level's band: the top level's a shade deeper than its subgroups', and a
// step deeper than a row under the pointer (4%) or selected (5.5%), so a
// header never reads as a hovered row (DB-22).
const band = (depth: number) =>
  depth === 1 ? "!bg-[color-mix(in_oklab,var(--sheet),var(--ink)_7%)]" : "!bg-[color-mix(in_oklab,var(--sheet),var(--ink)_2%)]"

/**
 * A group's header in the grid: its toggle in the frozen column, and under
 * each other column its total, as the summary bar works it out: the server's
 * for a view read in windows, else of the group's rows the browser holds.
 */
export const GroupHeaderRow = React.memo(function GroupHeaderRow({
  place,
  height,
  fields,
  summary,
  held,
  ...head
}: HeaderProps & {
  place: number
  height: number
  /** The grid's columns, in order. */
  fields: TableField[]
  summary?: Record<string, SummaryFn>
  /** Every row the browser holds, in the view's order, the collapsed groups' too: group.from indexes them. */
  held?: TableRow[]
}) {
  const { group, depth } = head
  const totals = React.useMemo(
    () =>
      fields.slice(1).map((f): Summary | null => {
        if (!summary) return null
        const fn = summary[f.id] ?? defaultSummary(f)
        const served = summarizeServed(f, fn, group.summaries?.[`field:${f.id}`])
        if (served !== undefined) return served
        if (group.from === undefined || !held) return null
        const values: unknown[] = []
        for (let i = group.from; i < group.from + group.count; i++) values.push(valuesOf(held[i])[f.id])
        return summarizeValues(f, values, fn)
      }),
    [fields, summary, group, held],
  )
  const cell = cn("border-t border-line p-0 align-middle", band(depth))
  return (
    <tr data-group-header="" data-depth={depth} aria-rowindex={place + 2} style={{ height }}>
      <td data-gutter="" data-sticky-lead="" className={cell} />
      {fields.map((f, i) =>
        i === 0 ? (
          <td key={f.id} data-field={f.id} data-frozen="" data-sticky-lead="" className={cell}>
            <Toggle {...head} />
          </td>
        ) : (
          <td key={f.id} data-field={f.id} className={cell}>
            {totals[i - 1] ? (
              <span className={cn("flex items-center gap-1 truncate px-3 text-meta", alignsRight(f) && "justify-end")} title={totals[i - 1]?.title}>
                {totals[i - 1]?.label ? <span className="text-ink-3">{totals[i - 1]?.label}</span> : null}
                {/* The band's chip says its rows are the ones loaded; a screen reader hears it with each total. */}
                {head.partial ? <span className="sr-only">{` of the ${formatLocale(head.group.count, {})} loaded `}</span> : null}
                <span className="tabular-nums text-ink-2">{totals[i - 1]?.value}</span>
              </span>
            ) : null}
          </td>
        ),
      )}
      <td className={cell} />
    </tr>
  )
})

/** A group's header in the phone's list: its toggle, the width of the list. */
export function GroupHeaderItem({ place, setSize, height, ...head }: HeaderProps & { place: number; setSize: number; height: number }) {
  return (
    <li data-group-header="" aria-setsize={setSize} aria-posinset={place + 1} style={{ height }} className={band(head.depth)}>
      <Toggle {...head} />
    </li>
  )
}
