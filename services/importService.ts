/**
 * Generic Import service — wraps /admin/import/{provider}/* endpoints
 * for the Asana / Jira / Trello / Notion / Todoist pipeline.
 *
 * The legacy slackImportService remains for the Slack-specific FE
 * because its plan/upload UX is custom to channels-and-messages.
 */

import axiosInstance, { OWN_ERRORS } from "@/lib/axiosInstance"
import { PostEndpointUrl } from "@/services/endPoints"

// Provider names mirror models/postgres/Import.ProviderXxx on the BE.
export type ImportProvider = "trello" | "asana" | "jira" | "notion" | "todoist" | "linear" | "clickup" | "monday"

// Display names for providers whose brand isn't the capitalised id.
const PROVIDER_LABELS: Partial<Record<ImportProvider, string>> = {
  monday: "monday.com",
}

export function importProviderLabel(provider: string): string {
  return PROVIDER_LABELS[provider as ImportProvider] ?? provider.charAt(0).toUpperCase() + provider.slice(1)
}

export interface ProviderInfo {
  name: ImportProvider
  sources: string[]
  capabilities: string[]
  default_status_map: Record<string, string>
  default_priority_map: Record<string, string>
}

export interface ConnectionView {
  provider: ImportProvider
  source_account_id?: string
  source_account_name?: string
  scopes?: string
  expires_at?: string
  metadata?: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface ImportPlan {
  user_count: number
  user_new: number
  user_merge: number
  team_count: number
  project_count: number
  task_count: number
  subtask_count: number
  comment_count: number
  file_count: number
  file_bytes: number
  warnings?: string[]
  status_values?: string[]
  priority_values?: string[]
  // Slack-shaped fields kept for backward-compat with the existing FE.
  channel_count?: number
  channel_conflict?: number
  message_count?: number
  thread_count?: number
}

export interface ImportJob {
  id: string
  provider: ImportProvider | "slack"
  source_workspace_name: string
  source: string
  status:
    | "pending"
    | "validating"
    | "planned"
    | "running"
    | "paused"
    | "completed"
    | "failed"
    | "cancelled"
    | "rolled_back"
  stage?: string
  started_at?: string
  completed_at?: string
  options: Record<string, unknown>
  plan?: ImportPlan
  progress?: Record<string, unknown>
  error_message?: string
  triggered_by?: string
  created_at: string
  updated_at: string
  chunks_total: number
  chunks_done: number
  chunks_failed: number
  items_imported: number
  errors_total: number
  status_mappings?: Record<string, string>
  priority_mappings?: Record<string, string>
}

export interface ImportError {
  id: string
  entity_type?: string
  source_id?: string
  slack_id?: string
  severity: "warning" | "error" | "fatal"
  code?: string
  message: string
  context?: unknown
  created_at: string
}

export async function listImportProviders(): Promise<ProviderInfo[]> {
  const res = await axiosInstance.get("/admin/import/providers")
  return res.data?.providers ?? []
}

export async function listImportConnections(): Promise<ConnectionView[]> {
  const res = await axiosInstance.get("/admin/import/connections")
  return res.data?.connections ?? []
}

interface ConnectInput {
  access_token: string
  refresh_token?: string
  scopes?: string
  expires_at_unix?: number
  source_account_id?: string
  source_account_name?: string
  // metadata.api_key is required for Trello (plus the user token in access_token).
  metadata?: Record<string, string>
}

/** Connects a provider. The server tests the token first and says what is wrong with it. */
export async function connectImport(provider: ImportProvider, input: ConnectInput): Promise<void> {
  await axiosInstance.post(`/admin/import/${encodeURIComponent(provider)}/connect`, input, OWN_ERRORS)
}

export async function disconnectImport(provider: ImportProvider): Promise<void> {
  await axiosInstance.post(`/admin/import/${encodeURIComponent(provider)}/disconnect`)
}

interface CreateJobInput {
  source_workspace_name: string
  source?: string
  options?: Record<string, unknown>
}

export async function createImportJob(provider: ImportProvider, input: CreateJobInput): Promise<{ job_id: string }> {
  const res = await axiosInstance.post(`/admin/import/${encodeURIComponent(provider)}/jobs`, input)
  return res.data
}

// ─── Presign + finalize (for ZIP-shaped sources) ────────────────────

interface PresignResponse {
  job_id: string
  provider: string
  source_workspace_name: string
  raw_object_key: string
  upload_url: string
  expires_in: number
  method: "PUT"
  headers: Record<string, string>
}

export async function presignImportUpload(
  provider: ImportProvider,
  workspaceName: string,
  fileSize: number,
  source: string = "export_zip",
): Promise<PresignResponse> {
  const res = await axiosInstance.post(`/admin/import/${encodeURIComponent(provider)}/presign`, {
    source_workspace_name: workspaceName,
    file_size: fileSize,
    source,
  })
  return res.data
}

export async function finalizeImportUpload(provider: ImportProvider, jobId: string): Promise<void> {
  await axiosInstance.post(
    `/admin/import/${encodeURIComponent(provider)}/finalize/${encodeURIComponent(jobId)}`,
  )
}

// ─── Plan / Run / Cancel / Rollback / Errors ────────────────────────

interface PlanInput {
  options?: Record<string, unknown>
  status_mappings?: Record<string, string>
  priority_mappings?: Record<string, string>
}

export async function planImportJob(jobId: string, input: PlanInput = {}): Promise<ImportPlan> {
  const res = await axiosInstance.post(
    `/admin/import/jobs/${encodeURIComponent(jobId)}/plan`,
    input,
    OWN_ERRORS,
  )
  return res.data
}

// The screen that starts or resumes an import says what went wrong itself
// (importProblemOf), as planning does: a refusal such as "the last run is
// still stopping" (409 run_alive) comes in `error`, which the global toast
// does not read, so it added "Already changed" beside the screen's own.
export async function runImportJob(jobId: string, input: PlanInput = {}): Promise<void> {
  await axiosInstance.post(
    `/admin/import/jobs/${encodeURIComponent(jobId)}/run`,
    input,
    OWN_ERRORS,
  )
}

/** Stops a running import, or discards one still waiting to be planned or run. */
export async function cancelImportJob(jobId: string): Promise<void> {
  await axiosInstance.post(`/admin/import/jobs/${encodeURIComponent(jobId)}/cancel`)
}

export async function rollbackImportJob(jobId: string): Promise<void> {
  await axiosInstance.post(`/admin/import/jobs/${encodeURIComponent(jobId)}/rollback`)
}

export async function deleteImportStagedZip(jobId: string): Promise<void> {
  await axiosInstance.delete(`/admin/import/jobs/${encodeURIComponent(jobId)}/staged-zip`)
}

export async function getImportJob(jobId: string): Promise<ImportJob> {
  const res = await axiosInstance.get(`/admin/import/jobs/${encodeURIComponent(jobId)}`)
  return res.data
}

export async function listImportJobs(provider?: ImportProvider): Promise<ImportJob[]> {
  const url = provider
    ? `/admin/import/jobs?provider=${encodeURIComponent(provider)}`
    : `/admin/import/jobs`
  const res = await axiosInstance.get(url)
  return res.data?.jobs ?? []
}

export async function getImportErrors(
  jobId: string,
  severity?: "warning" | "error" | "fatal",
  limit = 100,
  offset = 0,
): Promise<ImportError[]> {
  const params = new URLSearchParams()
  if (severity) params.set("severity", severity)
  params.set("limit", String(limit))
  params.set("offset", String(offset))
  const res = await axiosInstance.get(
    `/admin/import/jobs/${encodeURIComponent(jobId)}/errors?${params.toString()}`,
  )
  return res.data?.errors ?? []
}


// ─── Discovery (live-API providers) ──────────────────────────────────

export interface DiscoverItem {
  id: string
  name: string
  description?: string
  url?: string
  kind: string
  meta?: Record<string, unknown>
}

/**
 * List the resources the admin's connected token can see (Trello
 * boards, Asana workspaces, Jira projects, Notion task databases,
 * Todoist projects). The FE uses this to populate the "pick a
 * workspace/board" dropdown when creating a new job, so the operator
 * doesn't have to copy-paste IDs.
 *
 * Returns an empty array if the provider doesn't expose discovery
 * (the BE responds 404 with code:"no_discover" — caller treats that
 * as "no list, fall back to manual id entry").
 */
export async function discoverImportResources(provider: ImportProvider): Promise<DiscoverItem[]> {
  try {
    const res = await axiosInstance.post(
      `/admin/import/${encodeURIComponent(provider)}/discover`,
      undefined,
      OWN_ERRORS,
    )
    return res.data?.items ?? []
  } catch (err: any) {
    const code = err?.response?.data?.code
    if (code === "no_discover") {
      return []
    }
    throw err
  }
}

/**
 * What went wrong talking to an import source, as the server said it. code is
 * "token_rejected" or "not_connected" when reconnecting is the way out,
 * "job_changed" when the import moved on meanwhile (Run started it from
 * another tab, say), and also "unreachable", "rate_limited", "active_job",
 * "file_gone", "plan_failed" or "provider_error".
 */
export interface ImportProblem {
  code?: string
  message: string
}

export function importProblemOf(err: unknown, fallback = "That didn't work. Try again."): ImportProblem {
  const e = err as { response?: { data?: { error?: string; msg?: string; code?: string } } }
  const data = e?.response?.data
  if (!e?.response) return { message: "Couldn't reach the server. Check your connection and try again." }
  return { code: data?.code, message: data?.error || data?.msg || fallback }
}

/** Whether connecting again is the way out of a problem. */
export const needsReconnect = (p: ImportProblem | null | undefined) => p?.code === "token_rejected" || p?.code === "not_connected"

/**
 * Whether the import moved on while it was being planned: there is nothing to
 * try again, only the import to load again and show as it is now.
 */
export const jobChanged = (p: ImportProblem | null | undefined) => p?.code === "job_changed"


/**
 * Retry every chunk in a job that's in `failed` status with
 * attempts >= max_attempts. Resets attempts to 0 and re-runs the
 * orchestrator so already-imported items aren't reprocessed.
 *
 * The job must be in a terminal state (cancel first if it's still
 * running). Returns the count of reset chunks; the import is
 * automatically resumed when count > 0.
 */
export async function retryFailedImportChunks(jobId: string): Promise<{ reset: number; rerun: boolean }> {
  const res = await axiosInstance.post(
    `/admin/import/jobs/${encodeURIComponent(jobId)}/retry-failed`,
    undefined,
    OWN_ERRORS,
  )
  return res.data
}

// ─── The people who came across ──────────────────────────────────────

/** Someone an import brought across who can be invited now. */
export interface InvitablePerson {
  user_id: string
  name: string
  email: string
}

/** The free plan's room. left is null when there is no limit. */
export interface SeatRoom {
  used: number
  limit: number
  left: number | null
}

/**
 * Whether invitations are emailed, and how many more can be today. left is
 * null when the day has no cap; lent email on OneCamp Cloud has one, and the
 * server keeps a few of it for password resets. Anyone invited past it is
 * invited all the same, with a link the admin shares.
 */
export interface EmailRoom {
  on: boolean
  left: number | null
}

/** Who an import brought across, as its admin is offered them. */
export interface ImportPeople {
  people: InvitablePerson[]
  already_members: number
  already_invited: number
  no_email: number
  left: number
  seats: SeatRoom
  email: EmailRoom
}

/** The SWR key of an import's invitation offer. */
export const importPeopleKey = (jobId: string) => `/admin/import/jobs/${encodeURIComponent(jobId)}/people`

export async function getImportPeople(jobId: string): Promise<ImportPeople> {
  const res = await axiosInstance.get(importPeopleKey(jobId), OWN_ERRORS)
  return res.data
}

/** How one of the caller's imports ended, until they dismiss it. */
export interface ImportOutcome {
  job_id: string
  provider: ImportProvider | "slack"
  label: string
  status: "completed" | "failed"
  error?: string
  items_imported: number
  finished_at: string
  people_to_invite: number
}

/** The SWR key of the caller's unseen import outcomes (the admin banner). */
export const IMPORT_OUTCOMES_KEY = "/admin/import/outcomes"

export async function markImportOutcomeSeen(jobId: string): Promise<void> {
  await axiosInstance.post(`/admin/import/jobs/${encodeURIComponent(jobId)}/outcome-seen`, undefined, OWN_ERRORS)
}

/** What inviting the people from an import came to. */
export interface InviteRun {
  invited: InvitablePerson[]
  /** Already had an invitation (someone else invited them in the meantime). */
  alreadyInvited: InvitablePerson[]
  failed: { person: InvitablePerson; msg: string }[]
  /** The plan filled before everyone was invited: its message, and who is left. */
  seatLimit: { msg: string; notInvited: InvitablePerson[] } | null
  /** Invited, but their email didn't go (email off, today's used up, refused): their links are in Admin → Invitations. */
  notEmailed: InvitablePerson[]
  /** The server's words for the first email that didn't go. */
  unsentMsg: string | null
}

function errorMsgOf(err: unknown): { status?: number; code?: string; msg: string } {
  const e = err as { response?: { status?: number; data?: { msg?: string; error?: string; code?: string } }; message?: string }
  const data = e?.response?.data
  return {
    status: e?.response?.status,
    code: data?.code,
    msg: data?.msg || data?.error || (e?.response ? "That didn't work. Try again." : "Couldn't reach the server. Check your connection and try again."),
  }
}

/**
 * Invites the people one after another through the workspace's invitation
 * endpoint, the one every invitation goes through, so each gets its seat check,
 * its email and its link. Stops at a full plan (the rest would be refused the
 * same way); someone invited in the meantime is counted, not an error.
 */
export async function inviteImportedPeople(
  people: InvitablePerson[],
  onProgress?: (done: number, total: number) => void,
): Promise<InviteRun> {
  const run: InviteRun = { invited: [], alreadyInvited: [], failed: [], seatLimit: null, notEmailed: [], unsentMsg: null }
  for (let i = 0; i < people.length; i++) {
    const person = people[i]
    try {
      const res = await axiosInstance.post(PostEndpointUrl.AddInvitation, { email: person.email }, OWN_ERRORS)
      run.invited.push(person)
      // email_sent is whether the email was accepted, not whether email is
      // set up: a day's allowance or a refused address leaves it false.
      if (res.data?.email_sent !== true) {
        run.notEmailed.push(person)
        run.unsentMsg ??= res.data?.msg ?? null
      }
    } catch (err) {
      const { status, code, msg } = errorMsgOf(err)
      if (code === "seat_limit") {
        run.seatLimit = { msg, notInvited: people.slice(i) }
        break
      }
      // Invited in the meantime: the server refuses a second invitation while
      // one is live (409, "is already invited"; it was a 400 "already exists").
      if ((status === 409 || status === 400) && /already (invited|exists)/i.test(msg)) {
        run.alreadyInvited.push(person)
      } else {
        run.failed.push({ person, msg })
      }
    }
    onProgress?.(i + 1, people.length)
  }
  return run
}
