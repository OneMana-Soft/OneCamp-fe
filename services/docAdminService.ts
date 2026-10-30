/**
 * Docs for admins (docs C6-2): the docs policies (export, the longest a link
 * lasts, the sites docs can embed), how many links a shorter lifetime would
 * stop now, and the work of people who left: handing it on, or turning their
 * links off. Admin routes; the server records every change.
 */
import axiosInstance, { OWN_ERRORS } from "@/lib/axiosInstance"
import { ADMIN_POLICIES_KEY, type PolicyInfo } from "@/services/workAccessService"

/** The docs policies, by key (business/Policy). */
export const DOCS_EXPORT_MEMBERS = "docs.export.members"
export const GUEST_LINK_MAX_DAYS = "guest.link.max_days"
export const EMBED_ALLOWLIST = "embed.allowlist"

/** The people who left with work under their name. */
export const DEPARTED_KEY = "/admin/departed"

export interface DepartedPerson {
  user_uuid: string
  name: string
  left_at: string
  docs: number
  links: number
}

export interface Moved {
  docs: number
  links: number
  failed: number
}

/** Sets one policy; its new state. */
export async function setPolicy(key: string, value: unknown): Promise<PolicyInfo> {
  const res = await axiosInstance.put<{ data: PolicyInfo }>(`${ADMIN_POLICIES_KEY}/${key}`, { value }, OWN_ERRORS)
  return res.data.data
}

/** How many live links a longest lifetime of days would stop now. */
export async function linksStoppedBy(days: number): Promise<number> {
  const res = await axiosInstance.get<{ data: { links: number } }>(`/admin/guest-links/stopped?days=${days}`, OWN_ERRORS)
  return res.data.data.links
}

/** Hands everything a person who left still owns to someone in the workspace. */
export async function handOver(from: string, to: string): Promise<Moved> {
  const res = await axiosInstance.post<{ data: Moved }>(`${DEPARTED_KEY}/${encodeURIComponent(from)}/handover`, { to_user_uuid: to }, OWN_ERRORS)
  return res.data.data
}

/** Turns off every link and page a person who left made or published; how many. */
export async function turnOffLinks(who: string): Promise<number> {
  const res = await axiosInstance.post<{ data: { links: number } }>(`${DEPARTED_KEY}/${encodeURIComponent(who)}/links/off`, {}, OWN_ERRORS)
  return res.data.data.links
}

/** A link lifetime in words: "Off", "7 days", "1 year". Pure. */
export function lifetimeLabel(days: number): string {
  if (days <= 0) return "Off"
  if (days === 365) return "1 year"
  return days === 1 ? "1 day" : `${days} days`
}
