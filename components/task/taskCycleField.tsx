"use client"

// The task panel's Cycle row: which of the project's cycles the task is in.
// Only cycles not yet complete are offered; the project's admins change it.
// On the shared pick row (taskPickRow), as the Milestone row.

import * as React from "react"
import { TaskPickRow } from "@/components/task/taskPickRow"
import { useFetch } from "@/hooks/useFetch"
import { usePost } from "@/hooks/usePost"
import { useProjectCycles } from "@/hooks/useProjectCycles"
import { ProjectsGet, ProjectsPost } from "@/services/endpoints/projects"
import { cycleDates, cycleLabel, openCycles, type Cycle } from "@/lib/tasks/cycles"

export function TaskCycleField({ taskUUID, projectId, isAdmin }: { taskUUID: string; projectId?: string; isAdmin: boolean }) {
  const { cycles, refresh } = useProjectCycles(projectId)
  const { data, mutate } = useFetch<{ data: Cycle | null }>(taskUUID ? `${ProjectsGet.GetTaskCycle}/${taskUUID}` : "")
  const { makeRequest, isSubmitting } = usePost()
  const current = data?.data ?? null

  // A project without cycles doesn't need the row.
  if (!projectId || (cycles.length === 0 && !current)) return null

  const change = async (id: string) => {
    const res = await makeRequest<{ task_uuid: string; cycle_id: string }, Cycle | null>({
      apiEndpoint: ProjectsPost.SetTaskCycle,
      payload: { task_uuid: taskUUID, cycle_id: id },
      showErrorToast: true,
    })
    if (res !== undefined) {
      await mutate({ data: res ?? null }, { revalidate: false })
      void refresh()
    }
  }

  const options = [
    ...(current?.completed_at ? [{ id: current.id, label: `${cycleLabel(current)} (complete)`, disabled: true }] : []),
    ...openCycles(cycles).map((c) => ({
      id: c.id,
      label: `${cycleLabel(c)} · ${cycleDates(c)}${c.state === "current" ? " · current" : ""}`,
    })),
  ]

  return (
    <TaskPickRow
      label="Cycle"
      none="No cycle"
      current={current ? { id: current.id, label: cycleLabel(current) } : null}
      options={options}
      onPick={change}
      disabled={!isAdmin || isSubmitting}
    />
  )
}
