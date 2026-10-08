"use client"

// A project's updates, newest first, and what its admins do with them: draft
// the next one from the project's tasks (with an AI summary on the AI
// edition), post it, edit or delete one. Errors carry the server's message,
// written for the person.

import { useCallback } from "react"
import axiosInstance from "@/lib/axiosInstance"
import { useFetch } from "@/hooks/useFetch"
import { GetEndpointUrl } from "@/services/endPoints"
import { type Ending, type Health, type ProjectUpdate, type UpdateDraft } from "@/lib/projectUpdates"
import { browserTZ } from "@/lib/utils/timeZone"

/** The list the tab, the header chip and the reminder share (one request). */
export const UPDATES_SHOWN = 20

const base = (projectId: string) => `${GetEndpointUrl.ProjectUpdates}/${projectId}/updates`

/** What the update composer posts: a project update, or a goal's check-in. */
export interface UpdateInput {
  health: Health | Ending
  body: string
  /** A project update: shown on the project's client link. */
  shared_with_client?: boolean
  channel_uuid?: string
  /** A number goal's check-in: the value the number moved to. */
  value?: number
}

export interface Posted {
  update: ProjectUpdate
  /** Where it was also posted, or why it wasn't. */
  channel?: string
  channel_error?: string
}

export function useProjectUpdates(projectId: string | undefined) {
  const key = projectId ? `${base(projectId)}?limit=${UPDATES_SHOWN}` : ""
  const { data, isLoading, mutate } = useFetch<{ data: { updates: ProjectUpdate[]; can_post: boolean } }>(key)

  const draft = useCallback(async (): Promise<UpdateDraft> => {
    const res = await axiosInstance.get(`${base(projectId!)}/draft`, { params: { tz: browserTZ() } })
    return (res.data as { data: UpdateDraft }).data
  }, [projectId])

  const aiDraft = useCallback(async (): Promise<UpdateDraft> => {
    const res = await axiosInstance.post(GetEndpointUrl.AiProjectUpdateDraft, { project_uuid: projectId, tz: browserTZ() })
    return (res.data as { data: UpdateDraft }).data
  }, [projectId])

  const post = useCallback(
    async (input: UpdateInput): Promise<Posted> => {
      const res = await axiosInstance.post(base(projectId!), input)
      await mutate()
      return (res.data as { data: Posted }).data
    },
    [projectId, mutate],
  )

  const edit = useCallback(
    async (id: string, input: UpdateInput) => {
      await axiosInstance.post(`${base(projectId!)}/${id}/edit`, input)
      await mutate()
    },
    [projectId, mutate],
  )

  const remove = useCallback(
    async (id: string) => {
      await axiosInstance.post(`${base(projectId!)}/${id}/delete`, {})
      await mutate()
    },
    [projectId, mutate],
  )

  return {
    updates: data?.data?.updates ?? [],
    canPost: !!data?.data?.can_post,
    isLoading,
    draft,
    aiDraft,
    post,
    edit,
    remove,
  }
}
