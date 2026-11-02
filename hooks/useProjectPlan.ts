"use client"

// A project's plan (linear-15) and what the reader may change in it. A change
// shows at once, then the server's answer (it names the lead, snaps the dates,
// ids new labels); a refusal puts the plan back and throws, so the caller says
// the server's words.

import { useCallback } from "react"
import axiosInstance, { OWN_ERRORS } from "@/lib/axiosInstance"
import { useFetch } from "@/hooks/useFetch"
import type { PlanChange, PlanRegistry, ProjectPlan, ProjectPlanAnswer } from "@/lib/work/projectPlan"

const planPath = (projectId: string) => `/project/${encodeURIComponent(projectId)}/plan`

export function useProjectPlan(projectId: string | undefined) {
  const key = projectId ? planPath(projectId) : ""
  const read = useFetch<ProjectPlanAnswer>(key, undefined, undefined, OWN_ERRORS)
  const { data, mutate } = read
  const answer = data?.data

  /** Makes the change, showing `shown` (the parts as they'll read) until the server answers. */
  const save = useCallback(
    async (change: PlanChange, shown: Partial<ProjectPlan> = {}) => {
      if (!key || !answer) return
      const withPlan = (plan: ProjectPlan): ProjectPlanAnswer => ({ ...data, data: { ...answer, plan } })
      await mutate(
        async () => {
          const res = await axiosInstance.post<ProjectPlanAnswer>(key, change, OWN_ERRORS)
          const plan = (res.data?.data as { plan?: ProjectPlan } | undefined)?.plan
          // An answer without the plan keeps the change the server took, as shown.
          return withPlan(plan ?? { ...answer.plan, ...shown })
        },
        { optimisticData: withPlan({ ...answer.plan, ...shown }), rollbackOnError: true, populateCache: true, revalidate: false },
      )
    },
    [answer, data, key, mutate],
  )

  return {
    plan: answer?.plan,
    /** Its admins and members (who post its updates) change it; never on an archived project. */
    canEdit: !!answer?.can_edit,
    /** Its admins choose its lead. */
    canLead: !!answer?.can_lead,
    /** The plan couldn't be read, and nothing read earlier stands in. */
    failed: !!read.isError && !answer,
    retry: () => void mutate(),
    save,
  }
}

/** The workspace's statuses and labels under one key, read while shown; failed offers Try again; retry waits. */
export function usePlanRegistry(on: boolean) {
  const read = useFetch<{ data?: PlanRegistry }>(on ? "/project/plan/registry" : "", undefined, undefined, OWN_ERRORS)
  const registry = read.data?.data
  return { registry, failed: !!read.isError && !registry, retry: () => read.mutate() }
}

export type ProjectPlanRead = ReturnType<typeof useProjectPlan>
