"use client"

import { useCallback } from "react"
import axiosInstance from "@/lib/axiosInstance"
import { useFetch } from "@/hooks/useFetch"
import { projectStatusesKey } from "@/lib/projectStatusesKey"
import type { OrderedStatuses as ProjectStatuses } from "@/lib/statusOrder"

/**
 * Saves a project's column order (the board's column drag; its own module so
 * no first screen carries it). It shares useProjectStatuses' cache: the new
 * order shows at once, is put back if the server refuses it (an admin no
 * longer, or a status since deleted), then the server's answer holds.
 */
export function useProjectStatusOrder(projectId: string | undefined) {
  const { mutate } = useFetch<{ data: ProjectStatuses }>(projectId ? projectStatusesKey(projectId) : "", undefined, { revalidateOnFocus: false })
  return useCallback(
    async (order: string[]) => {
      if (!projectId) return
      await mutate(
        async () => {
          const res = await axiosInstance.post<{ data: ProjectStatuses }>(`${projectStatusesKey(projectId)}/order`, { order })
          return { data: res.data.data }
        },
        {
          optimisticData: (current) => (current ? { ...current, data: { ...current.data, order } } : current!),
          rollbackOnError: true,
          revalidate: false,
        },
      )
    },
    [projectId, mutate],
  )
}
