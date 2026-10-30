"use client"

import { useCallback, useRef } from "react"

import { ProjectGlanceLine, type GlanceKind } from "@/components/project/ProjectGlanceLine"
import { ProjectHealthChip } from "@/components/projectUpdates/ProjectHealthChip"
import { LazyForecastChip } from "@/components/project/LazyForecastChip"
import { ProjectGoalChip } from "@/components/goals/ProjectGoalChip"
import { useToast } from "@/hooks/use-toast"
import { celebrateCamp, sparkedRecently } from "@/lib/celebrateSoon"
import type { ProjectGlance } from "@/lib/utils/projectGlance"

/**
 * The line under a project's name (design v3, work.md W16): the meta counts,
 * then its health chip, when its work lands (linear-20) and the goal it
 * serves. Each loads on its own, so the line holds its height from the first
 * paint and never wraps. Short of room, the goal's name gives way first, then
 * the counts; the health and the forecast stay whole. (The phone has its own
 * row, in projectListTabs.)
 *
 * When this person's finish takes the project to 100 % done, the Camp tier
 * fires once from the header (work.md W04), with its one-line toast.
 */
export function ProjectHeaderLine({ projectId, projectName, onOpenUpdates, onPickCount }: { projectId: string; projectName?: string; onOpenUpdates: () => void; onPickCount?: (kind: GlanceKind) => void }) {
  const line = useRef<HTMLDivElement>(null)
  const last = useRef<ProjectGlance | null>(null)
  const { toast } = useToast()
  const onGlance = useCallback(
    (g: ProjectGlance) => {
      const before = last.current
      last.current = g
      // Only a change seen here, made by this person a moment ago: never on
      // load, never for a teammate's change arriving live.
      if (!before || before.open === 0 || g.open !== 0 || g.done === 0 || !sparkedRecently()) return
      if (celebrateCamp(line.current?.querySelector("[data-glance]") ?? line.current, "project", projectId)) {
        toast({ title: `${projectName || "The project"} is done.`, description: `${g.done} ${g.done === 1 ? "task" : "tasks"}, all finished.` })
      }
    },
    [projectId, projectName, toast],
  )
  return (
    <div ref={line} data-project-line className="flex h-6 min-w-0 items-center gap-x-3">
      <ProjectGlanceLine projectId={projectId} className="shrink-0" onGlance={onGlance} onPick={onPickCount} />
      <ProjectHealthChip projectId={projectId} onOpen={onOpenUpdates} className="shrink-0" />
      <LazyForecastChip projectId={projectId} className="shrink-0" />
      <ProjectGoalChip projectId={projectId} className="min-w-0 shrink-[4] overflow-hidden" />
    </div>
  )
}
