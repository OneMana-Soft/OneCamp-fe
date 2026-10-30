"use client"

import { useCallback, useMemo } from "react"
import { useSWRConfig } from "swr"
import axiosInstance from "@/lib/axiosInstance"
import { useFetch } from "@/hooks/useFetch"
import { projectStatusesKey as url } from "@/lib/projectStatusesKey"
import { inOrder, type OrderedStatuses } from "@/lib/statusOrder"
import { BUILT_IN_STATUSES, holdsProjectTasks, type StatusCategory, statusOptions } from "@/lib/taskStatus"

export interface StatusInput {
  name: string
  category: StatusCategory
  color: string
}

/**
 * A project's statuses, as options for pickers and board columns, and the
 * actions its admins use to change them. Without a project (or until it
 * loads) the options are the six built-in statuses, so nothing waits on it.
 */
export function useProjectStatuses(projectId: string | undefined) {
  const key = projectId ? url(projectId) : ""
  const { data, isLoading, mutate } = useFetch<{ data: OrderedStatuses }>(key, undefined, { revalidateOnFocus: false })
  const project = data?.data
  const options = useMemo(() => (project ? inOrder(statusOptions(project), project.order) : BUILT_IN_STATUSES), [project])
  // A rename, a new category or a delete rewrites the tasks in that status on
  // the server, so what the app holds of them is fetched again; without this a
  // card kept the chip of a status that no longer existed until a reload.
  const { mutate: mutateAll } = useSWRConfig()
  const refreshTasks = useCallback(
    () => mutateAll((key) => holdsProjectTasks(key, projectId ?? "")),
    [mutateAll, projectId],
  )

  const create = useCallback(
    async (input: StatusInput) => {
      await axiosInstance.post(url(projectId!), input)
      await mutate()
    },
    [projectId, mutate],
  )
  const update = useCallback(
    async (id: string, input: StatusInput) => {
      await axiosInstance.post(`${url(projectId!)}/${id}`, input)
      await Promise.all([mutate(), refreshTasks()])
    },
    [projectId, mutate, refreshTasks],
  )
  const remove = useCallback(
    async (id: string, moveTo: string) => {
      await axiosInstance.post(`${url(projectId!)}/${id}/delete`, { move_to: moveTo })
      await Promise.all([mutate(), refreshTasks()])
    },
    [projectId, mutate, refreshTasks],
  )
  const reorder = useCallback(
    async (ids: string[]) => {
      await axiosInstance.post(`${url(projectId!)}/reorder`, { ids })
      await mutate()
    },
    [projectId, mutate],
  )

  return { project, options, isLoading, create, update, remove, reorder, refresh: mutate, refreshTasks,
    // The client, for restoreService's restore: the lazy dialog may not import it itself (V-49).
    http: axiosInstance }
}
