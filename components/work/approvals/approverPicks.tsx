"use client"

import { Button } from "@/components/ui/button"
import { ToggleChip } from "@/components/ui/toggleChip"
import { Minus, Plus } from "@/lib/icons"

export interface Person {
  id: string
  name: string
}

/** People to pick, each a chip that offers a +: who moves tasks, who approves. */
export function PeopleChips({ label, people, picked, onChange }: { label: string; people: Person[]; picked: string[]; onChange: (ids: string[]) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label={label}>
      {people.map((p) => (
        <ToggleChip tone="neutral" offMark="plus" key={p.id} pressed={picked.includes(p.id)} onPressedChange={(on) => onChange(on ? [...picked, p.id] : picked.filter((x) => x !== p.id))}>
          {p.name}
        </ToggleChip>
      ))}
    </div>
  )
}

/** How many of the picked approvers must say yes: "2 of 3", shown once there is more than one. */
export function ApprovalsNeeded({ needed, of, onChange }: { needed: number; of: number; onChange: (n: number) => void }) {
  if (of < 2) return null
  return (
    <div className="flex items-center gap-2 text-xs text-ink-2">
      <span>Approvals needed</span>
      <Button type="button" size="icon" variant="ghost" aria-label="Fewer" className="size-11 md:size-7" disabled={needed <= 1} onClick={() => onChange(needed - 1)}>
        <Minus className="size-3.5" />
      </Button>
      <span className="w-10 text-center tabular-nums text-ink" aria-live="polite">{`${needed} of ${of}`}</span>
      <Button type="button" size="icon" variant="ghost" aria-label="More" className="size-11 md:size-7" disabled={needed >= of} onClick={() => onChange(needed + 1)}>
        <Plus className="size-3.5" />
      </Button>
    </div>
  )
}

/** The approvals still needed once the picked approvers change: never more than are picked, never under one. */
export const neededFor = (needed: number, picked: number) => Math.max(1, Math.min(needed, picked || 1))

/** "The client approves too": their yes from the link they hold, beside the approvers'. */
export function ClientToo({ pressed, onChange }: { pressed: boolean; onChange: (on: boolean) => void }) {
  return (
    <ToggleChip tone="neutral" offMark="plus" pressed={pressed} onPressedChange={onChange}>
      The client approves too
    </ToggleChip>
  )
}
