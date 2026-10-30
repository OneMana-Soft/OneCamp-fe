"use client"

// A channel's automatic check-ins, and what its moderators do with them:
// set one up, change it, pause or resume it, ask now, delete it. Errors carry
// the server's message, written for the person, and are shown already.

import { useCallback } from "react"
import axiosInstance from "@/lib/axiosInstance"
import { useFetch } from "@/hooks/useFetch"
import { OWN_ERRORS } from "@/lib/axiosInstance"
import { ProjectsGet } from "@/services/endpoints/projects"
import type { CheckIn, CheckInInput } from "@/lib/checkins"

export function useCheckIns(channelId: string | undefined) {
  const key = channelId ? `${ProjectsGet.CheckIns}/${channelId}/checkins` : ""
  const { data, isLoading, isError, mutate } = useFetch<{ data: { checkins: CheckIn[]; can_edit: boolean } }>(key, undefined, undefined, OWN_ERRORS)
  const act = useCallback(
    async (path: string, body: object = {}) => {
      const res = await axiosInstance.post(`${ProjectsGet.CheckIns}${path}`, body)
      await mutate()
      return res.data?.data
    },
    [mutate],
  )
  const create = useCallback((input: CheckInInput) => act(`/${channelId}/checkins`, input), [act, channelId])
  const edit = useCallback((id: string, input: CheckInInput) => act(`/checkins/${id}/edit`, input), [act])
  const setPaused = useCallback((id: string, paused: boolean) => act(`/checkins/${id}/pause`, { paused }), [act])
  const remove = useCallback((id: string) => act(`/checkins/${id}/delete`), [act])
  const askNow = useCallback((id: string) => act(`/checkins/${id}/ask`), [act])
  // A read that failed with nothing held is said as failed, never as "no check-ins".
  const failed = !!isError && !data
  const retry = useCallback(() => void mutate(), [mutate])
  return { checkIns: data?.data?.checkins ?? [], canEdit: !!data?.data?.can_edit, isLoading, failed, retry, create, edit, setPaused, remove, askNow }
}
