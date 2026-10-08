"use client"

import { useCallback, useState } from "react"
import { toast } from "@/hooks/use-toast"
import { useFetch } from "@/hooks/useFetch"
import { useTaskFields } from "@/hooks/useTaskFields"
import { useTaskUpdate } from "@/hooks/useTaskUpdate"
import axiosInstance, { OWN_ERRORS } from "@/lib/axiosInstance"
import { appMutate } from "@/lib/swrMutate"
import { shiftedPatches, type ShiftedTask } from "@/lib/timeline"
import { apiErrorMessage } from "@/lib/utils/apiError"
import { browserTZ } from "@/lib/utils/timeZone"
import { weeksLater, workloadKey, type Measure, type WorkloadData, type WorkloadPerson, type WorkloadTask } from "@/lib/workload"
import { PostEndpointUrl } from "@/services/endPoints"

/**
 * The workload across the reader's projects, in their own weeks, and what can
 * be done from it: a task moved a week later (the tasks waiting on it moved
 * along, as on a timeline), given to someone else, or someone's capacity
 * changed. Each shows at once, everywhere the task is shown, and is put back
 * if the server refuses, with the reason.
 */
export function useWorkload() {
  const [key] = useState(() => workloadKey(browserTZ()))
  const workload = useFetch<{ data: WorkloadData }>(key)
  const { optimisticUpdateTasks, revalidateTaskKeys } = useTaskUpdate()
  const { reassign } = useTaskFields()

  /** A task n weeks later; the tasks waiting on it move along as far as they must. */
  const moveLater = useCallback(
    async (t: WorkloadTask, n = 1) => {
      const dates = weeksLater(t, n)
      optimisticUpdateTasks([{ task_uuid: t.task_uuid, ...dates }], t.project_uuid)
      try {
        const res = await axiosInstance.post<{
          data?: { shifted?: ShiftedTask[] }
        }>(
          PostEndpointUrl.UpdateTaskDates,
          {
            task_uuid: t.task_uuid,
            ...dates,
            shift_dependents: true,
            tz: browserTZ(),
          },
          OWN_ERRORS,
        )
        optimisticUpdateTasks(shiftedPatches(res.data?.data?.shifted), t.project_uuid)
      } catch (err) {
        toast({
          variant: "destructive",
          title: "The task wasn't moved",
          description: apiErrorMessage(err, "Try again in a moment."),
        })
        revalidateTaskKeys(t.project_uuid)
      }
    },
    [optimisticUpdateTasks, revalidateTaskKeys],
  )

  const giveTo = useCallback(
    (t: WorkloadTask, person: WorkloadPerson | null) =>
      reassign(
        t.task_uuid,
        t.project_uuid,
        person && {
          user_uuid: person.user_uuid,
          user_name: person.user_name,
          user_profile_object_key: person.user_profile_object_key ?? "",
        },
      ),
    [reassign],
  )

  /** What someone takes on a week, in tasks or hours; null puts back the default. */
  const setCapacity = useCallback(
    async (p: WorkloadPerson, measure: Measure, value: number | null) => {
      const hours = measure === "hours"
      void appMutate(
        key,
        (current: { data?: WorkloadData } | undefined) => {
          if (!current?.data) return current
          const d = current.data
          const people = d.people.map((x) =>
            x.user_uuid !== p.user_uuid
              ? x
              : hours
                ? { ...x, hours: value ?? d.default_hours, hours_set: value !== null }
                : { ...x, capacity: value ?? d.default_capacity, capacity_set: value !== null },
          )
          return { ...current, data: { ...d, people } }
        },
        { revalidate: false },
      )
      try {
        await axiosInstance.post(
          PostEndpointUrl.SetWorkloadCapacity,
          { user_uuid: p.user_uuid, [hours ? "hours_per_week" : "tasks_per_week"]: value ?? 0 },
          OWN_ERRORS,
        )
      } catch (err) {
        toast({
          variant: "destructive",
          title: "The capacity wasn't saved",
          description: apiErrorMessage(err, "Try again in a moment."),
        })
        void appMutate(key)
      }
    },
    [key],
  )

  return {
    data: workload.data?.data,
    isLoading: workload.isLoading,
    isError: workload.isError,
    mutate: workload.mutate,
    moveLater,
    giveTo,
    setCapacity,
  }
}
