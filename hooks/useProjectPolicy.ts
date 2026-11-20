"use client"

import { useCallback, useState } from "react"
import { useSaveStatus } from "@/components/ui/saveStatus"
import { useKeptRead } from "@/lib/lazy/useKeptRead"
import type { PolicyInfo } from "@/services/workAccessService"

/**
 * What the project's page hands its lazy settings dialogs (ProjectAccessDialog, ProjectSlaDialog), so their
 * chunks import none of the shared core (app/slaLazy.test): the page's HTTP client and the options that keep a
 * failure to the dialog (lib/axiosInstance, OWN_ERRORS), the page's cache (lib/swrMutate's appMutate) and the
 * project's policies' path (services/workAccessService's projectPoliciesKey).
 */
export interface ProjectCalls {
  http: {
    get<T>(url: string, config?: object): Promise<{ data: T }>
    post<T>(url: string, body?: unknown, config?: object): Promise<{ data: T }>
    put<T>(url: string, body?: unknown, config?: object): Promise<{ data: T }>
    patch<T>(url: string, body?: unknown, config?: object): Promise<{ data: T }>
    delete<T>(url: string, config?: object): Promise<{ data: T }>
  }
  quiet: object
  mutate: (key: string | ((key: unknown) => boolean), data?: unknown, opts?: { revalidate?: boolean }) => Promise<unknown>
  policies: string
  /** The house confirm (hooks/useConfirm), handed in as the rest: a lazy dialog's chunk takes none of the store. */
  confirm: (ask: { title: string; description: string; confirmText?: string; destructive?: boolean; onConfirm: () => unknown }) => void
}

/**
 * One of a project's policies, read while `when` and saved by its admins: who can change its tasks
 * (ProjectAccessDialog), SLAs on (ProjectSlaDialog). `picked` is the choice being saved, shown until the
 * server answers; `choose` saves it with an Undo back to what was shown. What each person may do, and
 * what the project's rows carry, follows a policy, so every other read of the project is asked again.
 */
export function useProjectPolicy(projectId: string, policyKey: string, when: boolean, calls: ProjectCalls) {
  const { http, quiet, mutate, policies: key } = calls
  const load = useCallback(() => http.get<{ data: PolicyInfo[] }>(key, quiet).then((r) => r.data), [http, key, quiet])
  const policies = useKeptRead<{ data: PolicyInfo[] }>(when ? key : null, load)
  const info = policies.data?.data?.find((p) => p.key === policyKey)
  const [picked, setPicked] = useState<unknown>(undefined)
  const { status, run } = useSaveStatus()

  const choose = async (value: unknown, what: string, undo: () => unknown): Promise<boolean> => {
    setPicked(value)
    const held = await run(async () => {
      const saved = (await http.put<{ data: PolicyInfo }>(`${key}/${policyKey}`, { value }, quiet)).data.data
      const next = { data: (policies.data?.data ?? []).map((p) => (p.key === policyKey ? saved : p)) }
      policies.keep(next)
      await mutate(key, next, { revalidate: false })
    }, { what, undo })
    setPicked(undefined)
    if (held) void mutate((k) => typeof k === "string" && k.includes(projectId) && k !== key)
    return held
  }

  return { info, picked, status, choose, isError: policies.failed, retry: () => void policies.again() }
}
