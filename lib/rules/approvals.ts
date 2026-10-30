/**
 * A project's status rules and approval requests (package 9 R2 and R2b,
 * backend business/Approvals): the shapes the server sends.
 */
import type { PersonNameFields } from "@/lib/personName"
import type { StatusOption } from "@/lib/taskStatus"

export type Who = "anyone" | "admins" | "people"
export type Requirable = "assignee" | "due" | "tags" | "description"
/** "moved_on": the task went on without it (moved by another path, or deleted). */
export type ApprovalState = "pending" | "approved" | "changes" | "rejected" | "withdrawn" | "moved_on"
export type Verdict = "approve" | "changes" | "reject"
export type ApprovalKind = "task" | "doc" | "file"

export interface StatusRule {
  project_id: string
  status: string
  who: Who
  people: string[]
  required: Requirable[]
  approvers: string[]
  approvals_needed: number
  /** A move here also waits for the client's yes, from their link. */
  client: boolean
  updated_by: string
  updated_at: string
}

export interface StatusRuleInput {
  status: string
  who: Who
  people: string[]
  required: Requirable[]
  approvers: string[]
  approvals_needed: number
  client: boolean
}

export interface StatusRulesPayload {
  rules: StatusRule[]
  can_manage: boolean
  max: number
}

export interface ApprovalDecision {
  user_id: string
  /** The client's answer, from their link: it names the link's holder, never a member. */
  client?: boolean
  name?: string
  verdict: Verdict
  comment: string
  decided_at: string
}

export interface TaskApproval {
  id: string
  resource_kind: ApprovalKind
  resource_id: string
  project_id: string
  task_id: string
  /** Where a held move waits to go; empty when the item itself was asked about. */
  to_status: string
  to_name: string
  /** What the asker asks, in their words. */
  ask?: string
  due_at?: string
  requested_by: string
  approvers: string[]
  needed: number
  /** The client must say yes too. */
  client: boolean
  state: ApprovalState
  created_at: string
  decided_at?: string | null
  decisions: ApprovalDecision[]
  can_decide: boolean
  can_withdraw: boolean
}

/** POST /task/approval/{task}/ask: the item itself, approved by these people and, when asked, its client. */
export interface AskInput {
  approvers: string[]
  needed: number
  client: boolean
  due_at: string | null
  ask: string
}

/** The server's bound on what is asked (business/Approvals MaxAsk). */
export const MAX_ASK = 500

/** A request waiting for the reader's answer (GET /approvals/waiting), read as them. */
export interface WaitingApproval {
  approval_id: string
  kind: ApprovalKind
  id: string
  title: string
  path: string
  to_name?: string
  ask?: string
  due_at?: string
  requested_by: string
  created_at: string
  project_id?: string
  project_name?: string
  /** Who asked, as anyone may be shown them; absent when they couldn't be read. */
  asker?: PersonNameFields & { user_uuid: string; is_bot?: boolean }
}

/**
 * A request for a client's yes, as their link reads it on a task (the guest
 * project and task reads): their words or where a held move goes, by when,
 * and who asked.
 */
export interface GuestAsk {
  ask?: string
  to_label?: string
  due_at?: string
  asked_by: string
  asked_at: string
}

export const REQUIRABLE: { value: Requirable; label: string }[] = [
  { value: "assignee", label: "An assignee" },
  { value: "due", label: "A due date" },
  { value: "tags", label: "A tag" },
  { value: "description", label: "A description" },
]

/** How many approvers have said yes; the client's yes is apart (clientApproved). */
export function approvals(a: TaskApproval): number {
  return a.decisions.filter((d) => d.verdict === "approve" && !d.client).length
}

/** Whether the client, when the request wants them, has said yes. */
export const clientApproved = (a: TaskApproval) => a.decisions.some((d) => d.client && d.verdict === "approve")

/**
 * The state of a request, in words: once its approvers are done, what's left
 * is the client's yes. A held move the task went on without names where the
 * task is now, when the reader knows and it isn't where the move would have
 * taken it.
 */
export function approvalWords(a: TaskApproval, now?: Pick<StatusOption, "value" | "label">): string {
  switch (a.state) {
    case "pending":
      if (a.client && approvals(a) >= a.needed && !clientApproved(a)) return "Waiting for the client"
      return a.needed > 1 ? `Waiting for approval · ${approvals(a)} of ${a.needed}` : "Waiting for approval"
    case "approved":
      return "Approved"
    case "changes":
      return "Changes asked for"
    case "rejected":
      return "Rejected"
    case "withdrawn":
      return "Withdrawn"
    case "moved_on":
      return a.to_status && now && now.value !== a.to_status ? `Closed: the task moved to ${now.label}` : "Closed: the task moved on"
  }
}

/** A rule in words, for a status's row: "Admins only · needs an assignee · 2 approvals and the client's". */
export function ruleSummary(r: Pick<StatusRule, "who" | "required" | "approvers" | "approvals_needed" | "client">): string {
  const parts: string[] = []
  if (r.who === "admins") parts.push("Admins only")
  if (r.who === "people") parts.push("Named people only")
  const req = REQUIRABLE.filter((x) => r.required.includes(x.value)).map((x) => x.label.toLowerCase())
  if (req.length) parts.push(`needs ${req.join(", ")}`)
  const members = r.approvers.length ? (r.approvals_needed > 1 ? `${r.approvals_needed} approvals` : "an approval") : ""
  if (members || r.client) parts.push(members && r.client ? `${members} and the client's` : members || "the client's approval")
  const said = parts.join(" · ")
  return said ? said[0].toUpperCase() + said.slice(1) : "Anyone, any time"
}
