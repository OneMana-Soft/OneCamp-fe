"use client"
// The project's people as chips to pick from, in the order they're picked: a rule's pool to share
// work among (RuleBuilder) and the triage rota's turns (TriageSettings, linear-21 H4). A file of its
// own, importing none of the shared core, so the core-free triage sheet can take it (app/triageLazy.test).
import type { ReactNode } from "react"
import { ToggleChip } from "@/components/ui/toggleChip"

export interface Person {
  id: string
  name: string
  /** An AI teammate in the project: a rule may give it work, which starts it. */
  agent?: boolean
}

export function PeopleChips({ people, picked, onChange, label, lead, none }: {
  people: Person[]
  /** The ids picked, in order: a new pick goes last, and one let go leaves the rest in their order. */
  picked: string[]
  onChange: (ids: string[]) => void
  /** The group's accessible name. */
  label: string
  /** A word before the chips ("Among"). */
  lead?: string
  /** What an empty pick means, said after the chips. */
  none?: ReactNode
}) {
  return (
    <div className="flex w-full flex-wrap gap-1.5" role="group" aria-label={label}>
      {lead && <span className="mr-1 self-center text-meta text-ink-3">{lead}</span>}
      {people.map((p) => (
        <ToggleChip tone="neutral" offMark="plus" key={p.id} pressed={picked.includes(p.id)}
          onPressedChange={(next) => onChange(next ? [...picked.filter((x) => x !== p.id), p.id] : picked.filter((x) => x !== p.id))}>
          {p.name}
        </ToggleChip>
      ))}
      {!picked.length && none && <span className="self-center text-meta text-ink-3">{none}</span>}
    </div>
  )
}
