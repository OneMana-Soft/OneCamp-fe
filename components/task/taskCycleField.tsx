"use client"

// The task panel's Cycle row: which of the project's cycles the task is in.
// Only cycles not yet complete are offered; the project's admins change it.
// On the shared pick row (taskPickRow), as the Milestone row. The palette's
// Move to cycle… (linear-28 H1b) offers the row's choices and makes the row's
// own change, through this module: the panel reaches it as it reaches the row.

import * as React from "react"
import type { ScopedMutator } from "swr"
import { TaskPickRow } from "@/components/task/taskPickRow"
import { useFetch } from "@/hooks/useFetch"
import { projectCyclesKey, useProjectCycles } from "@/hooks/useProjectCycles"
import axiosInstance from "@/lib/axiosInstance"
import { readInto } from "@/lib/http/readInto"
import { ProjectsGet, ProjectsPost } from "@/services/endpoints/projects"
import { cycleDates, cycleLabel, openCycles, type Cycle } from "@/lib/tasks/cycles"
import type { RowChoices } from "@/lib/work/taskPaletteEntries"

const taskCycleKey = (taskUUID: string) => `${ProjectsGet.GetTaskCycle}/${taskUUID}`

/** The cycles the row offers: those not yet complete, each with its dates, the current one said. */
function cycleOptions(cycles: Cycle[]) {
  return openCycles(cycles).map((c) => ({
    id: c.id,
    label: `${cycleLabel(c)} · ${cycleDates(c)}${c.state === "current" ? " · current" : ""}`,
  }))
}

/**
 * Puts the task in the cycle ("" takes it out): the row's pick and the
 * palette's. `keep` keeps the answer where the row reads it, and `recount`
 * reads the project's cycles again, for their counts. A refused move is said
 * by the request's own toast (lib/axiosInstance), and the row stays as it was.
 */
export async function pickCycle(taskUUID: string, cycleId: string, keep: (now: Cycle | null) => Promise<unknown>, recount: () => unknown): Promise<void> {
  try {
    const res = await axiosInstance.post<{ data: Cycle | null }>(ProjectsPost.SetTaskCycle, { task_uuid: taskUUID, cycle_id: cycleId })
    await keep(res.data.data ?? null)
    void recount()
  } catch {
    // Said by the request's toast.
  }
}

/** The palette's Move to cycle…: the row's choices, read now through the row's own keys, so the row agrees. */
export async function cycleChoices(mutate: ScopedMutator, taskUUID: string, projectId: string): Promise<RowChoices> {
  const [all, now] = await Promise.all([
    readInto<{ data?: { cycles?: Cycle[] } }>(mutate, projectCyclesKey(projectId)),
    readInto<{ data: Cycle | null }>(mutate, taskCycleKey(taskUUID)),
  ])
  return { options: cycleOptions(all.data?.cycles ?? []).map((o) => ({ value: o.id, label: o.label })), current: now.data?.id ?? "" }
}

/** The palette's pick: the row's own change, keeping its answer where the row reads it. */
export function pickCycleFor(mutate: ScopedMutator, taskUUID: string, projectId: string, cycleId: string): Promise<void> {
  return pickCycle(
    taskUUID,
    cycleId,
    (now) => mutate(taskCycleKey(taskUUID), { data: now }, { revalidate: false }),
    () => mutate(projectCyclesKey(projectId)),
  )
}

export function TaskCycleField({ taskUUID, projectId, isAdmin }: { taskUUID: string; projectId?: string; isAdmin: boolean }) {
  const { cycles, refresh } = useProjectCycles(projectId)
  const { data, mutate } = useFetch<{ data: Cycle | null }>(taskUUID ? taskCycleKey(taskUUID) : "")
  const [busy, setBusy] = React.useState(false)
  const current = data?.data ?? null

  // A project without cycles doesn't need the row.
  if (!projectId || (cycles.length === 0 && !current)) return null

  const change = async (id: string) => {
    setBusy(true)
    await pickCycle(taskUUID, id, (now) => mutate({ data: now }, { revalidate: false }), refresh)
    setBusy(false)
  }

  const options = [
    ...(current?.completed_at ? [{ id: current.id, label: `${cycleLabel(current)} (complete)`, disabled: true }] : []),
    ...cycleOptions(cycles),
  ]

  return (
    <TaskPickRow
      label="Cycle"
      none="No cycle"
      current={current ? { id: current.id, label: cycleLabel(current) } : null}
      options={options}
      onPick={change}
      disabled={!isAdmin || busy}
    />
  )
}
