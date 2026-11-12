"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { ResponsiveDialog } from "@/components/ui/responsive-dialog"
import { CarryChoice, itOrThem } from "@/components/work/carryChoice"
import { cycleLabel } from "@/lib/tasks/cycles"
import type { PlanCycle } from "@/lib/work/backlog"

/**
 * Complete cycle (STEP4 #9): "4 tasks aren't done. Move them to the next
 * cycle or the backlog?", the choice as two radios. With no next cycle, one
 * the same length is made for them. The sentence and the choice are the
 * shared CarryChoice, as Mark released's are.
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
      <CarryChoice
        open={open}
        ask={`Move ${itOrThem(open)} to the next cycle or the backlog?`}
        value={to}
        onChange={setTo}
        options={[
          { value: "next", label: `To ${nextName}` },
          { value: "backlog", label: "Back to the backlog" },
        ]}
      />
    </ResponsiveDialog>
  )
}
