"use client"

// The task panel's Milestone row (linear-16): which of the milestones its
// project shows the task is in, a shared one too. Whoever may change the task
// sets it (the server checks: POST /task/milestone). A project with no
// milestones doesn't need the row. On the shared pick row (taskPickRow), as
// the Cycle row. The palette's Move to milestone… (linear-28 H1b) offers the
// row's choices and makes the row's own change, through this module.

import * as React from "react"
import type { ScopedMutator } from "swr"
import { TaskPickRow } from "@/components/task/taskPickRow"
import { useFetch } from "@/hooks/useFetch"
import { useProjectMilestones } from "@/hooks/useProjectMilestones"
import { toast } from "@/hooks/use-toast"
import { OWN_ERRORS } from "@/lib/axiosInstance"
import { readInto } from "@/lib/http/readInto"
import { apiErrorMessage } from "@/lib/utils/apiError"
import {
  milestoneChoiceLabel,
  milestonesPath,
  setTaskMilestone,
  taskMilestonePath,
  type Milestone,
  type MilestonesAnswer,
  type TaskMilestone,
} from "@/lib/work/milestones"
import type { RowChoices } from "@/lib/work/taskPaletteEntries"

/** The milestones the row offers, each with its target; one the list no longer offers (taken off this project) still names itself. */
function milestoneOptions(milestones: Milestone[], current: TaskMilestone | null) {
  const options = milestones.map((m) => ({ id: m.id, label: milestoneChoiceLabel(m) }))
  if (current && !options.some((o) => o.id === current.id)) options.unshift({ id: current.id, label: current.name })
  return options
}

/**
 * Puts the task on the milestone ("" takes it off): the row's pick and the
 * palette's. `keep` keeps the answer where the row reads it, and `recount`
 * reads the project's milestones again: their progress counts the task now.
 * A refusal says so, and the row stays as it was.
 */
export async function pickMilestone(
  taskUUID: string,
  id: string,
  keep: (now: TaskMilestone | null) => Promise<unknown>,
  recount: () => unknown,
): Promise<void> {
  try {
    const now = await setTaskMilestone(taskUUID, id)
    await keep(now)
    void recount()
  } catch (e) {
    toast({ title: "The milestone didn't change", description: apiErrorMessage(e, "Nothing changed. Try again."), tone: "error" })
  }
}

/** The palette's Move to milestone…: the row's choices, read now through the row's own keys, so the row agrees. */
export async function milestoneChoices(mutate: ScopedMutator, taskUUID: string, projectId: string): Promise<RowChoices> {
  const [all, now] = await Promise.all([
    readInto<MilestonesAnswer>(mutate, milestonesPath(projectId)),
    readInto<{ data: TaskMilestone | null }>(mutate, taskMilestonePath(taskUUID)),
  ])
  const options = milestoneOptions(all.data?.milestones ?? [], now.data)
  return { options: options.map((o) => ({ value: o.id, label: o.label })), current: now.data?.id ?? "" }
}

/** The palette's pick: the row's own change, keeping its answer where the row reads it. */
export function pickMilestoneFor(mutate: ScopedMutator, taskUUID: string, projectId: string, id: string): Promise<void> {
  return pickMilestone(
    taskUUID,
    id,
    (now) => mutate(taskMilestonePath(taskUUID), { data: now }, { revalidate: false }),
    () => mutate(milestonesPath(projectId)),
  )
}

export function TaskMilestoneField({ taskUUID, projectId, canEdit }: { taskUUID: string; projectId?: string; canEdit: boolean }) {
  const { read, milestones } = useProjectMilestones(projectId)
  const { data, mutate } = useFetch<{ data: TaskMilestone | null }>(taskUUID ? taskMilestonePath(taskUUID) : "", undefined, undefined, OWN_ERRORS)
  const [busy, setBusy] = React.useState(false)
  const current = data?.data ?? null

  if (!projectId || ((milestones?.length ?? 0) === 0 && !current)) return null

  const pick = async (id: string) => {
    setBusy(true)
    await pickMilestone(taskUUID, id, (now) => mutate({ data: now }, { revalidate: false }), () => read.mutate())
    setBusy(false)
  }

  return (
    <TaskPickRow
      label="Milestone"
      none="No milestone"
      current={current ? { id: current.id, label: current.name } : null}
      options={milestoneOptions(milestones ?? [], current)}
      onPick={pick}
      disabled={!canEdit || busy}
      property="milestone"
    />
  )
}
