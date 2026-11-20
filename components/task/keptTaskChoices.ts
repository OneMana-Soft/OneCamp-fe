"use client"
import * as React from "react"
import { pickable } from "@/components/task/ProjectTaskPick"
import { OWN_ERRORS } from "@/lib/http/ownErrors"
import { useKeptRead } from "@/lib/lazy/useKeptRead"
import type { TimelineData } from "@/lib/timeline"
import { timelineKey } from "@/lib/timelineKey"

/**
 * What a task picker (ProjectTaskPick) offers in a lazy view, which imports none of the shared core
 * (app/releasesLazy.test, app/triageLazy.test): the project's tasks from the timeline's list, read
 * through the page's client when it opens, less those taken; while the read is out, loading; a read
 * that failed with nothing kept is the `failed` handed in, with Try again. A release's tasks and a
 * triage duplicate's original pick this way; the task panel's pickers read through
 * components/task/projectTaskChoices.
 */
export function useKeptTaskChoices(
  http: { get<T>(url: string, config?: object): Promise<{ data: T }> },
  projectId: string,
  open: boolean,
  taken: ReadonlySet<string>,
  failed: (retry: () => void) => React.ReactNode,
) {
  const load = React.useCallback(async () => (await http.get<{ data: TimelineData }>(timelineKey(projectId), OWN_ERRORS)).data.data, [http, projectId])
  const project = useKeptRead<TimelineData>(open ? timelineKey(projectId) : null, load)
  return {
    tasks: pickable(project.data?.tasks ?? [], taken),
    loading: !project.data && !project.failed,
    failed: !project.data && project.failed ? failed(() => void project.again()) : undefined,
  }
}
