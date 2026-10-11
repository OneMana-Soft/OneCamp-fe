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
import { inlineInput } from "@/lib/ui/fieldRow"
import { propertyLabel, propertyRow } from "@/lib/ui/propertyRow"
import { cn } from "@/lib/utils/helpers/cn"
import { Bar } from "@/components/ui/progress"
import { apiErrorMessage } from "@/lib/utils/apiError"
import { GetEndpointUrl, PostEndpointUrl } from "@/services/endPoints"

/** The most an estimate can be: a thousand hours, as the server allows. */
const MAX_ESTIMATE_MINUTES = 1000 * 60

export function TaskEstimateField({
  taskUUID,
  projectUUID,
  minutes,
  canEdit,
  loggedSeconds,
}: {
  taskUUID: string
  projectUUID: string
  minutes?: number
  canEdit: boolean
  /** Time logged on the task, which the row reads against the estimate. */
  loggedSeconds?: number
}) {
  const { toast } = useToast()
  const { optimisticUpdateTasks } = useTaskUpdate()
  const shown = minutes ? formatDuration(minutes * 60) : ""
  const [draft, setDraft] = React.useState(shown)
  const cancelled = React.useRef(false)
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
    // Escape blurs too, before the draft it put back has landed: nothing to save.
    if (cancelled.current) {
      cancelled.current = false
      setDraft(shown)
      return
    }
    const text = draft.trim()
    // A bare number is hours, as estimates are said: "8" is a day's work, not 8 minutes.
    const next = text === "" ? 0 : parseDuration(/^\d+(\.\d+)?$/.test(text) ? `${text}h` : text, MAX_ESTIMATE_MINUTES)
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

  const est = (minutes ?? 0) * 60
  const logged = loggedSeconds ?? 0
  const over = est > 0 && logged > est
  return (
    <div className={propertyRow()} data-property="estimate" data-field-empty={minutes ? undefined : ""}>
      <label htmlFor={id} className={propertyLabel}>
        Estimate
      </label>
      <div className="flex min-w-0 items-center gap-1.5">
        {/* Logged of estimate (W34): "2h 35m of 3h", then the bar. */}
        {logged > 0 && est > 0 && (
          <>
            <span className={cn("text-sm font-[510] tabular-nums", over && "text-warning-ink")}>{formatDuration(logged)}</span>
            <span className="text-sm text-ink-3">of</span>
          </>
        )}
        {canEdit ? (
          <Input
            id={id}
            value={draft}
            placeholder="Add estimate"
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => void save()}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur()
              if (e.key === "Escape") {
                // Handled: the panel this field sits in stays open.
                e.preventDefault()
                cancelled.current = true
                e.currentTarget.blur()
              }
            }}
            className={cn(inlineInput, "tabular-nums", logged > 0 && est > 0 ? "-ml-1 w-16 px-1" : "w-40")}
          />
        ) : (
          <span className={cn("text-sm", shown ? "text-ink-2" : "text-ink-3")}>{shown || "None"}</span>
        )}
        {logged > 0 && est > 0 && <EstimateBar logged={logged} estimate={est} />}
        {over && <span className="whitespace-nowrap text-ui-sm text-warning-ink">· {formatDuration(logged - est)} over</span>}
      </div>
    </div>
  )
}

/**
 * The estimate's 72 x 4 bar (W34): logged against the estimate, sun once it
 * is used up, with an overflow cap in danger past the track's end, as long as
 * the excess (up to 24 px).
 */
export function EstimateBar({ logged, estimate }: { logged: number; estimate: number }) {
  const ratio = estimate > 0 ? logged / estimate : 0
  const over = ratio > 1
  const cap = over ? Math.min(24, Math.round((ratio - 1) * 72)) : 0
  return (
    <span className="relative ml-1 inline-flex w-[72px] shrink-0 items-center" data-estimate-bar="">
      <Bar value={Math.min(100, ratio * 100)} size={4} label={`${formatDuration(logged)} of ${formatDuration(estimate)}`} doneAtFull={false} tone={over ? "sun" : undefined} />
      {cap > 0 && <span data-estimate-over="" aria-hidden="true" className="absolute left-full top-1/2 h-1 -translate-y-1/2 rounded-r-full bg-destructive" style={{ width: cap }} />}
    </span>
  )
}
