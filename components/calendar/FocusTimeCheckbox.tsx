"use client"

/** A choice about what an event is (focus time, time off), wherever an event is made or edited. */
export function EventOptionCheckbox({ label, hint, checked, onChange }: { label: string; hint: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label className="flex items-start gap-3 rounded-md border p-3">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary" />
      <span className="space-y-1 leading-none">
        <span className="block text-sm font-medium">{label}</span>
        <span className="block text-xs text-muted-foreground">{hint}</span>
      </span>
    </label>
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
