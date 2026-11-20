"use client"
import { useMemo } from "react"
import { useConfirm } from "@/hooks/useConfirm"
import type { ProjectCalls } from "@/hooks/useProjectPolicy"
import axiosInstance, { OWN_ERRORS } from "@/lib/axiosInstance"
import { appMutate } from "@/lib/swrMutate"
import { projectPoliciesKey } from "@/services/workAccessService"

/**
 * What a project's page hands its lazy views and dialogs (hooks/useProjectPolicy's ProjectCalls), so their
 * chunks import none of the shared core (app/slaLazy.test, app/triageLazy.test): the project's tools hand it
 * to the SLA, access and triage settings, the Triage tab to its queue.
 */
export function useProjectCalls(projectId: string): ProjectCalls {
  const confirm = useConfirm()
  return useMemo<ProjectCalls>(() => ({ http: axiosInstance, quiet: OWN_ERRORS, mutate: appMutate, policies: projectPoliciesKey(projectId), confirm }), [projectId, confirm])
}
