// The task panel's other reads, brought with the task (GET
// /task/info/{task}?include=…, the BE audit's panel fan-out): one request
// where the panel made eight, two levels deep. Each part comes as its own
// read answers it, so it goes under that read's key and the part's hook,
// mounting with the panel, shows it without asking (lib/swrSeed). A part the
// server leaves out is read on its own, as before.

import { appMutate } from "@/lib/swrMutate"
import { markSeeded } from "@/lib/swrSeed"
import { estimatesPath } from "@/lib/work/estimates"
import { GetEndpointUrl } from "@/services/endPoints"
import { ProjectsGet } from "@/services/endpoints/projects"

export const PANEL_INCLUDE = "cycle,recurrence,client_review,time_summary,sync_status,project_meta"

export type PanelParts = Partial<Record<"cycle" | "recurrence" | "client_review" | "time_summary" | "sync_status" | "statuses" | "fields" | "estimates", { data: unknown }>>

/** The key each part's own read keeps it by. */
function keysOf(taskUUID: string, projectUUID: string | undefined): Record<keyof PanelParts, string | null> {
  return {
    cycle: `${ProjectsGet.GetTaskCycle}/${taskUUID}`,
    recurrence: `${ProjectsGet.GetTaskRecurrence}/${taskUUID}`,
    client_review: `${ProjectsGet.TaskClientReview}/${taskUUID}`,
    time_summary: `${GetEndpointUrl.TaskTime}/${taskUUID}`,
    sync_status: `${GetEndpointUrl.GetGitHubSyncStatus}/${taskUUID}`,
    statuses: projectUUID ? `${ProjectsGet.ProjectStatuses}/${projectUUID}/statuses` : null,
    fields: projectUUID ? `${GetEndpointUrl.ProjectFields}/${projectUUID}/fields` : null,
    // The project's estimate scale, which the Points row sizes on (linear-05).
    estimates: projectUUID ? estimatesPath(projectUUID) : null,
  }
}

/** Puts what the server included under each part's key. */
export function seedPanelParts(taskUUID: string, projectUUID: string | undefined, included: PanelParts | undefined): void {
  if (!included) return
  const keys = keysOf(taskUUID, projectUUID)
  for (const name of Object.keys(keys) as (keyof PanelParts)[]) {
    const part = included[name]
    const key = keys[name]
    if (!part || !key) continue
    markSeeded(key)
    void appMutate(key, part, { revalidate: false })
  }
}
