"use client"

// The task panel's Milestone row (linear-16): which of the milestones its
// project shows the task is in, a shared one too. Whoever may change the task
// sets it (the server checks: POST /task/milestone). A project with no
// milestones doesn't need the row. On the shared pick row (taskPickRow), as
// the Cycle row.

import * as React from "react"
import { TaskPickRow } from "@/components/task/taskPickRow"
import { useFetch } from "@/hooks/useFetch"
import { useProjectMilestones } from "@/hooks/useProjectMilestones"
import { toast } from "@/hooks/use-toast"
import { OWN_ERRORS } from "@/lib/axiosInstance"
import { apiErrorMessage } from "@/lib/utils/apiError"
import { setTaskMilestone, targetWords, taskMilestonePath, type TaskMilestone } from "@/lib/work/milestones"

export function TaskMilestoneField({ taskUUID, projectId, canEdit }: { taskUUID: string; projectId?: string; canEdit: boolean }) {
  const { read, milestones } = useProjectMilestones(projectId)
  const { data, mutate } = useFetch<{ data: TaskMilestone | null }>(taskUUID ? taskMilestonePath(taskUUID) : "", undefined, undefined, OWN_ERRORS)
  const [busy, setBusy] = React.useState(false)
  const current = data?.data ?? null

  if (!projectId || ((milestones?.length ?? 0) === 0 && !current)) return null

  const pick = async (id: string) => {
    setBusy(true)
    try {
      const now = await setTaskMilestone(taskUUID, id)
      await mutate({ data: now }, { revalidate: false })
      // Its progress counts the task now.
      void read.mutate()
    } catch (e) {
      toast({ title: "The milestone didn't change", description: apiErrorMessage(e, "Nothing changed. Try again."), tone: "error" })
    } finally {
      setBusy(false)
    }
  }

  const options = (milestones ?? []).map((m) => {
    const target = targetWords(m)
    return { id: m.id, label: target ? `${m.name} · ${target.text}` : m.name }
  })
  // One the list no longer offers (taken off this project) still names itself.
  if (current && !options.some((o) => o.id === current.id)) options.unshift({ id: current.id, label: current.name })

  return (
    <TaskPickRow
      label="Milestone"
      none="No milestone"
      current={current ? { id: current.id, label: current.name } : null}
      options={options}
      onPick={pick}
      disabled={!canEdit || busy}
      property="milestone"
    />
  )
}
