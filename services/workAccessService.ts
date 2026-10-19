/**
 * Work Access (A1) on the web: someone's role in a project, a project's own
 * "Who can change tasks", the workspace's default for it, and the admins'
 * one-time notices. The server decides and records every change; these only
 * ask.
 */

import axiosInstance, { OWN_ERRORS } from "@/lib/axiosInstance"
import type { EditWho, Role } from "@/lib/work/types"

/** One policy as the server shows it (business/Policy Info). */
export interface PolicyInfo {
  key: string
  kind: string
  label: string
  help: string
  /** What it is now; for a project, its own or else the workspace's. */
  value: unknown
  /** For a project, the workspace's; for the workspace, the built-in one. */
  default: unknown
  /** Whether this project (or the workspace) chose its own. */
  is_set: boolean
  choices?: string[]
}

/** The policy that says who changes a project's tasks. */
export const EDIT_WHO = "projects.edit.who"

/** A project's own policies, as SWR keys them. */
export const projectPoliciesKey = (projectId: string) => `/project/${projectId}/policies`

/** The workspace's policies, for its admins. */
export const ADMIN_POLICIES_KEY = "/admin/policies"

/** Sets who changes the project's tasks; null gives it back to the workspace's. */
export async function setProjectEditWho(projectId: string, value: EditWho | null): Promise<PolicyInfo> {
  const res = await axiosInstance.put<{ data: PolicyInfo }>(`${projectPoliciesKey(projectId)}/${EDIT_WHO}`, { value }, OWN_ERRORS)
  return res.data.data
}

/** Gives someone in the project a role. */
export async function setMemberRole(projectId: string, userId: string, role: Role): Promise<void> {
  await axiosInstance.post(`/project/${projectId}/members/${userId}/role`, { role }, OWN_ERRORS)
}

/** A one-time notice for the signed-in person (business/Notice). */
export interface Notice {
  key: string
  data?: Record<string, string>
}

/** The notices, as SWR keys them. */
export const NOTICES_KEY = "/notices"

/** The admins' notice that members now change tasks. */
export const MEMBERS_EDIT_NOTICE = "projects.members_edit"

/** Dismisses a notice, for good and on every device. */
export async function dismissNotice(key: string): Promise<void> {
  await axiosInstance.post(`${NOTICES_KEY}/${encodeURIComponent(key)}/seen`, undefined, OWN_ERRORS)
}

/** Each "Who can change tasks", as the app words it. */
export const EDIT_WHO_CHOICES: { value: EditWho; label: string; detail: string }[] = [
  { value: "members", label: "Members", detail: "Everyone who works in the project changes any of its tasks." },
  { value: "assigned", label: "Members, on their own tasks", detail: "Members change the tasks assigned to them, and still add new ones." },
  { value: "admins", label: "Admins only", detail: "Only the project's admins add and change its tasks. Members read and comment." },
]

/** A choice's name, or the value itself for one the app doesn't know. */
export function editWhoLabel(value: unknown): string {
  return EDIT_WHO_CHOICES.find((c) => c.value === value)?.label ?? String(value ?? "")
}
