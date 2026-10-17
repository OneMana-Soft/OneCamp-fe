"use client"

// Sort and filter above a table's grid, board and calendar (content.md T05):
// the rules this reader keeps for the table (lib/tables/viewRules), shown as
// chips in the toolbar, edited in a pop with custom selects (never the
// browser's own), and how many rows show.

import * as React from "react"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { ArrowUpDown, Check, ChevronDown, Filter, Plus, X } from "@/lib/icons"
import { cn } from "@/lib/utils/helpers/cn"
import { OPS_FOR, kindOfField, type FieldKind, type FilterRule, type SortRule, type ViewRules } from "@/lib/tables/viewRules"
import { formatLocale } from "@/lib/tables/numberFormat"
import { optionsOf, type TableField } from "@/services/tableService"
import { TableToolbar, TOUCH_ROW } from "@/components/table/TableViewFrame"
import { FIELD_GLYPH } from "@/components/table/gridCells"
import { ix } from "@/lib/ui/interactive"
import { SaysLoadFailure } from "@/lib/http/loadFailure"

const MAX_SORTS = 3
const MAX_FILTERS = 10

const DIRECTIONS: Record<FieldKind, { asc: string; desc: string }> = {
  text: { asc: "A → Z", desc: "Z → A" },
  list: { asc: "A → Z", desc: "Z → A" },
  number: { asc: "1 → 9", desc: "9 → 1" },
  date: { asc: "Oldest first", desc: "Newest first" },
  checkbox: { asc: "Unticked first", desc: "Ticked first" },
}

/**
 * A small custom select: a 28 px raised button that opens a pop list. The
 * browser's select drew a different box and arrow in every browser.
 */
