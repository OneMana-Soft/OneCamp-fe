"use client"

import * as React from "react"

import { Combobox } from "@/components/ui/combobox"
import { ComboboxContent, ComboboxItem, ComboboxList } from "@/components/ui/comboboxMenu"
import { SelectSheetContext, SelectSheetRow, type SelectSheetRowProps, type SelectSheetState } from "@/components/ui/select"

// A select's list on a phone (components/ui/select), a chunk of its own: the
// combobox's sheet with no filter, titled with the select's name, its rows the
// combobox's (a finger's 44px, the chosen one checked, none lit until one is
// chosen); in a sheet, a panel of that sheet with Back.

function Row({ value, disabled, className, children }: SelectSheetRowProps) {
  const state = React.useContext(SelectSheetContext)
  return (
    <ComboboxItem value={value} disabled={disabled} className={className} checked={value === state?.value} onSelect={(picked) => state?.pick(picked)}>
      {children}
    </ComboboxItem>
  )
}

/** A control's name as a screen reader gives it: its aria-label, else the text of what labels it. */
function nameOf(el: HTMLButtonElement | null): string {
  if (!el) return ""
  const label = el.getAttribute("aria-label")
  if (label) return label
  const by = el.getAttribute("aria-labelledby")
  const from = by ? by.split(/\s+/).map((id) => document.getElementById(id)) : Array.from(el.labels ?? [])
  return from
    .map((n) => n?.textContent?.trim() ?? "")
    .filter(Boolean)
    .join(" ")
}

export function SelectSheet({ state, children }: { state: SelectSheetState; children: React.ReactNode }) {
  return (
    <Combobox open={state.open} onOpenChange={state.setOpen}>
      {/* With no filter to type in, the list itself takes the keys. */}
      <ComboboxContent label={nameOf(state.trigger.current)} selected={state.value || undefined} command={{ tabIndex: 0, className: "outline-none" }}>
        <ComboboxList>
          <SelectSheetRow.Provider value={Row}>{children}</SelectSheetRow.Provider>
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  )
}
