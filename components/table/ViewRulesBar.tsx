"use client"

// Sort and filter above a table's grid, board and calendar (content.md T05):
// the rules this reader keeps for the table (lib/tables/viewRules), shown as
// chips in the toolbar, edited in a pop with custom selects (never the
// browser's own), and how many rows show.

import * as React from "react"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Skeleton } from "@/components/ui/skeleton"
import { ArrowUpDown, Filter, Loader2, X } from "@/lib/icons"
import { cn } from "@/lib/utils/helpers/cn"
import { filterDepth, filtersText, isGroup, loneEntry, ME, OPS_FOR, withGroups, type FilterRule, type ViewRules } from "@/lib/tables/viewRules"
import { filterKind } from "@/lib/fieldTypes/registry"
import { formatLocale } from "@/lib/tables/numberFormat"
import type { TableField } from "@/services/tableService"
import { TableToolbar } from "@/components/table/TableViewFrame"
import { SaysLoadFailure } from "@/lib/http/loadFailure"
import { lazyView } from "@/lib/lazy/lazyView"

/**
 * The sort and filter menus' insides (rules/RuleMenus): a chunk of their own,
 * loaded as the pointer or the focus reaches Sort or Filter, never with the
 * table's first screen.
 */
const ruleMenus = lazyView(() => import("@/components/table/rules/RuleMenus"))
const warmRuleMenus = () => void ruleMenus.prefetch()
/** The menus' chunk, loaded: what a test of the menus waits for first. */
export const loadRuleMenus = () => ruleMenus.warm()

/** A menu while its chunk is on its way: a moment, the first time. */
function MenuWait() {
  return (
    <p className="flex items-center gap-1.5 text-ui-sm text-ink-3" role="status">
      <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> Opening…
    </p>
  )
}

/** A rule as the toolbar shows it: a chip with an × to drop it; a wide one is cut only where the row ends. */
function RuleChip({ children, onOpen, onRemove, removeLabel, wide }: { children: React.ReactNode; onOpen: () => void; onRemove: () => void; removeLabel: string; wide?: boolean }) {
  return (
    <span data-rule-chip="" className={`inline-flex h-6 ${wide ? "max-w-full" : "max-w-[220px]"} items-center rounded-md bg-hover pl-2 text-ui-sm text-ink ring-1 ring-inset ring-line`}>
      <button type="button" onClick={onOpen} className="min-w-0 truncate rounded-sm">
        {children}
      </button>
      <button type="button" aria-label={removeLabel} onClick={onRemove} className="ml-0.5 inline-flex size-6 shrink-0 items-center justify-center rounded-md text-ink-3 hover:text-ink">
        <X className="size-3" />
      </button>
    </span>
  )
}

/**
 * A filter as its chip says it: "Status is Paid". One still waiting for its
 * value says so ("Item contains …"); it read "Item contains", a sentence
 * that stops.
 */
export function ruleText(rule: FilterRule, field: TableField | undefined): string {
  if (!field) return ""
  const op = OPS_FOR[filterKind(field)].find((o) => o.op === rule.op)
  const value = op?.needsValue ? (rule.value ? ` ${rule.value === ME ? "me" : rule.value}` : " …") : ""
  return `${field.name} ${op?.label ?? ""}${value}`.trim()
}

/**
 * How many rows show, as the toolbar says it; null when every row does. While
 * the page doesn't hold every row it says how many it holds, of how many
 * ("Showing 2,000 of 12,400 rows"), and when a filter or a search leaves out
 * some, that it looked only in those ("Showing 12 in the 2,000 of 12,400
 * rows loaded"). total is null when the server doesn't say. A view the server
 * answers (tables T5c) is complete: shown is its count, null until the server
 * has counted it, and atLeast when the count stopped at the server's cap.
 */
export function rowsShownText(shown: number | null, held: number, total: number | null, complete: boolean, atLeast = false, working = false): string | null {
  const n = (x: number) => formatLocale(x, {})
  // A formula the view reads still being filled (airtable-03b): no row shows
  // yet, and the size is why it waits, so the view's rows, never "Showing 0 of".
  if (working) return total === null ? null : `${n(total)} rows`
  if (shown === null) return null
  if (complete) {
    const all = total ?? held
    return shown === all && !atLeast ? null : `Showing ${n(shown)}${atLeast ? "+" : ""} of ${n(all)} rows`
  }
  const of = total === null ? "" : ` of ${n(total)}`
  return shown === held ? `Showing ${n(held)}${of} rows` : `Showing ${n(shown)} in the ${n(held)}${of} rows loaded`
}

