"use client"

/** The "Focus time" choice on an event, wherever an event is made or edited. */
export function FocusTimeCheckbox({ checked, onChange, hint = "Pause your notifications while this runs." }: { checked: boolean; onChange: (checked: boolean) => void; hint?: string }) {
  return (
    <label className="flex items-start gap-3 rounded-md border p-3">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary" />
      <span className="space-y-1 leading-none">
        <span className="block text-sm font-medium">Focus time</span>
        <span className="block text-xs text-muted-foreground">{hint}</span>
      </span>
    </label>
  )
}
