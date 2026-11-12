"use client"

// The task panel's Epic row (jira-01 J-H): the epic of its project the task
// is in, and for whoever may change the task, its project's epics to move it
// to, or none. The panel leaves the row off an epic, which never has one, and
// off a subtask, which goes with its task. The server holds the depth rule
// (a task with subtasks or dependencies may not fit) and says why, in words.
// On the shared pick row (taskPickRow), as the Cycle and Milestone rows.

import * as React from "react"
import { TaskPickRow, type PickOption } from "@/components/task/taskPickRow"
import { PartRetry } from "@/components/ui/part-retry"
import { toast } from "@/hooks/use-toast"
import { useFetch } from "@/hooks/useFetch"
import { useTaskUpdate } from "@/hooks/useTaskUpdate"
import { OWN_ERRORS } from "@/lib/axiosInstance"
import { appMutate } from "@/lib/swrMutate"
import type { TimelineData } from "@/lib/timeline"
import { timelineKey } from "@/lib/timelineKey"
import { apiErrorMessage } from "@/lib/utils/apiError"
import { epicChoices, setTaskParent } from "@/lib/work/hierarchy"
import { GetEndpointUrl } from "@/services/endPoints"

type Epic = { task_uuid: string; task_name: string; task_key?: string }

const named = (e: Epic) => (
  <>
    {e.task_key && <span className="mr-1.5 text-meta font-[510] tabular-nums text-ink-3">{e.task_key}</span>}
    {e.task_name}
  </>
)

export function TaskEpicField({ taskUUID, projectUUID, epic, canEdit }: { taskUUID: string; projectUUID: string; epic: Epic | null; canEdit: boolean }) {
  const [wanted, setWanted] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  const { revalidateTaskKeys } = useTaskUpdate()
  // Its project's epics, from the timeline's list of its tasks, read once the row is first opened.
  const project = useFetch<{ data: TimelineData }>(wanted ? timelineKey(projectUUID) : "", undefined, undefined, OWN_ERRORS)
  const epics = epicChoices(project.data?.data.tasks ?? [], taskUUID)

  const options: PickOption[] = epics.map((e) => ({ id: e.task_uuid, label: named(e) }))
  if (epic && !options.some((o) => o.id === epic.task_uuid)) options.unshift({ id: epic.task_uuid, label: named(epic) })
  if (wanted && !project.data) options.push({ id: "-", label: project.isError ? "Couldn't load the epics." : "Loading…", disabled: true })
  else if (wanted && epics.length === 0) options.push({ id: "-", label: "No epic in this project yet: make one by giving a task the type Epic.", disabled: true })

  const pick = async (id: string) => {
    const was = epic?.task_uuid ?? ""
    if (id === was) return
    setBusy(true)
    try {
      await setTaskParent(taskUUID, id)
      for (const t of [taskUUID, was, id]) if (t) void appMutate(`${GetEndpointUrl.GetTaskInfo}/${t}`)
      revalidateTaskKeys(projectUUID)
      void project.mutate()
    } catch (e) {
      toast({ title: "The epic didn't change", description: apiErrorMessage(e, "Nothing changed. Try again."), tone: "error" })
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <TaskPickRow
        label="Epic"
        none="No epic"
        current={epic ? { id: epic.task_uuid, label: named(epic) } : null}
        options={options}
        onPick={(id) => void pick(id)}
        onOpenChange={(open) => open && setWanted(true)}
        disabled={!canEdit || busy}
        property="epic"
      />
      {wanted && project.isError && !project.data && <PartRetry what="the epics" retry={() => void project.mutate()} />}
    </>
  )
}
