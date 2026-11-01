"use client"

// A project's plan on its home (linear-15), the row's eager part: it reads and
// saves the plan and holds the row's height from the first paint. The chips are
// a lazy chunk handed everything, off the shared core (chunking rule, 30 Oct).

import dynamic from "next/dynamic"
import { useState } from "react"
import { ErrorState } from "@/components/ui/error-state"
import { PartRetry } from "@/components/ui/part-retry"
import { usePlanRegistry, useProjectPlan } from "@/hooks/useProjectPlan"
import { useToast } from "@/hooks/use-toast"
import { apiErrorMessage } from "@/lib/utils/apiError"
import { cn } from "@/lib/utils/helpers/cn"
import type { PlanField, PlanMember, PlanPick } from "@/lib/work/projectPlan"

const PlanChips = dynamic(() => import("@/components/project/ProjectPlanChips").then((m) => m.PlanChips), { ssr: false })

export function ProjectPlanStrip({ projectId, members, className }: { projectId: string; members: PlanMember[]; className?: string }) {
  const { plan, canEdit, canLead, save, failed: readFailed, retry: readAgain } = useProjectPlan(projectId)
  const [open, setOpen] = useState<PlanField | null>(null)
  const { registry, failed, retry } = usePlanRegistry(open === "status" || open === "labels")
  const { toast } = useToast()

  const row = cn("flex h-7 min-w-0 items-center gap-1.5 overflow-x-auto [scrollbar-width:none]", className)
  // A failed read with nothing to show offers Try again, never a blank row.
  if (!plan && readFailed)
    return (
      <div data-project-plan="" className={className}>
        <PartRetry what="the project's plan" retry={readAgain} />
      </div>
    )
  if (!plan) return <div data-project-plan="" aria-hidden="true" className={row} />

  const pick: PlanPick = (change, shown, keepOpen = false) => {
    if (!keepOpen) setOpen(null)
    save(change, shown).catch((e) => toast({ title: "The plan wasn't changed", description: apiErrorMessage(e, "Try again in a moment."), variant: "destructive" }))
  }

  return (
    <div data-project-plan="" role="group" aria-label="Project plan" className={row}>
      <PlanChips
        plan={plan}
        canEdit={canEdit}
        canLead={canLead}
        members={members}
        registry={registry}
        registryError={failed ? <ErrorState compact subject="the workspace's statuses and labels" onRetry={retry} /> : null}
        open={open}
        onOpen={setOpen}
        onPick={pick}
      />
    </div>
  )
}
