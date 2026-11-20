// A project's triage on the web (linear-21 H3; backend business/Triage, H1): what its queue reads,
// what a decision sends, and the words for both. Pure, so the tab's lazy chunk and the page share it.

/** The project's policies the admin sheet switches (business/Policy ProjectsTriage, ProjectsTriagePriority). */
export const TRIAGE_ON = "projects.triage"
export const TRIAGE_PRIORITY = "projects.triage.priority"

/** What the project's info carries of its triage (project_triage): absent for a guest, or from a server before H1b. */
export interface ProjectTriage {
  on: boolean
  waiting: number
}

// Laid over the project's info here, not in types/project: every route's first load reads that file (app/firstLoad.test).
declare module "@/types/project" {
  interface ProjectInfoInterface {
    /** Its triage (laid over the read by the server, H1b): on, and how many tasks wait. Absent for a guest. */
    project_triage?: ProjectTriage
  }
}

/** A task waiting in triage, as GET /project/{id}/triage answers it (business/Triage Request). */
export interface TriageRequest {
  task_uuid: string
  project_uuid: string
  source: string
  requester_uuid?: string
  requester_name: string
  requester_email: string
  arrived_at: string
  snoozed_until?: string
  name: string
  status: string
}

export interface TriageQueueRead {
  on: boolean
  requests: TriageRequest[]
  can_decide: boolean
}

/** A decision and what it takes (business/Triage Choice): a reason to decline, the original of a duplicate, when a snooze ends. */
export type TriageChoice =
  | { decision: "accept"; status?: string }
  | { decision: "decline"; reason: string }
  | { decision: "duplicate"; duplicate_of: string }
  | { decision: "snooze"; until: string }

export const triageKey = (projectId: string) => `/project/${projectId}/triage`
export const decidePath = (taskId: string) => `/task/triage/${taskId}/decide`

/** Whether the project's tab is drawn, and its count: only while its info says triage is on. */
export function triageShown(triage: ProjectTriage | undefined | null): { on: boolean; count: number } {
  return triage?.on ? { on: true, count: Math.max(0, triage.waiting || 0) } : { on: false, count: 0 }
}

// Every door, as business/Triage Sources names them.
const SOURCES: Record<string, string> = { form: "Form", api: "API", agent: "Agent", github: "GitHub", chat: "Chat", import: "Import" }

/** Where a request came from, in a word. */
export const sourceWord = (source: string) => SOURCES[source] ?? "Elsewhere"

/** Who asked: a member's or a visitor's name, else their email, else nothing. */
export const requesterOf = (r: Pick<TriageRequest, "requester_name" | "requester_email">) => r.requester_name.trim() || r.requester_email.trim()

/** A triage key that isn't the list's (lib/listKeys: J, K, X, Enter and P are): 1 accepts, 2 declines, 3 marks a duplicate, H snoozes. */
export type TriageKey = "accept" | "decline" | "duplicate" | "snooze"
export function triageKeyOf(e: { key: string; ctrlKey: boolean; metaKey: boolean; altKey: boolean; shiftKey: boolean }): TriageKey | null {
  if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return null
  switch (e.key) {
    case "1":
      return "accept"
    case "2":
      return "decline"
    case "3":
      return "duplicate"
    case "h":
    case "H":
      return "snooze"
    default:
      return null
  }
}

/** The row lit after one leaves: the next, else the one before, else none. */
export function nextAfter(order: readonly string[], gone: string): string | null {
  const i = order.indexOf(gone)
  if (i < 0) return order[0] ?? null
  return order[i + 1] ?? order[i - 1] ?? null
}
