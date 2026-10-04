"use client"

// A project's cycles with their progress, and the moves its admins make:
// start one, complete one (carrying unfinished tasks on), rename, delete.
// Errors carry the server's message, written for the person.

import { useCallback } from "react"
import { useSWRConfig } from "swr"
import axiosInstance from "@/lib/axiosInstance"
import { useFetch } from "@/hooks/useFetch"
import { GetEndpointUrl } from "@/services/endPoints"
import { holdsProjectTasks } from "@/lib/taskStatus"
import type { Cycle } from "@/lib/tasks/cycles"

const url = (projectId: string) => `${GetEndpointUrl.ProjectCycles}/${projectId}/cycles`


export function useProjectCycles(projectId: string | undefined) {
  const key = projectId ? url(projectId) : ""
  const { data, isLoading, mutate } = useFetch<{ data: { cycles: Cycle[]; can_edit: boolean } }>(key)
  const { mutate: mutateAll } = useSWRConfig()
  // Completing or deleting a cycle moves tasks between cycles, so filtered
  // task lists are fetched again.
  const refreshTasks = useCallback(() => mutateAll((k) => holdsProjectTasks(k, projectId ?? "")), [mutateAll, projectId])

  const create = useCallback(
    async (input: { name: string; starts_at: string; weeks: number }) => {
      const res = await axiosInstance.post(url(projectId!), input)
      await mutate()
      return (res.data as { data: Cycle }).data
    },
    [projectId, mutate],
  )
  const complete = useCallback(
    async (id: string, carry: boolean) => {
      const res = await axiosInstance.post(`${url(projectId!)}/${id}/complete`, { carry })
      await Promise.all([mutate(), refreshTasks()])
      return (res.data as { data: { done: number; carried: number; next?: Cycle } }).data
    },
    [projectId, mutate, refreshTasks],
  )
  const rename = useCallback(
    async (id: string, name: string) => {
      await axiosInstance.post(`${url(projectId!)}/${id}/rename`, { name })
      await mutate()
    },
    [projectId, mutate],
  )
  const remove = useCallback(
    async (id: string) => {
      await axiosInstance.post(`${url(projectId!)}/${id}/delete`, {})
      await Promise.all([mutate(), refreshTasks()])
    },
    [projectId, mutate, refreshTasks],
  )

  return { cycles: data?.data?.cycles ?? [], canEdit: !!data?.data?.can_edit, isLoading, create, complete, rename, remove, refresh: mutate }
}
