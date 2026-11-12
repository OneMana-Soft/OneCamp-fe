"use client"

// TaskPickRow's twin (./taskPickRow) for a list a task may be in several of:
// its Release row (jira-04). The same row (PickRowShell), with a list to
// tick (the shared combobox, a sheet on a phone). A file of its own, so it
// comes only with the lazy row that draws it.

import * as React from "react"
import { PickRowShell } from "@/components/task/taskPickRow"
import { Combobox, ComboboxContent, ComboboxEmpty, ComboboxField, ComboboxInput, ComboboxItem, ComboboxList } from "@/components/ui/combobox"

/** A row that puts the task in any of its project's lists (none ticked: in none). Each tick is the whole set, picked at once. */
export function TaskPicksRow({
  label,
  none,
  chosen,
  options,
  onPick,
  disabled,
  property,
}: {
  /** "Release": the row's label and the list's name. */
  label: string
  /** "No release": what the row says when none is ticked. */
  none: string
  /** What the task is in now. */
  chosen: { id: string; label: string }[]
  /** What may be ticked; one disabled can't be ticked or unticked. */
  options: { id: string; label: string; disabled?: boolean }[]
  /** The ids ticked now, the whole set. */
  onPick: (ids: string[]) => void
  disabled: boolean
  property?: string
}) {
  const ids = chosen.map((c) => c.id)
  const toggle = (id: string) => onPick(ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id])
  return (
    <PickRowShell label={label} property={property} empty={chosen.length === 0}>
      <Combobox multiple>
        <ComboboxField variant="inline" aria-label={label} placeholder={none} disabled={disabled} className="h-auto min-h-8">
          {chosen.length ? chosen.map((c) => c.label).join(", ") : undefined}
        </ComboboxField>
        <ComboboxContent label={label}>
          <ComboboxInput placeholder={`Find a ${label.toLowerCase()}…`} />
          <ComboboxList>
            <ComboboxEmpty>None by that name.</ComboboxEmpty>
            {options.map((o) => (
              <ComboboxItem key={o.id} value={o.id} keywords={[o.label]} checked={ids.includes(o.id)} disabled={o.disabled} onSelect={toggle}>
                {o.label}
              </ComboboxItem>
            ))}
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
    </PickRowShell>
  )
}
