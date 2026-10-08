"use client"

// One filter for all of a project's own fields: each field the list can be
// narrowed by (choices, people, checkboxes), with its values, any value, or
// none. A field's filter is its column's, so it goes to the server with the
// list's other filters and into saved views like them.

import { CheckIcon, PlusCircledIcon } from "@radix-ui/react-icons"
import type { Table } from "@tanstack/react-table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from "@/components/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { OptionPill } from "@/components/task/fieldValue"
import { FILTERABLE, FILTER_ANY, FILTER_NONE, type TaskField } from "@/lib/tasks/fields"
import { cn } from "@/lib/utils/helpers/cn"

type Choice = { value: string; label: string; color?: string }

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

export function TaskTableFieldFilter<TData>({ table, fields, people }: { table: Table<TData>; fields: TaskField[]; people: { id: string; name: string }[] }) {
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
        <Button variant="outline" size="sm" className="h-8 border-dashed">
          <PlusCircledIcon className="h-4 w-4" />
          Fields
          {active > 0 && (
            <Badge variant="secondary" className="ml-2 rounded-sm px-1 font-normal">
              {active}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[260px] p-0" align="start">
        <Command>
          <CommandInput placeholder="Find a field or value…" />
          <CommandList>
            <CommandEmpty>Nothing by that name.</CommandEmpty>
            {filterable.map((f) => {
              const chosen = new Set(valuesOf(f))
              return (
                <CommandGroup key={f.id} heading={f.name}>
                  {filterChoices(f, people).map((c) => {
                    const on = chosen.has(c.value)
                    return (
                      <CommandItem key={c.value} value={`${f.name} ${c.label}`} onSelect={() => toggle(f, c.value)}>
                        <div
                          className={cn(
                            "mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-primary",
                            on ? "bg-primary text-primary-foreground" : "opacity-50 [&_svg]:invisible",
                          )}
                          aria-hidden
                        >
                          <CheckIcon className="h-4 w-4" />
                        </div>
                        {c.color ? <OptionPill label={c.label} color={c.color} /> : <span className={cn(c.value === FILTER_ANY || c.value === FILTER_NONE ? "text-muted-foreground" : "")}>{c.label}</span>}
                      </CommandItem>
                    )
                  })}
                </CommandGroup>
              )
            })}
            {active > 0 && (
              <>
                <CommandSeparator />
                <CommandGroup>
                  <CommandItem onSelect={clear} className="justify-center text-center">
                    Clear field filters
                  </CommandItem>
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
