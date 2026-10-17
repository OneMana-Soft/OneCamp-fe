"use client"

// The Fields filter's list (TaskTableFieldFilter): each field the list can be
// narrowed by, with its values, any value or none, found by typing. A chunk
// of its own (app/firstLoad.test.ts): the toolbar draws the Fields chip, and
// this loads as the pointer or the focus reaches it.

import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from "@/components/ui/command"
import { OptionPill } from "@/components/task/fieldValue"
import type { FieldChoice } from "@/components/task/taskTableFieldFilter"
import { FILTER_ANY, FILTER_NONE, type TaskField } from "@/lib/tasks/fields"
import { cn } from "@/lib/utils/helpers/cn"

export function FieldFilterMenu({
  groups,
  active,
  onToggle,
  onClear,
}: {
  /** Each field with what it can be filtered to, and the values chosen. */
  groups: { field: TaskField; choices: FieldChoice[]; chosen: string[] }[]
  /** How many values are chosen, across the fields. */
  active: number
  onToggle: (field: TaskField, value: string) => void
  onClear: () => void
}) {
  return (
    <Command>
      <CommandInput placeholder="Find a field or value…" />
      <CommandList>
        <CommandEmpty>Nothing by that name.</CommandEmpty>
        {groups.map(({ field: f, choices, chosen }) => (
          <CommandGroup key={f.id} heading={f.name}>
            {choices.map((c) => {
              const on = chosen.includes(c.value)
              return (
                <CommandItem key={c.value} checked={on} value={`${f.name} ${c.label}`} onSelect={() => onToggle(f, c.value)}>
                  {c.color ? <OptionPill label={c.label} color={c.color} /> : <span className={cn(c.value === FILTER_ANY || c.value === FILTER_NONE ? "text-muted-foreground" : "")}>{c.label}</span>}
                </CommandItem>
              )
            })}
          </CommandGroup>
        ))}
        {active > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup>
              <CommandItem onSelect={onClear} className="justify-center text-center">
                Clear field filters
              </CommandItem>
            </CommandGroup>
          </>
        )}
      </CommandList>
    </Command>
  )
}
