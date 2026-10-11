"use client"

import { useId } from "react"
import { Switch } from "@/components/ui/switch"

/**
 * A choice about what an event is (focus time, time off, Google), wherever an
 * event is made or edited: a switch row, as a setting reads (content.md C14).
 * The name and its hint on the left, the switch on the right, no box.
 */
export function EventOptionCheckbox({ label, hint, checked, onChange }: { label: string; hint: string; checked: boolean; onChange: (checked: boolean) => void }) {
  const id = useId()
  return (
    <div className="flex min-h-11 items-center justify-between gap-4 py-1.5" data-event-option="">
      <label htmlFor={id} className="grid gap-0.5">
        <span className="text-ui font-medium text-ink">{label}</span>
        <span id={`${id}-hint`} className="text-meta leading-snug text-ink-3">
          {hint}
        </span>
      </label>
      <Switch id={id} checked={checked} onCheckedChange={(v) => onChange(v === true)} aria-describedby={`${id}-hint`} />
    </div>
  )
}

/** The "Focus time" choice on an event. */
export function FocusTimeCheckbox({ checked, onChange, hint = "Pause your notifications while this runs." }: { checked: boolean; onChange: (checked: boolean) => void; hint?: string }) {
  return <EventOptionCheckbox label="Focus time" hint={hint} checked={checked} onChange={onChange} />
}

/** The "Away" choice on an event: time off, which the workload takes out of your capacity. */
export function AwayCheckbox({ checked, onChange }: { checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <EventOptionCheckbox
      label="Away"
      hint="Time off: the workload counts these working days out of what you take on, so nobody plans work for you then."
      checked={checked}
      onChange={onChange}
    />
  )
}
