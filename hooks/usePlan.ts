"use client"

import { useFetch } from "@/hooks/useFetch"
import { GetEndpointUrl } from "@/services/endPoints"

/**
 * What this workspace's plan includes, from GET /admin/seats (admin only).
 *
 * The free release leaves out company controls (helpers/planFeatures.go on the
 * server): single sign-on, LDAP, SCIM and audit export. Screens for those read
 * this to explain the lock up front instead of failing on click. While loading,
 * or when the call fails, nothing is treated as locked: the server still
 * refuses, so the worst case is a refusal message, never a hidden feature on a
 * licensed workspace.
 */
export type PlanFeature = "sso" | "ldap" | "scim" | "audit_export"

interface SeatsResponse {
  data?: { used: number; limit: number; upgrade_url?: string; free_plan?: boolean; locked?: PlanFeature[] }
}

export function usePlan() {
  const { data } = useFetch<SeatsResponse>(GetEndpointUrl.AdminSeats)
  const locked = new Set(data?.data?.locked ?? [])
  return {
    freePlan: data?.data?.free_plan === true,
    isLocked: (f: PlanFeature) => locked.has(f),
    // From the server, so the web app names no deployment of its own.
    upgradeUrl: data?.data?.upgrade_url,
  }
}
