"use client"

// Goals: every goal, one goal with what serves it and its check-ins, and the
// goals a project serves; and what people do with them. After any change every
// goal view reads again, since one goal's progress moves its parent's. Errors
// carry the server's message, written for the person, and are shown already.

import { useCallback } from "react"
import axiosInstance from "@/lib/axiosInstance"
import { useFetch } from "@/hooks/useFetch"
import { appMutate } from "@/lib/swrMutate"
import { GetEndpointUrl } from "@/services/endPoints"
import { browserTZ } from "@/lib/utils/timeZone"
import type { UpdateDraft } from "@/lib/projectUpdates"
import type { UpdateInput } from "@/hooks/useProjectUpdates"
import type { GoalCheckIn, GoalDetail, GoalInput, GoalSummary } from "@/lib/goals"

const tz = () => `tz=${encodeURIComponent(browserTZ())}`
export const goalsKey = () => `${GetEndpointUrl.GoalList}?${tz()}`
export const goalKey = (id: string) => `${GetEndpointUrl.Goal}/${id}?${tz()}`
export const projectGoalsKey = (projectId: string) => `${GetEndpointUrl.ProjectGoals}/${projectId}/goals?${tz()}`

const PROJECT_GOALS = /^\/project\/[^/?]+\/goals/

/**
 * Reads every goal view again: the list, each goal's page, and projects' goal
 * chips. A deleted goal's own page is passed as gone: read again it would
 * only answer 404, which the app shows as an error.
 */
export const refreshGoals = (gone?: string) =>
  appMutate((key) => typeof key === "string" && key !== gone && (key.startsWith(`${GetEndpointUrl.Goal}/`) || PROJECT_GOALS.test(key)))

/** A check-in as the composer writes it. */
export type CheckInInput = UpdateInput

export interface PostedCheckIn {
  checkin: GoalCheckIn
  /** Where it was also posted, or why it wasn't. */
  channel?: string
  channel_error?: string
}

export function useGoals() {
  const { data, isLoading, isError: error, mutate } = useFetch<{ data: { goals: GoalSummary[] } }>(goalsKey())
  const create = useCallback(async (input: GoalInput): Promise<GoalSummary> => {
    const res = await axiosInstance.post(`${GetEndpointUrl.GoalCreate}?${tz()}`, input)
    await refreshGoals()
    return (res.data as { data: GoalSummary }).data
  }, [])
  return { goals: data?.data?.goals, isLoading, isError: !!error, create, refresh: mutate }
}

export function useGoal(id: string | undefined) {
  const { data, isLoading, isError: error, mutate } = useFetch<{ data: GoalDetail }>(id ? goalKey(id) : "")

  const act = useCallback(
    async <T>(path: string, body: object = {}): Promise<T> => {
      const res = await axiosInstance.post(`${GetEndpointUrl.Goal}/${id}${path}?${tz()}`, body)
      await refreshGoals()
      return (res.data as { data: T }).data
    },
    [id],
  )

  const edit = useCallback((input: GoalInput) => act<GoalSummary>("/edit", input), [act])
  const remove = useCallback(async () => {
    await axiosInstance.post(`${GetEndpointUrl.Goal}/${id}/delete?${tz()}`, {})
    const key = goalKey(id!)
    await appMutate(key, undefined, { revalidate: false })
    await refreshGoals(key)
  }, [id])
  const reopen = useCallback(() => act<void>("/reopen"), [act])
  const linkProject = useCallback((projectId: string) => act<void>("/projects", { project_uuid: projectId }), [act])
  const unlinkProject = useCallback((projectId: string) => act<void>(`/projects/${projectId}/delete`), [act])
  const postCheckIn = useCallback((input: CheckInInput) => act<PostedCheckIn>("/checkins", input), [act])
  const editCheckIn = useCallback((checkInId: string, input: { health: string; body: string }) => act<GoalCheckIn>(`/checkins/${checkInId}/edit`, input), [act])
  const removeCheckIn = useCallback((checkInId: string) => act<void>(`/checkins/${checkInId}/delete`), [act])

  const draft = useCallback(async (): Promise<UpdateDraft> => {
    const res = await axiosInstance.get(`${GetEndpointUrl.Goal}/${id}/checkins/draft`, { params: { tz: browserTZ() } })
    return (res.data as { data: UpdateDraft }).data
  }, [id])
  const aiDraft = useCallback(async (): Promise<UpdateDraft> => {
    const res = await axiosInstance.post(GetEndpointUrl.AiGoalCheckInDraft, { goal_id: id, tz: browserTZ() })
    return (res.data as { data: UpdateDraft }).data
  }, [id])

  return {
    goal: data?.data,
    isLoading,
    isError: !!error,
    notFound: (error as { response?: { status?: number } } | undefined)?.response?.status === 404,
    refresh: mutate,
    edit,
    remove,
    reopen,
    linkProject,
    unlinkProject,
    draft,
    aiDraft,
    postCheckIn,
    editCheckIn,
    removeCheckIn,
  }
}

/** The open goals a project serves, for its header. */
export function useProjectGoals(projectId: string | undefined) {
  const { data } = useFetch<{ data: { goals: GoalSummary[] } }>(projectId ? projectGoalsKey(projectId) : "")
  return data?.data?.goals ?? []
}
