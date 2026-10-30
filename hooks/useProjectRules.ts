"use client"

import { useCallback } from "react"
import axiosInstance from "@/lib/axiosInstance"
import { useFetch } from "@/hooks/useFetch"
import { ProjectsGet } from "@/services/endpoints/projects"
import { savedIn } from "@/lib/rules/draft"
import type { Rule, RuleDraft, RuleRun, RulesPayload } from "@/lib/rules/types"
import { browserTZ } from "@/lib/utils/timeZone"
import { listOnceRead } from "@/lib/utils/listOf"

const base = (projectId: string) => `${ProjectsGet.ProjectRules}/${projectId}/rules`

/** The runs list's key: the project's, or one rule's. */
export const runsKey = (projectId: string, ruleId?: string) =>
  `${base(projectId)}/runs${ruleId ? `?rule=${encodeURIComponent(ruleId)}` : ""}`

/**
 * A project's rules, whether the reader may keep them, the ready-made ones,
 * and the actions that keep them. Nothing loads without a project (a closed
 * dialog asks for none).
 */
export function useProjectRules(projectId: string | undefined) {
  const key = projectId ? base(projectId) : ""
  const { data, isError: error, isLoading, mutate } = useFetch<{ data: RulesPayload }>(key, undefined, { revalidateOnFocus: false })

  const save = useCallback(
    async (draft: RuleDraft, id?: string): Promise<Rule> => {
      const res = await axiosInstance.post<{ data: Rule }>(id ? `${base(projectId!)}/${id}` : base(projectId!), savedIn(draft, browserTZ()))
      await mutate()
      return res.data.data
    },
    [projectId, mutate],
  )
  const setActive = useCallback(
    async (id: string, isActive: boolean) => {
      // Shown at once; put back if the server says no.
      await mutate(
        async (cur) => {
          await axiosInstance.post(`${base(projectId!)}/${id}/active`, { is_active: isActive })
          return cur
        },
        {
          optimisticData: (cur) =>
            cur
              ? { data: { ...cur.data, rules: cur.data.rules.map((r) => (r.id === id ? { ...r, is_active: isActive, paused_reason: isActive ? null : r.paused_reason } : r)) } }
              : { data: { rules: [], can_manage: false, templates: [], max: 50 } },
          rollbackOnError: true,
          revalidate: true,
        },
      )
    },
    [projectId, mutate],
  )
  const remove = useCallback(
    async (id: string) => {
      await axiosInstance.post(`${base(projectId!)}/${id}/delete`)
      await mutate()
    },
    [projectId, mutate],
  )

  return { payload: data?.data, error, isLoading, save, setActive, remove, refresh: mutate }
}

/** A project's runs (or one rule's), newest first, and Undo. */
export function useRuleRuns(projectId: string | undefined, ruleId?: string) {
  const key = projectId ? runsKey(projectId, ruleId) : ""
  const { data, isError: error, isLoading, mutate } = useFetch<{ data: RuleRun[] | null }>(key, undefined, { revalidateOnFocus: false })
  const undo = useCallback(
    async (runId: string): Promise<RuleRun> => {
      const res = await axiosInstance.post<{ data: RuleRun }>(`${base(projectId!)}/runs/${runId}/undo`)
      await mutate()
      return res.data.data
    },
    [projectId, mutate],
  )
  return { runs: listOnceRead<{ data: RuleRun[] | null }, RuleRun>(data, (a) => a.data), error, isLoading, undo, refresh: mutate }
}
