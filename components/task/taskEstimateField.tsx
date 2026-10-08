"use client"

// The task panel's Estimate row: how long the task should take. The time
// logged on it reads against this, and the workload can count it in hours.
// The project's admins change it, as every task edit; others read it.

import * as React from "react"
import { Input } from "@/components/ui/input"
import { useToast } from "@/hooks/use-toast"
import { useTaskUpdate } from "@/hooks/useTaskUpdate"
import axiosInstance, { OWN_ERRORS } from "@/lib/axiosInstance"
import { appMutate } from "@/lib/swrMutate"
import { formatDuration, parseDuration } from "@/lib/tasks/time"
import { fieldLabel, fieldRow } from "@/lib/ui/fieldRow"
import { apiErrorMessage } from "@/lib/utils/apiError"
import { GetEndpointUrl, PostEndpointUrl } from "@/services/endPoints"

/** The most an estimate can be: a thousand hours, as the server allows. */
const MAX_ESTIMATE_MINUTES = 1000 * 60

export function TaskEstimateField({ taskUUID, projectUUID, minutes, canEdit }: { taskUUID: string; projectUUID: string; minutes?: number; canEdit: boolean }) {
  const { toast } = useToast()
  const { optimisticUpdateTasks } = useTaskUpdate()
  const shown = minutes ? formatDuration(minutes * 60) : ""
  const [draft, setDraft] = React.useState(shown)
  const id = React.useId()
  React.useEffect(() => setDraft(shown), [shown])

  const patch = (value: number) => {
    void appMutate(
      `${GetEndpointUrl.GetTaskInfo}/${taskUUID}`,
      (current: { data?: object } | undefined) => (current?.data ? { ...current, data: { ...current.data, task_estimate_minutes: value } } : current),
      { revalidate: false },
    )
    optimisticUpdateTasks([{ task_uuid: taskUUID, task_estimate_minutes: value }], projectUUID)
  }

  const save = async () => {
    const text = draft.trim()
    const next = text === "" ? 0 : parseDuration(text, MAX_ESTIMATE_MINUTES)
    if (next === null) {
      toast({ variant: "destructive", title: "That isn't an estimate", description: "Write it like 2h, 1h 30m, 45m or 1.5h, up to 1000 hours." })
      setDraft(shown)
      return
    }
    if (next === (minutes ?? 0)) {
      setDraft(shown)
      return
    }
    patch(next)
    try {
      await axiosInstance.post(PostEndpointUrl.UpdateTaskEstimate, { task_uuid: taskUUID, task_estimate_minutes: next }, OWN_ERRORS)
    } catch (err) {
      patch(minutes ?? 0)
      toast({ variant: "destructive", title: "The estimate wasn't saved", description: apiErrorMessage(err, "Try again in a moment.") })
    }
  }

  return (
    <div className={fieldRow()}>
      <label htmlFor={id} className={fieldLabel}>
        Estimate
      </label>
      {canEdit ? (
        <Input
          id={id}
          value={draft}
          placeholder="How long? 2h, 30m"
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => void save()}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur()
            if (e.key === "Escape") {
              setDraft(shown)
              e.currentTarget.blur()
            }
          }}
          className="h-8 w-40 text-sm"
        />
      ) : (
        <span className="text-sm text-muted-foreground">{shown || "None"}</span>
      )}
    </div>
  )
}
