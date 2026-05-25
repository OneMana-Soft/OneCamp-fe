/**
 * Generic Import service — wraps /admin/import/{provider}/* endpoints
 * for the Asana / Jira / Trello / Notion / Todoist pipeline.
 *
 * The legacy slackImportService remains for the Slack-specific FE
 * because its plan/upload UX is custom to channels-and-messages.
 */

import axiosInstance from "@/lib/axiosInstance"

// Provider names mirror models/postgres/Import.ProviderXxx on the BE.
export type ImportProvider = "trello" | "asana" | "jira" | "notion" | "todoist" | "linear" | "clickup"

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

export interface ConnectInput {
  access_token: string
  refresh_token?: string
  scopes?: string
  expires_at_unix?: number
  source_account_id?: string
  source_account_name?: string
  // metadata.api_key is required for Trello (plus the user token in access_token).
  metadata?: Record<string, string>
}

export async function connectImport(provider: ImportProvider, input: ConnectInput): Promise<void> {
  await axiosInstance.post(`/admin/import/${encodeURIComponent(provider)}/connect`, input)
}

export async function disconnectImport(provider: ImportProvider): Promise<void> {
  await axiosInstance.post(`/admin/import/${encodeURIComponent(provider)}/disconnect`)
}

export interface CreateJobInput {
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

function uploadToPresignedURL(
  url: string,
  file: File,
  headers: Record<string, string>,
  onProgress?: (percent: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open("PUT", url, true)
    Object.entries(headers).forEach(([k, v]) => xhr.setRequestHeader(k, v))
    xhr.upload.onprogress = (evt) => {
      if (!onProgress || !evt.lengthComputable) return
      onProgress(Math.round((evt.loaded / evt.total) * 100))
    }
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve()
      else reject(new Error(`MinIO PUT failed: ${xhr.status} ${xhr.statusText}`))
    }
    xhr.onerror = () => reject(new Error("network error during upload"))
    xhr.onabort = () => reject(new Error("upload aborted"))
    xhr.send(file)
  })
}

export async function finalizeImportUpload(provider: ImportProvider, jobId: string): Promise<void> {
  await axiosInstance.post(
    `/admin/import/${encodeURIComponent(provider)}/finalize/${encodeURIComponent(jobId)}`,
  )
}

/**
 * One-shot upload (presign → PUT → finalize). Use for any ZIP / JSON
 * upload to a non-Slack provider.
 */
export async function uploadImportFile(
  provider: ImportProvider,
  file: File,
  workspaceName: string,
  source: string = "export_zip",
  onUploadProgress?: (percent: number) => void,
): Promise<{ job_id: string; source_workspace_name: string; raw_object_key: string }> {
  const presign = await presignImportUpload(provider, workspaceName, file.size, source)
  await uploadToPresignedURL(presign.upload_url, file, presign.headers, onUploadProgress)
  await finalizeImportUpload(provider, presign.job_id)
  return {
    job_id: presign.job_id,
    source_workspace_name: presign.source_workspace_name,
    raw_object_key: presign.raw_object_key,
  }
}

// ─── Plan / Run / Cancel / Rollback / Errors ────────────────────────

export interface PlanInput {
  options?: Record<string, unknown>
  status_mappings?: Record<string, string>
  priority_mappings?: Record<string, string>
}

export async function planImportJob(jobId: string, input: PlanInput = {}): Promise<ImportPlan> {
  const res = await axiosInstance.post(
    `/admin/import/jobs/${encodeURIComponent(jobId)}/plan`,
    input,
  )
  return res.data
}

export async function runImportJob(jobId: string, input: PlanInput = {}): Promise<void> {
  await axiosInstance.post(
    `/admin/import/jobs/${encodeURIComponent(jobId)}/run`,
    input,
  )
}

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
    )
    return res.data?.items ?? []
  } catch (err: any) {
    const code = err?.response?.data?.code
    if (err?.response?.status === 404 || code === "no_discover") {
      return []
    }
    throw err
  }
}


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
  )
  return res.data
}
