"use client"
import * as React from "react"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { TaskPriorityCell } from "@/components/task/taskPriorityCell"
import { BULK_PRIORITIES } from "@/lib/tasks/bulkPriority"

/** A searchable list of choices, focused as it opens so the keyboard carries on. */
export function OptionList({
  placeholder,
  items,
  onPick,
}: {
  placeholder: string
  items: { value: string; search: string; node: React.ReactNode; indent?: boolean }[]
  onPick: (value: string) => void
}) {
  return (
    <Command>
      <CommandInput placeholder={placeholder} autoFocus />
      <CommandList>
        <CommandEmpty>Nothing matches.</CommandEmpty>
        <CommandGroup>
          {items.map((i) => (
            <CommandItem key={i.value} value={i.search} onSelect={() => onPick(i.value)} className={i.indent ? "pl-6" : undefined}>
              {i.node}
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </Command>
  )
}

/** The house priority setter's list: most urgent first, then No priority, which takes it off (the selection bar's P, triage's P). */
export function PriorityList({ onPick }: { onPick: (value: string) => void }) {
  return <OptionList placeholder="Set priority…" items={BULK_PRIORITIES.map((p) => ({ value: p.value, search: p.label, node: <TaskPriorityCell priority={p} /> }))} onPick={onPick} />
}
