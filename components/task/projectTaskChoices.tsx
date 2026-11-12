"use client"

import { pickable } from "@/components/task/ProjectTaskPick"
import { ErrorState } from "@/components/ui/error-state"
import { useFetch } from "@/hooks/useFetch"
import { OWN_ERRORS } from "@/lib/axiosInstance"
import type { TimelineData } from "@/lib/timeline"
import { timelineKey } from "@/lib/timelineKey"

/**
 * What a task's picker (ProjectTaskPick) offers, as its tasks, loading and
 * failed: the project's tasks from the timeline's list, read when it opens,
 * less those taken; a read that failed is the shared compact error state with
 * Try again, in the list's place. One read for a task's Dependencies and its
 * links, so a third picker takes it rather than typing it again. The picker
 * says a failure itself (OWN_ERRORS), so no toast says it twice. Its own
 * module: ProjectTaskPick draws no ErrorState, so Releases' lazy chunk, whose
 * read is its own, doesn't carry it.
 */
export function useProjectTaskChoices(projectUUID: string, open: boolean, taken: ReadonlySet<string>) {
  const project = useFetch<{ data: TimelineData }>(open ? timelineKey(projectUUID) : "", undefined, undefined, OWN_ERRORS)
  return {
    tasks: pickable(project.data?.data.tasks ?? [], taken),
    loading: !!project.isLoading,
    failed: project.isError && !project.data ? <ErrorState compact subject="this project's tasks" onRetry={() => void project.mutate()} /> : undefined,
  }
}
