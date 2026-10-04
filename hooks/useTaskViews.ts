"use client"

import { useCallback } from "react"
import { useFetch } from "@/hooks/useFetch"
import { usePost } from "@/hooks/usePost"
import { GetEndpointUrl, PostEndpointUrl } from "@/services/endPoints"
import type { SavedTaskView, TaskViewState } from "@/lib/tasks/views"

/** The person's saved views for one task list, and saving or deleting one. */
export function useTaskViews(scope: string, enabled = true) {
  const url = enabled ? `${GetEndpointUrl.GetTaskViews}?scope=${encodeURIComponent(scope)}` : ""
  const { data, isLoading, mutate } = useFetch<{ data: SavedTaskView[] }>(url)
  const { makeRequest, isSubmitting } = usePost()

  const save = useCallback(
    async (name: string, state: TaskViewState) => {
      const view = await makeRequest<{ scope: string; name: string; state: TaskViewState }, SavedTaskView>({
        apiEndpoint: PostEndpointUrl.SaveTaskView,
        payload: { scope, name, state },
        showErrorToast: true,
      })
      if (view) await mutate()
      return view
    },
    [makeRequest, mutate, scope],
  )

  const remove = useCallback(
    async (id: string) => {
      const res = await makeRequest<{ id: string }, unknown>({
        apiEndpoint: PostEndpointUrl.DeleteTaskView,
        payload: { id },
        showErrorToast: true,
      })
      if (res !== undefined) await mutate()
    },
    [makeRequest, mutate],
  )

  return { views: data?.data ?? [], isLoading, save, remove, busy: isSubmitting }
}
