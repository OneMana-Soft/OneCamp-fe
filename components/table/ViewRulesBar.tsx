"use client"

// Sort and filter above a table's grid, board and calendar: the rules this
// reader keeps for the table (lib/tables/viewRules), and how many rows show.

import * as React from "react"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { ArrowUpDown, Filter, Plus, X } from "@/lib/icons"
import { cn } from "@/lib/utils/helpers/cn"
import { OPS_FOR, kindOfField, type FieldKind, type FilterRule, type SortRule, type ViewRules } from "@/lib/tables/viewRules"
import { parseFieldConfig, type TableField } from "@/services/tableService"

const MAX_SORTS = 3
const MAX_FILTERS = 10

const DIRECTIONS: Record<FieldKind, { asc: string; desc: string }> = {
  text: { asc: "A → Z", desc: "Z → A" },
  list: { asc: "A → Z", desc: "Z → A" },
  number: { asc: "1 → 9", desc: "9 → 1" },
  date: { asc: "Oldest first", desc: "Newest first" },
  checkbox: { asc: "Unticked first", desc: "Ticked first" },
}

const control = "h-7 rounded-md border border-border bg-background px-1.5 text-xs"

export function ViewRulesBar({
  fields,
  rules,
  onChange,
  shown,
  total,
  truncated,
}: {
  /** The table's fields, in column order. */
  fields: TableField[]
  rules: ViewRules
  onChange: (rules: ViewRules) => void
  /** How many rows the rules show, of how many. */
  shown: number
  total: number
  /** The table has more rows than were loaded, and the rules see only these. */
  truncated: boolean
}) {
  const nameOf = (id: string) => fields.find((f) => f.id === id)?.name ?? ""
  const active = rules.sort.length + rules.filters.length > 0
  return (
    <div className="flex flex-wrap items-center gap-1.5 border-b border-border/60 px-2 py-1.5 text-xs">
      <SortMenu fields={fields} sort={rules.sort} nameOf={nameOf} onChange={(sort) => onChange({ ...rules, sort })} />
      <FilterMenu fields={fields} rules={rules} nameOf={nameOf} onChange={onChange} />
      {shown !== total && (
        <span className="text-muted-foreground" aria-live="polite">
          Showing {shown} of {total} rows
        </span>
      )}
      {active && truncated && <span className="text-muted-foreground">(of the first {total})</span>}
      {active && (
        <button
          type="button"
          onClick={() => onChange({ sort: [], filters: [], match: rules.match })}
          className="ml-auto text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
        >
          Clear
        </button>
      )}
    </div>
  )
}

function SortMenu({
  fields,
  sort,
  nameOf,
  onChange,
}: {
  fields: TableField[]
  sort: SortRule[]
  nameOf: (id: string) => string
  onChange: (sort: SortRule[]) => void
}) {
  const label = sort.length === 0 ? "Sort" : sort.length === 1 ? `Sorted by ${nameOf(sort[0].field)}` : `Sorted by ${sort.length} fields`
  const set = (i: number, rule: SortRule) => onChange(sort.map((s, j) => (j === i ? rule : s)))
  const unused = fields.find((f) => !sort.some((s) => s.field === f.id))
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant={sort.length ? "secondary" : "ghost"} size="sm" className="h-7 gap-1.5 px-2 text-xs">
          <ArrowUpDown className="h-3.5 w-3.5" /> {label}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 space-y-2 p-3">
        {sort.length === 0 && <p className="text-xs text-muted-foreground">Rows are in the order they were added.</p>}
        {sort.map((s, i) => {
          const field = fields.find((f) => f.id === s.field)
          const dir = DIRECTIONS[field ? kindOfField(field) : "text"]
          return (
            <div key={i} className="flex items-center gap-1.5">
              <select
                aria-label={i === 0 ? "Sort by" : "Then by"}
                value={s.field}
                onChange={(e) => set(i, { ...s, field: e.target.value })}
                className={cn(control, "min-w-0 flex-1")}
              >
                {fields.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
              <select
                aria-label="Order"
                value={s.dir}
                onChange={(e) => set(i, { ...s, dir: e.target.value as SortRule["dir"] })}
                className={control}
              >
                <option value="asc">{dir.asc}</option>
                <option value="desc">{dir.desc}</option>
              </select>
              <Button
                aria-label="Remove this sort"
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0"
                onClick={() => onChange(sort.filter((_, j) => j !== i))}
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          )
        })}
        {sort.length < MAX_SORTS && unused && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1 px-2 text-xs"
            onClick={() => onChange([...sort, { field: unused.id, dir: "asc" }])}
          >
            <Plus className="h-3.5 w-3.5" /> {sort.length ? "Then by another field" : "Add a sort"}
          </Button>
        )}
      </PopoverContent>
    </Popover>
  )
}

