"use client"

import { useId } from "react"
import { Checkbox } from "@/components/ui/checkbox"

/**
 * A choice about what an event is (focus time, time off), wherever an event is
 * made or edited. The app's own checkbox, so it follows the colour theme and
 * springs like every other check; and a plain row, as a setting reads. It was
 * the browser's checkbox in raw gray-300 (the one control on the form the
 * theme never reached) inside a bordered box, two boxes stacked in a dialog
 * that already has a frame.
 */
export function EventOptionCheckbox({ label, hint, checked, onChange }: { label: string; hint: string; checked: boolean; onChange: (checked: boolean) => void }) {
  const id = useId()
  return (
    <div className="flex items-start gap-3" data-event-option="">
      <Checkbox id={id} checked={checked} onCheckedChange={(v) => onChange(v === true)} className="mt-0.5" aria-describedby={`${id}-hint`} />
      <label htmlFor={id} className="grid gap-1 leading-none">
        <span className="text-sm font-medium text-foreground">{label}</span>
        <span id={`${id}-hint`} className="text-xs leading-snug text-muted-foreground">
          {hint}
        </span>
      </label>
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
