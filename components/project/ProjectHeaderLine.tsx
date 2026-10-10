"use client"

import { ProjectGlanceLine } from "@/components/project/ProjectGlanceLine"
import { ProjectHealthChip } from "@/components/projectUpdates/ProjectHealthChip"
import { ProjectGoalChip } from "@/components/goals/ProjectGoalChip"

/**
 * The line under a project's name: where it stands, its health and the goal
 * it serves. The three load on their own, so the line is one chip high from
 * the first paint and never wraps. It wrapped as the goal arrived whenever a
 * side panel made the page narrow, and the whole page under it moved down
 * 28px (a layout shift of 0.075). Short of room, the goal's name gives way
 * first, then the glance; the health stays whole. (The phone has its own
 * row, in projectListTabs.)
 */
export function ProjectHeaderLine({ projectId, onOpenUpdates }: { projectId: string; onOpenUpdates: () => void }) {
  return (
    <div data-project-line className="flex h-[1.375rem] min-w-0 items-center gap-x-3">
      <ProjectGlanceLine projectId={projectId} className="min-w-0 truncate" />
      <ProjectHealthChip projectId={projectId} onOpen={onOpenUpdates} className="shrink-0" />
      <ProjectGoalChip projectId={projectId} className="min-w-0 shrink-[4] overflow-hidden" />
    </div>
  )
}