function FilterMenu({
  fields,
  rules,
  nameOf,
  onChange,
}: {
  fields: TableField[]
  rules: ViewRules
  nameOf: (id: string) => string
  onChange: (rules: ViewRules) => void
}) {
  const { filters } = rules
  const label =
    filters.length === 0 ? "Filter" : filters.length === 1 ? `Filtered by ${nameOf(filters[0].field)}` : `${filters.length} filters`
  const set = (i: number, rule: FilterRule) => onChange({ ...rules, filters: filters.map((f, j) => (j === i ? rule : f)) })
  const fresh = (field: TableField): FilterRule => ({ field: field.id, op: OPS_FOR[kindOfField(field)][0].op, value: "" })
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant={filters.length ? "secondary" : "ghost"} size="sm" className="h-7 gap-1.5 px-2 text-xs">
          <Filter className="h-3.5 w-3.5" /> {label}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[26rem] max-w-[calc(100vw-2rem)] space-y-2 p-3">
        {filters.length === 0 && <p className="text-xs text-muted-foreground">Every row shows.</p>}
        {filters.length > 1 && (
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            Show rows that match
            <select
              aria-label="Match"
              value={rules.match}
              onChange={(e) => onChange({ ...rules, match: e.target.value === "any" ? "any" : "all" })}
              className={control}
            >
              <option value="all">all</option>
              <option value="any">any</option>
            </select>
            of these
          </label>
        )}
        {filters.map((rule, i) => {
          const field = fields.find((f) => f.id === rule.field)
          if (!field) return null
          const kind = kindOfField(field)
          const ops = OPS_FOR[kind]
          const op = ops.find((o) => o.op === rule.op) ?? ops[0]
          const options = field.type === "select" || field.type === "multi_select" ? parseFieldConfig(field).options || [] : []
          return (
            <div key={i} className="flex items-center gap-1.5">
              <select
                aria-label="Field"
                value={rule.field}
                onChange={(e) => {
                  const next = fields.find((f) => f.id === e.target.value)
                  if (next) set(i, fresh(next))
                }}
                className={cn(control, "min-w-0 w-28")}
              >
                {fields.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
              <select
                aria-label="Condition"
                value={op.op}
                onChange={(e) => set(i, { ...rule, op: e.target.value as FilterRule["op"] })}
                className={control}
              >
                {ops.map((o) => (
                  <option key={o.op} value={o.op}>
                    {o.label}
                  </option>
                ))}
              </select>
              {op.needsValue &&
                (options.length > 0 ? (
                  <select
                    aria-label="Value"
                    value={rule.value ?? ""}
                    onChange={(e) => set(i, { ...rule, value: e.target.value })}
                    className={cn(control, "min-w-0 flex-1")}
                  >
                    <option value="">Choose…</option>
                    {options.map((o) => (
                      <option key={o.label} value={o.label}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    aria-label="Value"
                    type={kind === "number" ? "number" : kind === "date" ? "date" : "text"}
                    value={rule.value ?? ""}
                    onChange={(e) => set(i, { ...rule, value: e.target.value })}
                    className={cn(control, "min-w-0 flex-1")}
                  />
                ))}
              {!op.needsValue && <span className="flex-1" />}
              <Button
                aria-label="Remove this filter"
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0"
                onClick={() => onChange({ ...rules, filters: filters.filter((_, j) => j !== i) })}
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          )
        })}
        {filters.length < MAX_FILTERS && fields.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1 px-2 text-xs"
            onClick={() => onChange({ ...rules, filters: [...filters, fresh(fields[0])] })}
          >
            <Plus className="h-3.5 w-3.5" /> Add a filter
          </Button>
        )}
      </PopoverContent>
    </Popover>
  )
}