/**
 * The widest words the count can come to say, while how many rows show isn't
 * known yet (a view's rules are on their way, or the server is counting). The
 * bar holds the count's place with them, unseen, so the count landing never
 * wraps the bar and moves the view under it. Null when no count will show:
 * every row held and no filter.
 */
export function rowsShownPlaceholder(filtered: boolean, held: number, total: number | null, complete: boolean, atLeast = false): string | null {
  if (complete && !filtered) return null
  const widest = complete ? (total ?? held) - 1 : filtered ? held - 1 : held
  return rowsShownText(Math.max(widest, 0), held, total, complete, atLeast)
}

/** The rows a page holds, when it doesn't hold them all: reading more, or the reader's way to all of them. */
export interface RowsLoading {
  reading: boolean
  failed: boolean
  /** Every row at once; none for a view read in windows, which reads them as it reaches them. */
  onLoadAll?: () => void
  onRetry: () => void
}

export function ViewRulesBar({
  fields,
  rules,
  onChange,
  shown,
  held,
  total,
  atLeast,
  working = false,
  loading,
  end,
  notice,
  noticeRetry,
}: {
  /** The table's fields, in column order. */
  fields: TableField[]
  rules: ViewRules
  onChange: (rules: ViewRules) => void
  /** How many rows the rules and the search show, of the rows the page holds; null while the server counts them. */
  shown: number | null
  held: number
  /** Every row of the table; null when the server doesn't say. */
  total: number | null
  /** shown is a count that stopped at the server's cap: there are more. */
  atLeast?: boolean
  /** The server is still filling a formula or a rollup the view reads (airtable-03b): the count says the view's rows. */
  working?: boolean
  /** Given while the page doesn't hold every row. */
  loading?: RowsLoading | null
  /** A view's own controls, at the row's end (search, fields, the calendar's month). */
  end?: React.ReactNode
  /** Why the view's groups aren't shown (the server's words). */
  notice?: string | null
  /** A notice that asking again may change: its Try again, and whether that's asking. */
  noticeRetry?: { busy: boolean; onRetry: () => void } | null
}) {
  const [sortOpen, setSortOpen] = React.useState(false)
  const [filterOpen, setFilterOpen] = React.useState(false)
  const byId = (id: string) => fields.find((f) => f.id === id)
  const active = rules.sort.length + rules.filters.length > 0 || !!rules.groups
  const count = rowsShownText(shown, held, total, !loading, atLeast, working)
  const placeholder = shown === null && !loading?.failed ? rowsShownPlaceholder(rules.filters.length > 0, held, total, !loading, atLeast) : null
  const link = "rounded-sm font-medium text-brand-text hover:underline"
  const rest = loading ? (
    loading.failed ? (
      <>
        {count ? " · Couldn't load the rest. " : "Couldn't load the rows. "}
        <SaysLoadFailure />
        <button type="button" onClick={loading.onRetry} className={link}>
          Try again
        </button>
      </>
    ) : loading.reading ? (
      " · Loading…"
    ) : loading.onLoadAll ? (
      <>
        {" · "}
        <button type="button" onClick={loading.onLoadAll} className={link}>
          Load all
        </button>
      </>
    ) : null
  ) : null
  return (
    <TableToolbar end={end}>
      <FilterMenu fields={fields} rules={rules} onChange={onChange} open={filterOpen} onOpenChange={setFilterOpen} />
      <SortMenu fields={fields} rules={rules} onChange={onChange} open={sortOpen} onOpenChange={setSortOpen} />
      {rules.groups && (
        <RuleChip wide onOpen={() => setSortOpen(true)} removeLabel="Remove the grouping" onRemove={() => onChange(withGroups(rules, []))}>
          {`Grouped by ${rules.groups.map((g) => byId(g.field)?.name).join(" › ")}`}
        </RuleChip>
      )}
      {rules.filters.map((entry, i) => {
        // A group of one says its filter: "All of 1 filter" said nothing, even while that filter hid nothing.
        const r = loneEntry(entry)
        const count = isGroup(r) ? filtersText(r.filters) : ""
        return (
          <RuleChip
            key={`f${i}`}
            onOpen={() => setFilterOpen(true)}
            removeLabel={isGroup(r) ? `Remove the group of ${count}` : `Remove the filter ${ruleText(r, byId(r.field))}`}
            onRemove={() => onChange({ ...rules, filters: rules.filters.filter((_, j) => j !== i) })}
          >
            {isGroup(r) ? `${r.match === "any" ? "Any" : "All"} of ${count}` : ruleText(r, byId(r.field))}
          </RuleChip>
        )
      })}
      {rules.sort.map((s, i) => (
        <RuleChip
          key={`s${i}`}
          onOpen={() => setSortOpen(true)}
          removeLabel={`Remove the sort by ${byId(s.field)?.name ?? ""}`}
          onRemove={() => onChange({ ...rules, sort: rules.sort.filter((_, j) => j !== i) })}
        >
          <span className="inline-flex items-center gap-1">
            <ArrowUpDown className="size-3 text-ink-3" aria-hidden="true" />
            {byId(s.field)?.name}
          </span>
        </RuleChip>
      ))}
      {active && (
        <button
          type="button"
          onClick={() => onChange({ sort: [], filters: [], match: rules.match })}
          data-touch-target=""
          className="h-6 rounded-md px-1.5 text-ui-sm text-ink-3 hover:bg-hover hover:text-ink"
        >
          Clear
        </button>
      )}
      {/* One element from the place held to the count, so the count is read out as it lands. */}
      {count || placeholder || loading?.failed ? (
        <div
          className="relative pl-1 text-meta tabular-nums text-ink-3"
          aria-live="polite"
          data-rows-shown={placeholder ? undefined : ""}
          data-rows-waiting={placeholder ? "" : undefined}
        >
          {placeholder ? (
            <>
              <span aria-hidden="true" className="invisible">
                {placeholder}
                {rest}
              </span>
              <Skeleton className="absolute left-1 right-0 top-1/2 h-2 -translate-y-1/2" />
            </>
          ) : (
            <>
              {count}
              {rest}
            </>
          )}
        </div>
      ) : null}
      {notice ? (
        <p role="status" className="order-last basis-full text-meta text-ink-3">
          {notice}
          {noticeRetry ? (
            <>
              {" "}
              {noticeRetry.busy ? (
                "Counting…"
              ) : (
                <button type="button" onClick={noticeRetry.onRetry} className={link}>
                  Try again
                </button>
              )}
            </>
          ) : null}
        </p>
      ) : null}
    </TableToolbar>
  )
}

