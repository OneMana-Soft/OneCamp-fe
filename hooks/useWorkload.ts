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
import { weeksLater, workloadKey, type WorkloadData, type WorkloadPerson, type WorkloadTask } from "@/lib/workload"
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

  /** How many tasks a week someone takes on; null puts back the default. */
  const setCapacity = useCallback(
    async (p: WorkloadPerson, tasks: number | null) => {
      void appMutate(
        key,
        (current: { data?: WorkloadData } | undefined) => {
          if (!current?.data) return current
          const capacity = tasks ?? current.data.default_capacity
          const people = current.data.people.map((x) => (x.user_uuid === p.user_uuid ? { ...x, capacity, capacity_set: tasks !== null } : x))
          return { ...current, data: { ...current.data, people } }
        },
        { revalidate: false },
      )
      try {
        await axiosInstance.post(PostEndpointUrl.SetWorkloadCapacity, { user_uuid: p.user_uuid, tasks_per_week: tasks ?? 0 }, OWN_ERRORS)
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
