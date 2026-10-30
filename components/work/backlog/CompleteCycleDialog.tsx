"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { ResponsiveDialog } from "@/components/ui/responsive-dialog"
import { cycleLabel } from "@/lib/tasks/cycles"
import type { PlanCycle } from "@/lib/work/backlog"

/**
 * Complete cycle (STEP4 #9): "4 tasks aren't done. Move them to the next
 * cycle or the backlog?", the choice as two radios. With no next cycle, one
 * the same length is made for them.
 */
export function CompleteCycleDialog({ cycle, next, onClose, onComplete }: { cycle: PlanCycle; next?: PlanCycle; onClose: () => void; onComplete: (carry: boolean) => void }) {
  const open = cycle.progress.total - cycle.progress.done
  const [to, setTo] = useState<"next" | "backlog">("next")
  const nextName = next ? cycleLabel(next) : "a new cycle"
  return (
    <ResponsiveDialog
      title={`Complete ${cycleLabel(cycle)}`}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button size="sm" onClick={() => onComplete(to === "next")}>
            Complete cycle
          </Button>
        </>
      }
    >
      {open === 0 ? (
        <p className="text-ui-sm text-ink-2">Every task in it is done.</p>
      ) : (
        <div className="grid gap-3" data-complete-cycle="">
          <p className="text-ui-sm text-ink-2">
            {open} {open === 1 ? "task isn't" : "tasks aren't"} done. Move {open === 1 ? "it" : "them"} to the next cycle or the backlog?
          </p>
          <RadioGroup value={to} onValueChange={(v) => setTo(v as "next" | "backlog")} className="gap-1">
            <Label className="flex min-h-11 cursor-pointer items-center gap-2 rounded-md px-1.5 text-sm font-normal hover:bg-hover">
              <RadioGroupItem value="next" />
              To {nextName}
            </Label>
            <Label className="flex min-h-11 cursor-pointer items-center gap-2 rounded-md px-1.5 text-sm font-normal hover:bg-hover">
              <RadioGroupItem value="backlog" />
              Back to the backlog
            </Label>
          </RadioGroup>
        </div>
      )}
    </ResponsiveDialog>
  )
}