export function RuleSelect({
  label,
  value,
  options,
  onChange,
  className,
}: {
  label: string
  value: string
  options: { value: string; label: string; icon?: React.ReactNode }[]
  onChange: (value: string) => void
  className?: string
}) {
  const [open, setOpen] = React.useState(false)
  const current = options.find((o) => o.value === value)
  const listRef = React.useRef<HTMLDivElement>(null)
  const listId = React.useId()
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          role="combobox"
          aria-label={label}
          data-touch-target=""
          aria-expanded={open}
          aria-controls={listId}
          aria-haspopup="listbox"
          className={cn(
            "inline-flex h-7 min-w-0 items-center gap-1.5 rounded-lg bg-raised px-2 text-ui-sm text-ink shadow-e1 outline-none transition-shadow hover:shadow-e2 focus-visible:focus-halo [&>svg:first-child]:size-3.5 [&>svg:first-child]:text-ink-3",
            className,
          )}
        >
          {current?.icon}
          <span className="min-w-0 flex-1 truncate text-left">{current?.label ?? "Choose…"}</span>
          <ChevronDown className="size-3.5 shrink-0 text-ink-3" aria-hidden="true" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={4}
        className="content-float w-auto min-w-[var(--radix-popover-trigger-width)] rounded-xl p-1 shadow-e3"
        onOpenAutoFocus={(e) => {
          e.preventDefault()
          listRef.current?.querySelector<HTMLElement>('[aria-selected="true"], [role="option"]')?.focus()
        }}
      >
        <div
          ref={listRef}
          id={listId}
          role="listbox"
          aria-label={label}
          className="max-h-64 overflow-y-auto"
          onKeyDown={(e) => {
            if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return
            const opts = Array.from(e.currentTarget.querySelectorAll<HTMLElement>('[role="option"]'))
            const at = opts.indexOf(document.activeElement as HTMLElement)
            const next = e.key === "ArrowDown" ? Math.min(opts.length - 1, at + 1) : Math.max(0, at - 1)
            e.preventDefault()
            opts[next]?.focus()
          }}
        >
          {options.map((o) => (
            <button
              key={o.value}
              type="button"
              role="option"
              aria-selected={o.value === value}
              onClick={() => {
                onChange(o.value)
                setOpen(false)
              }}
              {...ix("item")}
              className={cn("flex h-8 w-full items-center gap-2 rounded-lg px-2 text-left text-ui text-ink [&>svg]:size-3.5 [&>svg]:text-ink-3", TOUCH_ROW)}
            >
              {o.icon}
              <span className="min-w-0 flex-1 truncate">{o.label}</span>
              {o.value === value ? <Check className="!text-ink-2" aria-hidden="true" /> : <span className="size-3.5" />}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}

const fieldOptions = (fields: TableField[]) =>
  fields.map((f) => {
    const G = FIELD_GLYPH[f.type] ?? FIELD_GLYPH.text
    return { value: f.id, label: f.name, icon: <G aria-hidden /> }
  })

/** A rule as the toolbar shows it: a chip with an × to drop it. */
function RuleChip({ children, onOpen, onRemove, removeLabel }: { children: React.ReactNode; onOpen: () => void; onRemove: () => void; removeLabel: string }) {
  return (
    <span data-rule-chip="" className="inline-flex h-6 max-w-[220px] items-center rounded-md bg-hover pl-2 text-ui-sm text-ink ring-1 ring-inset ring-line">
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
  const op = OPS_FOR[kindOfField(field)].find((o) => o.op === rule.op)
  const value = op?.needsValue ? (rule.value ? ` ${rule.value}` : " …") : ""
  return `${field.name} ${op?.label ?? ""}${value}`.trim()
}

/**
 * How many rows show, as the toolbar says it; null when every row does. While
 * the page doesn't hold every row it says how many it holds, of how many
 * ("Showing 2,000 of 12,400 rows"), and when a filter or a search leaves out
 * some, that it looked only in those ("Showing 12 in the 2,000 of 12,400
 * rows loaded"). total is null when the server doesn't say.
 */
export function rowsShownText(shown: number, held: number, total: number | null, complete: boolean): string | null {
  const n = (x: number) => formatLocale(x, {})
  if (complete) {
    const all = total ?? held
    return shown === all ? null : `Showing ${n(shown)} of ${n(all)} rows`
  }
  const of = total === null ? "" : ` of ${n(total)}`
  return shown === held ? `Showing ${n(held)}${of} rows` : `Showing ${n(shown)} in the ${n(held)}${of} rows loaded`
}

/** The rows a page holds, when it doesn't hold them all: reading more, or the reader's way to all of them. */
export interface RowsLoading {
  reading: boolean
  failed: boolean
  onLoadAll: () => void
  onRetry: () => void
}

export function ViewRulesBar({
  fields,
  rules,
  onChange,
  shown,
  held,
  total,
  loading,
  end,
}: {
  /** The table's fields, in column order. */
  fields: TableField[]
  rules: ViewRules
  onChange: (rules: ViewRules) => void
  /** How many rows the rules and the search show, of the rows the page holds. */
  shown: number
  held: number
  /** Every row of the table; null when the server doesn't say. */
  total: number | null
  /** Given while the page doesn't hold every row. */
  loading?: RowsLoading | null
  /** A view's own controls, at the row's end (search, fields, the calendar's month). */
  end?: React.ReactNode
}) {
  const [sortOpen, setSortOpen] = React.useState(false)
  const [filterOpen, setFilterOpen] = React.useState(false)
  const byId = (id: string) => fields.find((f) => f.id === id)
  const active = rules.sort.length + rules.filters.length > 0
  const count = rowsShownText(shown, held, total, !loading)
  const link = "rounded-sm font-medium text-brand-text hover:underline"
  return (
    <TableToolbar end={end}>
      <FilterMenu fields={fields} rules={rules} onChange={onChange} open={filterOpen} onOpenChange={setFilterOpen} />
      <SortMenu fields={fields} sort={rules.sort} onChange={(sort) => onChange({ ...rules, sort })} open={sortOpen} onOpenChange={setSortOpen} />
      {rules.filters.map((r, i) => (
        <RuleChip
          key={`f${i}`}
          onOpen={() => setFilterOpen(true)}
          removeLabel={`Remove the filter ${ruleText(r, byId(r.field))}`}
          onRemove={() => onChange({ ...rules, filters: rules.filters.filter((_, j) => j !== i) })}
        >
          {ruleText(r, byId(r.field))}
        </RuleChip>
      ))}
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
      {count && (
        <span className="pl-1 text-meta tabular-nums text-ink-3" aria-live="polite" data-rows-shown="">
          {count}
          {loading ? (
            loading.failed ? (
              <>
                {" · Couldn't load the rest. "}
                <SaysLoadFailure />
                <button type="button" onClick={loading.onRetry} className={link}>
                  Try again
                </button>
              </>
            ) : loading.reading ? (
              " · Loading…"
            ) : (
              <>
                {" · "}
                <button type="button" onClick={loading.onLoadAll} className={link}>
                  Load all
                </button>
              </>
            )
          ) : null}
        </span>
      )}
    </TableToolbar>
  )
}

const toolbarButton = (on: boolean) => cn("h-7 gap-1.5 px-2 text-ui-sm", on ? "text-ink" : "text-ink-2")

function SortMenu({
  fields,
  sort,
  onChange,
  open,
  onOpenChange,
}: {
  fields: TableField[]
  sort: SortRule[]
  onChange: (sort: SortRule[]) => void
  open: boolean
  onOpenChange: (o: boolean) => void
}) {
  const set = (i: number, rule: SortRule) => onChange(sort.map((s, j) => (j === i ? rule : s)))
  const unused = fields.find((f) => !sort.some((s) => s.field === f.id))
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className={toolbarButton(sort.length > 0)}>
          <ArrowUpDown className="size-3.5" /> Sort
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="content-float w-80 space-y-2 rounded-xl p-3 shadow-e3">
        {sort.length === 0 && <p className="text-ui-sm text-ink-3">Rows are in the order they were added.</p>}
        {sort.map((s, i) => {
          const field = fields.find((f) => f.id === s.field)
          const dir = DIRECTIONS[field ? kindOfField(field) : "text"]
          return (
            <div key={i} className="flex items-center gap-1.5">
              <RuleSelect label={i === 0 ? "Sort by" : "Then by"} value={s.field} options={fieldOptions(fields)} onChange={(v) => set(i, { ...s, field: v })} className="flex-1" />
              <RuleSelect
                label="Order"
                value={s.dir}
                options={[
                  { value: "asc", label: dir.asc },
                  { value: "desc", label: dir.desc },
                ]}
                onChange={(v) => set(i, { ...s, dir: v as SortRule["dir"] })}
              />
              <Button aria-label="Remove this sort" variant="ghost" size="icon-sm" className="shrink-0" onClick={() => onChange(sort.filter((_, j) => j !== i))}>
                <X className="size-3.5" />
              </Button>
            </div>
          )
        })}
        {sort.length < MAX_SORTS && unused && (
          <Button variant="ghost" size="sm" className="gap-1 px-2 text-ui-sm" onClick={() => onChange([...sort, { field: unused.id, dir: "asc" }])}>
            <Plus className="size-3.5" /> {sort.length ? "Then by another field" : "Add a sort"}
          </Button>
        )}
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
  const set = (i: number, rule: FilterRule) => onChange({ ...rules, filters: filters.map((f, j) => (j === i ? rule : f)) })
  const fresh = (field: TableField): FilterRule => ({ field: field.id, op: OPS_FOR[kindOfField(field)][0].op, value: "" })
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className={toolbarButton(filters.length > 0)}>
          <Filter className="size-3.5" /> Filter
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="content-float w-[28rem] max-w-[calc(100vw-2rem)] space-y-2 rounded-xl p-3 shadow-e3">
        {filters.length === 0 && <p className="text-ui-sm text-ink-3">Every row shows.</p>}
        {filters.length > 1 && (
          <div className="flex items-center gap-1.5 text-ui-sm text-ink-3">
            Show rows that match
            <RuleSelect
              label="Match"
              value={rules.match}
              options={[
                { value: "all", label: "all" },
                { value: "any", label: "any" },
              ]}
              onChange={(v) => onChange({ ...rules, match: v === "any" ? "any" : "all" })}
            />
            of these
          </div>
        )}
        {filters.map((rule, i) => {
          const field = fields.find((f) => f.id === rule.field)
          if (!field) return null
          const kind = kindOfField(field)
          const ops = OPS_FOR[kind]
          const op = ops.find((o) => o.op === rule.op) ?? ops[0]
          const options = field.type === "select" || field.type === "multi_select" ? optionsOf(field) : []
          return (
            <div key={i} className="flex items-center gap-1.5">
              <RuleSelect
                label="Field"
                value={rule.field}
                options={fieldOptions(fields)}
                onChange={(v) => {
                  const next = fields.find((f) => f.id === v)
                  if (next) set(i, fresh(next))
                }}
                className="w-32"
              />
              <RuleSelect
                label="Condition"
                value={op.op}
                options={ops.filter((o, j) => ops.findIndex((x) => x.op === o.op) === j).map((o) => ({ value: o.op, label: o.label }))}
                onChange={(v) => set(i, { ...rule, op: v as FilterRule["op"] })}
              />
              {op.needsValue &&
                (options.length > 0 ? (
                  <RuleSelect
                    label="Value"
                    value={rule.value ?? ""}
                    options={options.map((o) => ({ value: o.label, label: o.label }))}
                    onChange={(v) => set(i, { ...rule, value: v })}
                    className="flex-1"
                  />
                ) : (
                  <input
                    aria-label="Value"
                    type={kind === "number" ? "number" : kind === "date" ? "date" : "text"}
                    value={rule.value ?? ""}
                    onChange={(e) => set(i, { ...rule, value: e.target.value })}
                    className="h-7 min-w-0 flex-1 rounded-lg bg-raised px-2 text-ui-sm text-ink shadow-e1 outline-none focus:focus-halo"
                  />
                ))}
              {!op.needsValue && <span className="flex-1" />}
              <Button aria-label="Remove this filter" variant="ghost" size="icon-sm" className="shrink-0" onClick={() => onChange({ ...rules, filters: filters.filter((_, j) => j !== i) })}>
                <X className="size-3.5" />
              </Button>
            </div>
          )
        })}
        {filters.length < MAX_FILTERS && fields.length > 0 && (
          <Button variant="ghost" size="sm" className="gap-1 px-2 text-ui-sm" onClick={() => onChange({ ...rules, filters: [...filters, fresh(fields[0])] })}>
            <Plus className="size-3.5" /> Add a filter
          </Button>
        )}
      </PopoverContent>
    </Popover>
  )
}
