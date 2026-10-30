"use client"

import { useCallback, useEffect } from "react"
import axiosInstance from "@/lib/axiosInstance"
import { useFetch } from "@/hooks/useFetch"
import { GetEndpointUrl } from "@/services/endPoints"
import { ProjectsGet } from "@/services/endpoints/projects"
import type { AskInput, StatusRule, StatusRuleInput, StatusRulesPayload, TaskApproval, Verdict } from "@/lib/rules/approvals"
import { APPROVAL_HELD } from "@/lib/approvalHeld"
import { appMutate } from "@/lib/swrMutate"
import { apiErrorStatus } from "@/lib/utils/apiError"
// The card and the ask sheet say their own failures: one failure, said once.
import { OWN_ERRORS } from "@/lib/http/ownErrors"

/** An answered or withdrawn request leaves the approvers' waiting lists (Home's Approvals). */
const rereadWaiting = () => void appMutate(GetEndpointUrl.ApprovalsWaiting)

const rulesUrl = (projectId: string) => `${ProjectsGet.ProjectRules}/${projectId}/statusRules`

/** A project's status rules, and keeping them. */
export function useStatusRules(projectId: string | undefined) {
  const { data, isError, isLoading, mutate } = useFetch<{ data: StatusRulesPayload }>(projectId ? rulesUrl(projectId) : "", undefined, { revalidateOnFocus: false })
  const save = useCallback(
    async (input: StatusRuleInput): Promise<StatusRule | null> => {
      const res = await axiosInstance.post<{ data: StatusRule | null }>(rulesUrl(projectId!), input)
      await mutate()
      return res.data.data
    },
    [projectId, mutate],
  )
  const remove = useCallback(
    async (status: string) => {
      await axiosInstance.post(`${rulesUrl(projectId!)}/delete`, { status })
      await mutate()
    },
    [projectId, mutate],
  )
  return { payload: data?.data, error: isError, isLoading, save, remove, refresh: mutate }
}


/** A task's newest approval request: asking for one, answering it and withdrawing it. */
export function useTaskApproval(taskId: string | undefined) {
  const key = taskId ? `${ProjectsGet.TaskApproval}/${taskId}` : ""
  const { data, isLoading, mutate } = useFetch<{ data: TaskApproval | null }>(key, undefined, { revalidateOnFocus: false })
  // A move just held for approval (usePost): read the request again.
  useEffect(() => {
    if (!key) return
    const read = () => void mutate()
    window.addEventListener(APPROVAL_HELD, read)
    return () => window.removeEventListener(APPROVAL_HELD, read)
  }, [key, mutate])
  // Answered or closed meanwhile (409: the task went on without it, or
  // someone else answered): read it again, so the card shows how it stands.
  const settled = useCallback(
    (e: unknown): never => {
      if (apiErrorStatus(e) === 409) {
        void mutate()
        rereadWaiting()
      }
      throw e
    },
    [mutate],
  )
  const decide = useCallback(
    async (approvalId: string, verdict: Verdict, comment: string) => {
      const res = await axiosInstance.post<{ data: TaskApproval }>(`${key}/decide`, { approval_id: approvalId, verdict, comment }, OWN_ERRORS).catch(settled)
      await mutate({ data: res.data.data }, { revalidate: false })
      rereadWaiting()
      return res.data.data
    },
    [key, mutate, settled],
  )
  const withdraw = useCallback(async () => {
    await axiosInstance.post(`${key}/withdraw`, undefined, OWN_ERRORS).catch(settled)
    await mutate()
    rereadWaiting()
  }, [key, mutate, settled])
  const ask = useCallback(
    async (input: AskInput) => {
      const res = await axiosInstance.post<{ data: TaskApproval }>(`${key}/ask`, input, OWN_ERRORS)
      await mutate({ data: res.data.data }, { revalidate: false })
      return res.data.data
    },
    [key, mutate],
  )
  return { approval: data?.data ?? null, isLoading, ask, decide, withdraw, refresh: mutate }
}
