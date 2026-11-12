import type { ClientConfig } from "@/hooks/useClientConfig"

/**
 * The plan's answer, GET /admin/plan (admin only; /admin/seats is the same
 * answer for older web builds). hooks/usePlan is its one reader.
 */

/**
 * The company controls the free release leaves out (helpers/planFeatures.go
 * on the server): single sign-on, LDAP, SCIM and audit export. Screens for
 * those read the plan to explain the lock up front instead of failing on click.
 */
export type PlanFeature = "sso" | "ldap" | "scim" | "audit_export"

/** free: the free release; licensed: a release without the seat stamp; cloud: OneCamp Cloud; source: built from source. */
export type PlanKind = "free" | "licensed" | "cloud" | "source"

/** The ways past the free plan, from the server, so the web app names no host. */
export interface PlanLinks {
  licence: string
  cloud: string
  account: string
  pricing: string
}

export interface PlanControl {
  key: PlanFeature
  included: boolean
}

export interface PlanAnswer {
  plan?: PlanKind
  used?: number
  /** 0 = no limit. */
  limit?: number
  free_plan?: boolean
  locked?: PlanFeature[]
  controls?: PlanControl[]
  release?: { running: string; edition: string }
  managed?: boolean
  hosting?: ClientConfig["hosting"]
  upgrade_url?: string
  links?: PlanLinks
}
