"use client"

// The task panel's Cycle row: which of the project's cycles the task is in.
// Only cycles not yet complete are offered; the project's admins change it.

import * as React from "react"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useFetch } from "@/hooks/useFetch"
import { usePost } from "@/hooks/usePost"
import { useProjectCycles } from "@/hooks/useProjectCycles"
import { GetEndpointUrl, PostEndpointUrl } from "@/services/endPoints"
import { cycleDates, cycleLabel, openCycles, type Cycle } from "@/lib/tasks/cycles"
import { fieldLabel, fieldRow, inlineSelect } from "@/lib/ui/fieldRow"

const NONE = "none"

export function TaskCycleField({ taskUUID, projectId, isAdmin }: { taskUUID: string; projectId?: string; isAdmin: boolean }) {
  const { cycles, refresh } = useProjectCycles(projectId)
  const { data, mutate } = useFetch<{ data: Cycle | null }>(taskUUID ? `${GetEndpointUrl.GetTaskCycle}/${taskUUID}` : "")
  const { makeRequest, isSubmitting } = usePost()
  const current = data?.data ?? null
  const options = openCycles(cycles)

  // A project without cycles doesn't need the row.
  if (!projectId || (cycles.length === 0 && !current)) return null

  const change = async (value: string) => {
    const res = await makeRequest<{ task_uuid: string; cycle_id: string }, Cycle | null>({
      apiEndpoint: PostEndpointUrl.SetTaskCycle,
      payload: { task_uuid: taskUUID, cycle_id: value === NONE ? "" : value },
      showErrorToast: true,
    })
    if (res !== undefined) {
      await mutate({ data: res ?? null }, { revalidate: false })
      void refresh()
    }
  }

  return (
    <div className={fieldRow()}>
      <div>
        <span className={fieldLabel}>Cycle</span>
      </div>
      <div className="min-w-0">
        <Select value={current?.id ?? NONE} onValueChange={change} disabled={!isAdmin || isSubmitting}>
          <SelectTrigger dense className={inlineSelect} aria-label="Cycle">
            <SelectValue>{current ? cycleLabel(current) : <span className="text-muted-foreground">No cycle</span>}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>No cycle</SelectItem>
            {current?.completed_at && <SelectItem value={current.id} disabled>{cycleLabel(current)} (complete)</SelectItem>}
            {options.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {cycleLabel(c)} · {cycleDates(c)}
                {c.state === "current" ? " · current" : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}
