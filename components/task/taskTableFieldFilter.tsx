"use client"

// One filter for all of a project's own fields: each field the list can be
// narrowed by (choices, people, checkboxes), with its values, any value, or
// none. A field's filter is its column's, so it goes to the server with the
// list's other filters and into saved views like them.

import { FilterChip } from "@/components/task/filterChip"
import type { Table } from "@tanstack/react-table"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { lazyView } from "@/components/task/LazyView"
import { FILTERABLE, FILTER_ANY, FILTER_NONE, type TaskField } from "@/lib/tasks/fields"

export type FieldChoice = { value: string; label: string; color?: string }
type Choice = FieldChoice

// The list of fields and values is a chunk of its own, with cmdk: the
// project's first screen draws only the chip (app/firstLoad.test.ts).
const Menu = lazyView(() => import("@/components/task/fieldFilterMenu"))
/** Starts loading the list, as the chip does on pointer or focus. */
export const warmFieldFilter = () => Menu.warm()

/** What a field can be filtered to. Pure. */
export function filterChoices(field: TaskField, people: { id: string; name: string }[]): Choice[] {
  if (field.type === "checkbox") {
    return [
      { value: "true", label: "Ticked" },
      { value: FILTER_NONE, label: "Not ticked" },
    ]
  }
  const own: Choice[] = field.type === "person" ? people.map((p) => ({ value: p.id, label: p.name })) : field.options.map((o) => ({ value: o.id, label: o.label, color: o.color }))
  return [...own, { value: FILTER_ANY, label: "Any value" }, { value: FILTER_NONE, label: "No value" }]
}

export function TaskTableFieldFilter<TData>({ table, fields, people, variant }: { table: Table<TData>; fields: TaskField[]; people: { id: string; name: string }[]; variant?: "ghost" }) {
  const filterable = fields.filter((f) => FILTERABLE.includes(f.type) && table.getColumn(f.filter_id))
  if (filterable.length === 0) return null
  const valuesOf = (f: TaskField) => (table.getColumn(f.filter_id)?.getFilterValue() as string[] | undefined) ?? []
  const active = filterable.reduce((n, f) => n + valuesOf(f).length, 0)
  const toggle = (f: TaskField, value: string) => {
    const now = new Set(valuesOf(f))
    if (now.has(value)) now.delete(value)
    else now.add(value)
    table.getColumn(f.filter_id)?.setFilterValue(now.size ? [...now] : undefined)
  }
  // One change for all of them: the list fetches once.
  const clear = () => {
    const ids = new Set(filterable.map((f) => f.filter_id))
    table.setColumnFilters((prev) => prev.filter((f) => !ids.has(f.id)))
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <FilterChip title="Fields" count={active} variant={variant} onPointerEnter={() => void warmFieldFilter()} onFocus={() => void warmFieldFilter()} />
      </PopoverTrigger>
      <PopoverContent className="w-[260px] p-0" align="start">
        <Menu.View
          fallback={<p className="p-3 text-sm text-ink-2">Loading…</p>}
          render={(m) => (
            <m.FieldFilterMenu
              groups={filterable.map((f) => ({ field: f, choices: filterChoices(f, people), chosen: valuesOf(f) }))}
              active={active}
              onToggle={toggle}
              onClear={clear}
            />
          )}
        />
      </PopoverContent>
    </Popover>
  )
}
