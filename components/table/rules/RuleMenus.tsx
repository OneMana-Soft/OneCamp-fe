"use client"

// The insides of the sort and filter menus above a table (content.md T05):
// the rules this reader keeps (lib/tables/viewRules), edited with custom
// selects (never the browser's own). A chunk of its own (ViewRulesBar loads
// it as Sort or Filter is reached): the table's first screen draws the
// toolbar's buttons and chips, never these.

import * as React from "react"
import { Button } from "@/components/ui/button"
import { DateField } from "@/components/ui/date-field"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Check, ChevronDown, Plus, X } from "@/lib/icons"
import { cn } from "@/lib/utils/helpers/cn"
import {
  FILTER_DEPTH,
  filterCount,
  filtersText,
  freshFilter,
  groupsBy,
  isGroup,
  MAX_FILTERS,
  ME,
  OPS_FOR,
  sortWords,
  takesMe,
  withGroups,
  type FilterEntry,
  type FilterGroup,
  type FilterRule,
  type Granularity,
  type GroupRule,
  type SortRule,
  type ViewRules,
} from "@/lib/tables/viewRules"
import { fieldKind, filterKind } from "@/lib/fieldTypes/registry"
import type { ColourFilter } from "@/lib/tables/applyRules"
import { optionsOf, type TableField } from "@/services/tableService"
import { TOUCH_ROW } from "@/components/table/TableViewFrame"
import { ix } from "@/lib/ui/interactive"

const MAX_SORTS = 3
/** Levels of groups, as a spec takes them (QuerySpec MaxGroups). */
const MAX_GROUPS = 3
const PERIODS: { value: Granularity; label: string }[] = [
  { value: "day", label: "Day" },
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
  { value: "quarter", label: "Quarter" },
  { value: "year", label: "Year" },
]

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
    const G = fieldKind(f.type).glyph
    return { value: f.id, label: f.name, icon: <G aria-hidden /> }
  })

/** A new level of groups by a field: a date's by month. */
const groupBy = (f: TableField, dir: GroupRule["dir"] = "asc"): GroupRule => (filterKind(f) === "date" ? { field: f.id, dir, granularity: "month" } : { field: f.id, dir })

/**
 * The sort menu's inside (DESIGN-BUILD-21's rulings): "Group and sort", up to
 * three levels of groups first, each a field (a date's period too) and an
 * order, then up to three sorts, which order the rows within each group.
 */
export function SortMenuBody({ fields, rules, onChange }: { fields: TableField[]; rules: ViewRules; onChange: (rules: ViewRules) => void }) {
  const groups = rules.groups ?? []
  const groupable = fields.filter(groupsBy)
  const setGroups = (next: GroupRule[]) => onChange(withGroups(rules, next))
  const setGroup = (i: number, g: GroupRule) => setGroups(groups.map((x, j) => (j === i ? g : x)))
  const unusedGroup = groupable.find((f) => !groups.some((g) => g.field === f.id))
  return (
    <>
      <h2 className="text-ui-sm font-semibold text-ink">Group and sort</h2>
      {groups.length === 0 && <p className="text-ui-sm text-ink-3">Rows aren&apos;t grouped.</p>}
      {groups.map((g, i) => {
        const field = fields.find((f) => f.id === g.field)
        const words = sortWords(field)
        return (
          <div key={i} className="flex items-center gap-1.5">
            <RuleSelect
              label={i === 0 ? "Group by" : "Then group by"}
              value={g.field}
              options={fieldOptions(groupable)}
              onChange={(v) => {
                const f = fields.find((x) => x.id === v)
                if (f) setGroup(i, groupBy(f, g.dir))
              }}
              className="flex-1"
            />
            {g.granularity ? <RuleSelect label="Period" value={g.granularity} options={PERIODS} onChange={(v) => setGroup(i, { ...g, granularity: v as Granularity })} /> : null}
            <RuleSelect
              label="Group order"
              value={g.dir}
              options={[
                { value: "asc", label: words.asc },
                { value: "desc", label: words.desc },
              ]}
              onChange={(v) => setGroup(i, { ...g, dir: v as GroupRule["dir"] })}
            />
            <Button aria-label="Remove this group" variant="ghost" size="icon-sm" className="shrink-0" onClick={() => setGroups(groups.filter((_, j) => j !== i))}>
              <X className="size-3.5" />
            </Button>
          </div>
        )
      })}
      {groups.length < MAX_GROUPS && unusedGroup && (
        <Button variant="ghost" size="sm" className="gap-1 px-2 text-ui-sm" onClick={() => setGroups([...groups, groupBy(unusedGroup)])}>
          <Plus className="size-3.5" /> {groups.length ? "Add a subgroup" : "Add a group"}
        </Button>
      )}
      <hr className="border-line" />
      <SortList fields={fields} sort={rules.sort} grouped={groups.length > 0} onChange={(sort) => onChange({ ...rules, sort })} />
    </>
  )
}

