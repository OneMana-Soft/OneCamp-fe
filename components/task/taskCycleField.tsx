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
    <div className="grid grid-cols-1 sm:grid-cols-6 gap-1 sm:gap-0 sm:items-center mb-2">
      <div className="sm:col-span-1">
        <span className="text-xs text-muted-foreground sm:text-foreground">Cycle</span>
      </div>
      <div className="sm:col-span-5">
        <Select value={current?.id ?? NONE} onValueChange={change} disabled={!isAdmin || isSubmitting}>
          <SelectTrigger className="md:-ml-1 h-8 w-fit min-w-40 border-none shadow-none hover:bg-accent" aria-label="Cycle">
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
