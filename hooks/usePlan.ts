"use client"

import { useFetch } from "@/hooks/useFetch"
import type { PlanAnswer, PlanFeature } from "@/types/plan"
import { planHref } from "@/lib/plan/planHref"
import { OWN_ERRORS } from "@/lib/http/ownErrors"
import { GetEndpointUrl } from "@/services/endPoints"

/**
 * What this workspace is on (types/plan.ts): the one reader of the plan, so
 * the seat meter, the limit notes, the locked company controls and the plan
 * card read one answer and one SWR key. While loading, or when the call
 * fails, nothing is locked: the server still refuses, so the worst case is a
 * refusal, never a hidden feature on a licensed workspace. `enabled: false`
 * asks nothing (a dialog that isn't open). `quiet` is for a reader that says
 * a failed read in place or not at all (the shell's plan row and seats notice,
 * on every page): no error toast comes from it.
 */
export function usePlan({ enabled = true, quiet = false }: { enabled?: boolean; quiet?: boolean } = {}) {
  const { data, isError, mutate } = useFetch<{ data?: PlanAnswer }>(
    enabled ? GetEndpointUrl.AdminPlan : "",
    undefined,
    undefined,
    quiet ? OWN_ERRORS : undefined,
  )
  const plan = data?.data
  const locked = new Set(plan?.locked ?? [])
  return {
    /** The server has answered. */
    known: !!plan,
    /** The read failed, with nothing to show. */
    failed: !plan && !!isError,
    plan: plan?.plan,
    used: plan?.used ?? 0,
    /** 0 = no limit. */
    limit: plan?.limit ?? 0,
    freePlan: plan?.free_plan === true,
    isLocked: (f: PlanFeature) => locked.has(f),
    controls: plan?.controls ?? [],
    release: plan?.release,
    managed: plan?.managed === true,
    hosting: plan?.hosting,
    links: plan?.links,
    /** Where an admin removes the limit, as the server names it. */
    upgradeUrl: planHref(plan?.links) ?? plan?.upgrade_url,
    /** Reads the plan again (someone joined or left). */
    mutate,
  }
}
