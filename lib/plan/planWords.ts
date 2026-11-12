/**
 * The plan's words, in one table: every screen that names the plan, the
 * limit or the way past it says it the same way. The limit is always the
 * server's number (usePlan's limit, or a refusal's), never typed here, so the
 * copy can't drift from what the workspace is on. Pure.
 */
import type { PlanKind } from "@/types/plan"

/** The one call to action at the limit: "Remove the 25-person limit". */
export const removeLimit = (limit: number) => `Remove the ${limit}-person limit`

/** What a member who meets the limit can do. */
export const askAdmin = (limit: number) => `Ask an admin to remove the ${limit}-person limit.`

/** The one call to action on a locked company control. */
export const UNLOCK_CONTROLS = "Unlock company controls"

/** Why paying is worth it, beside the limit. */
export const LICENSED_VALUE = "Licensed workspaces have no limit and turn on company controls."

const PLAN_NAMES: Record<PlanKind, string> = {
  free: "Free",
  licensed: "Licensed",
  cloud: "OneCamp Cloud",
  source: "Built from source",
}

/** The plan's name: "Free", "Licensed", "OneCamp Cloud" or "Built from source". */
export const planName = (plan: PlanKind) => PLAN_NAMES[plan]