const toolbarButton = (on: boolean) => cn("h-7 gap-1.5 px-2 text-ui-sm", on ? "text-ink" : "text-ink-2")

// Groups and sorts, in one menu (DESIGN-BUILD-21): its trigger still reads "Sort".
function SortMenu({
  fields,
  rules,
  onChange,
  open,
  onOpenChange,
}: {
  fields: TableField[]
  rules: ViewRules
  onChange: (rules: ViewRules) => void
  open: boolean
  onOpenChange: (o: boolean) => void
}) {
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          aria-label="Sort and group"
          className={toolbarButton(rules.sort.length > 0 || !!rules.groups)}
          onPointerEnter={warmRuleMenus}
          onFocus={warmRuleMenus}
        >
          <ArrowUpDown className="size-3.5" /> Sort
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="content-float w-96 max-w-[calc(100vw-2rem)] space-y-2 rounded-xl p-3 shadow-e3">
        <ruleMenus.View fallback={<MenuWait />} render={(m) => <m.SortMenuBody fields={fields} rules={rules} onChange={onChange} />} />
      </PopoverContent>
    </Popover>
  )
}

function FilterMenu({
  fields,
  rules,
  onChange,
  open,
  onOpenChange,
}: {
  fields: TableField[]
  rules: ViewRules
  onChange: (rules: ViewRules) => void
  open: boolean
  onOpenChange: (o: boolean) => void
}) {
  const { filters } = rules
  // A group insets its filters by 1rem: the menu widens 2rem for each level of
  // groups, so a filter two groups in keeps its field, condition and value on
  // one line (DESIGN-BUILD-21's M1). A phone's sheet takes the screen's width
  // whatever this says (overlay.css).
  const room = { "--filter-room": `${(filterDepth(filters) - 1) * 2}rem` } as React.CSSProperties
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className={toolbarButton(filters.length > 0)} onPointerEnter={warmRuleMenus} onFocus={warmRuleMenus}>
          <Filter className="size-3.5" /> Filter
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" style={room} className="content-float w-[calc(28rem+var(--filter-room))] max-w-[calc(100vw-2rem)] space-y-2 rounded-xl p-3 shadow-e3 max-sm:space-y-2.5">
        <ruleMenus.View fallback={<MenuWait />} render={(m) => <m.FilterMenuBody fields={fields} rules={rules} onChange={onChange} />} />
      </PopoverContent>
    </Popover>
  )
}
