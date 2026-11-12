"use client"

// What becomes of the work that isn't done when a stretch of it ends: the
// sentence ("4 tasks aren't done. Move them to the next cycle or the
// backlog?") and the choice as radio rows, each a whole row to tap (44px).
// Completing a cycle (./backlog/CompleteCycleDialog) and marking a release
// released (./releases/ShipRelease) both ask it. It reaches none of the
// shared core: the release's sheet loads it in its own chunk.

import * as React from "react"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"

/** "it" for one task, "them" for more: the words around the choice. */
export const itOrThem = (open: number) => (open === 1 ? "it" : "them")

export function CarryChoice<V extends string>({
  open,
  ask,
  value,
  onChange,
  options,
  children,
}: {
  /** How many of its tasks aren't done. */
  open: number
  /** The question after "N tasks aren't done.". */
  ask: string
  value: V
  onChange: (v: V) => void
  options: { value: V; label: React.ReactNode }[]
  /** Drawn between the sentence and the choice: the tasks, say. */
  children?: React.ReactNode
}) {
  if (open === 0) return <p className="text-ui-sm text-ink-2">Every task in it is done.</p>
  return (
    <div className="grid gap-3" data-carry-choice="">
      <p className="text-ui-sm text-ink-2">
        {open} {open === 1 ? "task isn't" : "tasks aren't"} done. {ask}
      </p>
      {children}
      <RadioGroup value={value} onValueChange={(v) => onChange(v as V)} className="gap-1">
        {options.map((o) => (
          <Label key={o.value} className="flex min-h-11 cursor-pointer items-center gap-2 rounded-md px-1.5 text-sm font-normal hover:bg-hover">
            <RadioGroupItem value={o.value} />
            {o.label}
          </Label>
        ))}
      </RadioGroup>
    </div>
  )
}
