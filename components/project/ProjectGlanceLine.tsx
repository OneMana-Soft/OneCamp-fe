"use client"

import { useFetch } from "@/hooks/useFetch"
import { GetEndpointUrl } from "@/services/endPoints"
import { GetTaskStatusQueryParamByStatus } from "@/lib/utils/getTaskStatusQueryParamByStatus"
import type { ProjectInfoRawInterface } from "@/types/project"
import { projectGlance, projectGlanceParts } from "@/lib/utils/projectGlance"
import { cn } from "@/lib/utils/helpers/cn"

/**
 * One line under a project's name that says where it stands. It reads the
 * same request as the unfiltered board, so the two share a cache and the line
 * moves as soon as a card does.
 */
export function ProjectGlanceLine({ projectId, className }: { projectId: string; className?: string }) {
  const query = GetTaskStatusQueryParamByStatus({ assigneeFilter: [], priorityFilter: [] })
  const { data } = useFetch<ProjectInfoRawInterface>(projectId ? `${GetEndpointUrl.GetProjectTaskListForKanban}/${projectId}?${query}` : "")
  const p = data?.data
  // Its line held while it loads, so what's under it doesn't move when it arrives.
  if (!p) return <p aria-hidden className={cn("h-5 text-sm", className)} />
  const tasks = [
    ...(p.project_tasks_backlog ?? []),
    ...(p.project_tasks_todo ?? []),
    ...(p.project_tasks_in_progress ?? []),
    ...(p.project_tasks_in_review ?? []),
    ...(p.project_tasks_done ?? []),
    ...(p.project_tasks_canceled ?? []),
  ]
  const parts = projectGlanceParts(projectGlance(tasks, new Date(), p.project_tasks_done_count))
  if (!parts) return <p className={cn("text-sm text-muted-foreground", className)}>No tasks yet.</p>
  return (
    <p className={cn("text-sm text-muted-foreground", className)} title={parts.map((part) => part.text).join(" · ")}>
      {parts.map((part, i) => (
        <span key={part.text}>
          {i > 0 && <span aria-hidden="true"> · </span>}
          <span className={cn("tabular-nums", part.tone === "late" && "font-medium text-destructive")}>{part.text}</span>
        </span>
      ))}
    </p>
  )
}
