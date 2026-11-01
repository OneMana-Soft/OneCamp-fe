"use client"

import { useId } from "react"
import { Switch } from "@/components/ui/switch"
import { cn } from "@/lib/utils/helpers/cn"

/**
 * A choice about what an event is (focus time, time off, Google), wherever an
 * event is made or edited: a switch row, as a setting reads (content.md C14).
 * The name and its hint on the left, the switch on the right, no box.
 * `pending`: its change is being asked, and the switch waits for the answer
 * (disabled and busy), as a settings SwitchRow does while it saves.
 * `refused`: the server's words for why it can't be on. The switch stays off
 * and disabled, the hint says why, and the name dims as a disabled SwitchRow's.
 */
export function EventOptionCheckbox({ label, hint, checked, pending, onChange, refused }: { label: string; hint: string; checked: boolean; pending?: boolean; onChange: (checked: boolean) => void; refused?: string }) {
  const id = useId()
  return (
    <div className="flex min-h-11 items-center justify-between gap-4 py-1.5" data-event-option="" data-refused={refused ? "" : undefined}>
      {/* A press on any of the words toggles it, but its name is the name alone: the hint is its description, said once. */}
      <label htmlFor={id} className="grid gap-0.5">
        <span id={`${id}-name`} className={cn("text-ui font-medium", refused ? "text-ink-3" : "text-ink")}>
          {label}
        </span>
        <span id={`${id}-hint`} className="text-meta leading-snug text-ink-3">
          {refused ?? hint}
        </span>
      </label>
      <Switch
        id={id}
        checked={checked}
        disabled={pending || !!refused}
        aria-busy={pending || undefined}
        onCheckedChange={(v) => onChange(v === true)}
        aria-labelledby={`${id}-name`}
        aria-describedby={`${id}-hint`}
      />
    </div>
  )
}

type OwnTimeChoice = { checked: boolean; onChange: (checked: boolean) => void; refused?: string }

/** The "Focus time" choice on an event. */
export function FocusTimeCheckbox({ hint = "Pause your notifications while this runs.", ...choice }: OwnTimeChoice & { hint?: string }) {
  return <EventOptionCheckbox label="Focus time" hint={hint} {...choice} />
}

/** The "Away" choice on an event: time off, which the workload takes out of your capacity. */
export function AwayCheckbox(choice: OwnTimeChoice) {
  return <EventOptionCheckbox label="Away" hint="Time off: the workload counts these working days out of what you take on, so nobody plans work for you then." {...choice} />
}