/** The menu's sorts: up to three, each a field and an order. */
function SortList({ fields, sort, grouped, onChange }: { fields: TableField[]; sort: SortRule[]; grouped: boolean; onChange: (sort: SortRule[]) => void }) {
  const set = (i: number, rule: SortRule) => onChange(sort.map((s, j) => (j === i ? rule : s)))
  const unused = fields.find((f) => !sort.some((s) => s.field === f.id))
  return (
    <>
      {sort.length === 0 && <p className="text-ui-sm text-ink-3">{grouped ? "In each group, rows are in the order they were added." : "Rows are in the order they were added."}</p>}
      {sort.map((s, i) => {
        const field = fields.find((f) => f.id === s.field)
        const dir = sortWords(field)
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
    </>
  )
}

/** The filter menu's inside: filters, each a field, a condition and a value, and groups of them, matched all or any. */
export function FilterMenuBody({ fields, rules, onChange }: { fields: TableField[]; rules: ViewRules; onChange: (rules: ViewRules) => void }) {
  return (
    <FilterList
      fields={fields}
      group={rules}
      depth={1}
      room={filterCount(rules.filters) < MAX_FILTERS}
      onChange={(g) => onChange({ ...rules, match: g.match, filters: g.filters })}
    />
  )
}

/** One list of filters: the view's own, a group's (FILTER_DEPTH deep at most), or a colour rule's. */
export function FilterList({
  fields,
  group,
  depth,
  room,
  onChange,
  onRemove,
  removeLabel = "Remove this group",
  others,
}: {
  fields: TableField[]
  group: FilterGroup
  /** 1 for the view's own list. */
  depth: number
  /** Whether another filter fits: MAX_FILTERS, every group's together. */
  room: boolean
  onChange: (group: FilterGroup) => void
  /** A group's own way out; the view's list has none. */
  onRemove?: () => void
  removeLabel?: string
  /** A colour rule's: a number or a date may be compared with another field of the row (applyRules ColourFilter). */
  others?: boolean
}) {
  const { filters } = group
  const set = (i: number, e: FilterEntry) => onChange({ ...group, filters: filters.map((f, j) => (j === i ? e : f)) })
  // A group whose last filter goes, goes with it.
  const drop = (i: number) => (onRemove && filters.length === 1 ? onRemove() : onChange({ ...group, filters: filters.filter((_, j) => j !== i) }))
  const add = (e: FilterEntry) => onChange({ ...group, filters: [...filters, e] })
  return (
    <>
      {!onRemove && filters.length === 0 && <p className="text-ui-sm text-ink-3">Every row shows.</p>}
      {(onRemove || filters.length > 1) && (
        <div className="flex items-center gap-1.5 text-ui-sm text-ink-3">
          {onRemove ? "Rows that match" : "Show rows that match"}
          <RuleSelect
            label={onRemove ? "Match in this group" : "Match"}
            value={group.match}
            options={[
              { value: "all", label: "all" },
              { value: "any", label: "any" },
            ]}
            onChange={(v) => onChange({ ...group, match: v === "any" ? "any" : "all" })}
          />
          of these
          {onRemove && (
            <Button aria-label={removeLabel} variant="ghost" size="icon-sm" className="ml-auto shrink-0" onClick={onRemove}>
              <X className="size-3.5" />
            </Button>
          )}
        </div>
      )}
      {filters.map((e, i) =>
        isGroup(e) ? (
          <div key={i} role="group" aria-label={`A group of ${filtersText(e.filters)}`} className="flex flex-col gap-1.5 rounded-xl bg-sunken/70 p-2 ring-1 ring-line max-sm:gap-2.5">
            <FilterList fields={fields} group={e} depth={depth + 1} room={room} onChange={(g) => set(i, g)} onRemove={() => drop(i)} others={others} />
          </div>
        ) : (
          <FilterRow key={i} fields={fields} rule={e} onChange={(r) => set(i, r)} onRemove={() => drop(i)} others={others} />
        ),
      )}
      {room && fields.length > 0 && (
        <div className="flex flex-wrap gap-1">
          <Button variant="ghost" size="sm" className="gap-1 px-2 text-ui-sm" onClick={() => add(freshFilter(fields[0]))}>
            <Plus className="size-3.5" /> Add a filter
          </Button>
          {depth < FILTER_DEPTH && (
            <Button variant="ghost" size="sm" className="gap-1 px-2 text-ui-sm" onClick={() => add({ match: "all", filters: [freshFilter(fields[0])] })}>
              <Plus className="size-3.5" /> Add a group
            </Button>
          )}
        </div>
      )}
    </>
  )
}

/**
 * One filter: its field, its condition, and its value; a people field's value
 * can be whoever reads the view. In a colour rule (others), a number or a
 * date may take another field's value in the same row instead: "Amount >
 * Budget".
 */
function FilterRow({ fields, rule, onChange, onRemove, others }: { fields: TableField[]; rule: FilterRule; onChange: (rule: FilterRule) => void; onRemove: () => void; others?: boolean }) {
  const field = fields.find((f) => f.id === rule.field)
  if (!field) return null
  const kind = filterKind(field)
  const ops = OPS_FOR[kind]
  const op = ops.find((o) => o.op === rule.op) ?? ops[0]
  const peers = others && op.needsValue && (kind === "number" || kind === "date") ? fields.filter((f) => f.id !== field.id && filterKind(f) === kind) : []
  const of = peers.length ? (rule as ColourFilter).of : undefined
  const options = fieldKind(field.type).options ? optionsOf(field) : []
  const people = takesMe(field)
  const box = "h-7 min-w-0 rounded-lg bg-raised text-ui-sm shadow-e1"
  const set = (value: string) => onChange({ ...rule, value })
  return (
    <div className="flex items-start gap-1.5">
      {/* The value takes the rest of the line, or a line of its own once that rest is narrower than it needs (a day's
          "Wed 30 Sep 2026" more than a word): two groups in, a phone's sheet left a date and a word a few letters wide
          (DESIGN-BUILD-20's M1). There a filter's lines sit 4px apart and filters 10px, so each reads as one
          (DESIGN-BUILD-21's SF-a). */}
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5 max-sm:gap-y-1">
        <RuleSelect
          label="Field"
          value={rule.field}
          options={fieldOptions(fields)}
          onChange={(v) => {
            const next = fields.find((f) => f.id === v)
            if (next) onChange(freshFilter(next))
          }}
          className="w-32"
        />
        <RuleSelect
          label="Condition"
          value={op.op}
          options={ops.filter((o, j) => ops.findIndex((x) => x.op === o.op) === j).map((o) => ({ value: o.op, label: o.label }))}
          onChange={(v) => onChange({ ...rule, op: v as FilterRule["op"] })}
        />
        {peers.length > 0 && (
          <RuleSelect
            label="Compare with"
            value={of ?? ""}
            options={[{ value: "", label: "a value" }, ...peers.map((f) => ({ value: f.id, label: f.name }))]}
            onChange={(v) => onChange(v ? ({ ...rule, value: "", of: v } as ColourFilter) : { field: rule.field, op: rule.op, value: "" })}
          />
        )}
        {op.needsValue && !of && (
          <span className={cn("relative grid min-w-0 grow", kind === "date" ? "basis-40" : "basis-30")}>
            {options.length > 0 ? (
              <RuleSelect label="Value" value={rule.value ?? ""} options={options.map((o) => ({ value: o.label, label: o.label }))} onChange={set} />
            ) : people && rule.value === ME ? (
              <span className={cn(box, "flex items-center justify-between pl-2 pr-1 font-medium text-brand-text")}>
                Me
                <button
                  type="button"
                  aria-label="Someone else: type a name"
                  data-touch-target=""
                  onClick={() => set("")}
                  className="rounded-md p-1 text-ink-3 hover:bg-hover hover:text-ink"
                >
                  <X className="size-3" />
                </button>
              </span>
            ) : kind === "date" ? (
              // The app's one date picker, a sheet's panel on a phone, and its way of writing a day.
              <DateField aria-label="Value" pickerTitle={field.name} value={rule.value ?? ""} onChange={set} className="h-7 rounded-lg px-2 text-ui-sm" dense />
            ) : (
              <>
                <input
                  aria-label="Value"
                  type={kind === "number" ? "number" : "text"}
                  value={rule.value ?? ""}
                  onChange={(e) => set(e.target.value)}
                  className={cn(box, "w-full px-2 text-ink outline-none focus:focus-halo", people && "pr-10")}
                />
                {people && (
                  <button
                    type="button"
                    aria-label="Me, whoever opens the view"
                    data-touch-target=""
                    onClick={() => set(ME)}
                    className="absolute inset-y-1 right-1 rounded-md px-1.5 text-ui-xs font-medium text-brand-text hover:bg-hover"
                  >
                    Me
                  </button>
                )}
              </>
            )}
          </span>
        )}
      </div>
      <Button aria-label="Remove this filter" variant="ghost" size="icon-sm" className="shrink-0" onClick={onRemove}>
        <X className="size-3.5" />
      </Button>
    </div>
  )
}
