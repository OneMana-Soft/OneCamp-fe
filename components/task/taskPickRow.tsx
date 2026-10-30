"use client"

// A task panel row that puts the task in one of its project's lists, or in
// none: its Cycle row and its Milestone row. The label, then a dense inline
// select whose first option is the "none" one.

import * as React from "react"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { inlineSelect } from "@/lib/ui/fieldRow"
import { propertyLabel, propertyRow } from "@/lib/ui/propertyRow"

const NONE = "none"

export interface PickOption {
  id: string
  label: React.ReactNode
  disabled?: boolean
}

export function TaskPickRow({
  label,
  none,
  current,
  options,
  onPick,
  disabled,
  property,
}: {
  /** "Cycle", "Milestone": the row's label and the select's name. */
  label: string
  /** "No cycle": what the select says, and offers first, for none. */
  none: string
  /** What the task is in now, as the select shows it. */
  current: { id: string; label: React.ReactNode } | null
  /** What may be picked (the current one among them, or offered disabled). */
  options: PickOption[]
  /** The id picked; "" for none. */
  onPick: (id: string) => void
  disabled: boolean
  /** data-property, for the panel's tests and its keys. */
  property?: string
}) {
  return (
    <div className={propertyRow()} data-property={property} data-field-empty={current ? undefined : ""}>
      <div>
        <span className={propertyLabel}>{label}</span>
      </div>
      <div className="min-w-0">
        <Select value={current?.id ?? NONE} onValueChange={(v) => onPick(v === NONE ? "" : v)} disabled={disabled}>
          <SelectTrigger dense className={inlineSelect} aria-label={label}>
            <SelectValue>{current ? current.label : <span className="text-muted-foreground">{none}</span>}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>{none}</SelectItem>
            {options.map((o) => (
              <SelectItem key={o.id} value={o.id} disabled={o.disabled}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}
