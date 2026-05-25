// Thin wrappers around the Slack Import admin endpoints. Centralised
// here so the UI components don't repeat URL construction. All calls
// require an admin session.

import axiosInstance from "@/lib/axiosInstance"
import { GetEndpointUrl, PostEndpointUrl } from "@/services/endPoints"

// Mirrors backend adapter.JobOptions. Keep types pessimistic — backend
// fills defaults if a field is omitted, so optional everywhere is fine.
export interface SlackImportOptions {
  skip_subtypes?: boolean
  send_invites?: boolean
  channel_prefix?: string
  max_file_bytes?: number
  dry_run?: boolean
}

// Mirrors backend adapter.PlanResponse.
export interface SlackImportPlan {
  job_id: string
  user_count: number
  user_new: number
  user_merge: number
  channel_count: number
  channel_conflict: number
  message_count: number
  thread_count: number
  file_count: number
  file_bytes: number
  warnings?: string[]
}

// Mirrors backend adapter.JobView. The `progress` blob is opaque JSON
// updated by workers; the FE displays its known keys but is forward-
// compatible with any extras the BE adds.
//
// `slack_workspace_name` is the SOURCE Slack workspace label (e.g.
// "Acme Inc."). OneCamp itself is single-tenant; this column distinguishes
// imports of different Slack workspaces into the same OneCamp deployment.
export interface SlackImportJob {
  id: string
  slack_workspace_name: string
  source: "export_zip" | "corporate_zip" | "api"
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
  options: SlackImportOptions
  plan?: SlackImportPlan
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
}

export interface SlackImportError {
  id: string
  entity_type?: string
  slack_id?: string
  severity: "warning" | "error" | "fatal"
  code?: string
  message: string
  context?: unknown
  created_at: string
}

/**
 * Upload a Slack workspace export ZIP. Returns the new job id.
 *
 * The backend rate-limits this to 3/min/admin and caps the file size at
 * EXPORT_MAX_BYTES (default 5 GB). Larger uploads should be split or
 * the env var raised before retry.
 */
export async function uploadSlackExport(
  file: File,
  workspaceName: string,
  source: "export_zip" | "corporate_zip" = "export_zip",
  onUploadProgress?: (percent: number) => void,
): Promise<{ job_id: string; slack_workspace_name: string; raw_object_key: string }> {
  const fd = new FormData()
  fd.append("file", file)
  fd.append("slack_workspace_name", workspaceName)
  fd.append("source", source)

  const res = await axiosInstance.post(PostEndpointUrl.SlackImportUpload, fd, {
    headers: { "Content-Type": "multipart/form-data" },
    onUploadProgress: (evt) => {
      if (!onUploadProgress || !evt.total) return
      onUploadProgress(Math.round((evt.loaded / evt.total) * 100))
    },
  })
  return res.data
}

/**
 * Run the planning pass. Reads the staged ZIP, computes counts, persists
 * the plan and chunk queue. Returns the plan for display.
 */
export async function planSlackImport(
  jobId: string,
  options: SlackImportOptions = {},
): Promise<SlackImportPlan> {
  const res = await axiosInstance.post(
    `${PostEndpointUrl.SlackImportPlan}/${encodeURIComponent(jobId)}`,
    { options },
  )
  return res.data
}

/**
 * Start the import. Returns 202 immediately; live progress arrives via
 * the admin MQTT broadcast topic.
 */
export async function runSlackImport(
  jobId: string,
  options?: SlackImportOptions,
): Promise<void> {
  await axiosInstance.post(
    `${PostEndpointUrl.SlackImportRun}/${encodeURIComponent(jobId)}`,
    options ? { options } : {},
  )
}

export async function cancelSlackImport(jobId: string): Promise<void> {
  await axiosInstance.post(
    `${PostEndpointUrl.SlackImportCancel}/${encodeURIComponent(jobId)}`,
  )
}

/**
 * Roll back a completed/failed/cancelled import. Soft-deletes every
 * imported entity. Idempotent — running twice is a no-op.
 */
export async function rollbackSlackImport(jobId: string): Promise<void> {
  await axiosInstance.post(
    `${PostEndpointUrl.SlackImportRollback}/${encodeURIComponent(jobId)}`,
  )
}

export async function getSlackImportErrors(
  jobId: string,
  severity?: "warning" | "error" | "fatal",
  limit = 100,
  offset = 0,
): Promise<SlackImportError[]> {
  const params = new URLSearchParams()
  if (severity) params.set("severity", severity)
  params.set("limit", String(limit))
  params.set("offset", String(offset))
  const res = await axiosInstance.get(
    `${GetEndpointUrl.GetSlackImportErrors}/${encodeURIComponent(jobId)}/errors?${params.toString()}`,
  )
  return res.data?.errors || []
}


// ─── Presigned-upload path (for >2 GB exports) ──────────────────────────
//
// The default uploadSlackExport pushes the file through the Go API. For
// multi-GB exports we instead:
//   1. Ask the backend for a presigned PUT URL.
//   2. PUT the file straight to MinIO (no Go service in the data path).
//   3. Tell the backend the upload is done so it can advance to plan.
//
// This bypasses http.MaxBytesReader and Go's request memory model
// entirely. MinIO handles multipart server-side, so the upload also
// resumes more gracefully on flaky networks than a single multipart
// POST through the API.

interface PresignResponse {
  job_id: string
  slack_workspace_name: string
  raw_object_key: string
  upload_url: string
  expires_in: number
  method: "PUT"
  headers: Record<string, string>
}

/**
 * Request a presigned upload URL. Caller must follow up with
 * uploadToPresignedURL + finalizePresignedUpload using the same job_id.
 */
async function presignSlackUpload(
  workspaceName: string,
  fileSize: number,
  source: "export_zip" | "corporate_zip" = "export_zip",
): Promise<PresignResponse> {
  const res = await axiosInstance.post("/admin/import/slack/presign", {
    slack_workspace_name: workspaceName,
    file_size: fileSize,
    source,
  })
  return res.data
}

/**
 * Stream-upload a File directly to MinIO using a presigned PUT URL.
 * Uses XHR (not fetch) for upload progress events, which are still the
 * most cross-browser-reliable way to report progress on multi-GB PUTs.
 */
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
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve()
      } else {
        reject(new Error(`MinIO PUT failed: ${xhr.status} ${xhr.statusText}`))
      }
    }
    xhr.onerror = () => reject(new Error("network error during upload"))
    xhr.onabort = () => reject(new Error("upload aborted"))
    xhr.send(file)
  })
}

async function finalizePresignedUpload(jobId: string): Promise<void> {
  await axiosInstance.post(
    `/admin/import/slack/finalize/${encodeURIComponent(jobId)}`,
  )
}

/**
 * One-shot helper that does presign → PUT → finalize in sequence,
 * reporting upload progress through the same callback shape as
 * uploadSlackExport. Use this for files larger than ~2 GB; smaller
 * uploads should go through uploadSlackExport for a simpler flow.
 */
export async function uploadSlackExportPresigned(
  file: File,
  workspaceName: string,
  source: "export_zip" | "corporate_zip" = "export_zip",
  onUploadProgress?: (percent: number) => void,
): Promise<{ job_id: string; slack_workspace_name: string; raw_object_key: string }> {
  const presign = await presignSlackUpload(workspaceName, file.size, source)
  await uploadToPresignedURL(presign.upload_url, file, presign.headers, onUploadProgress)
  await finalizePresignedUpload(presign.job_id)
  return {
    job_id: presign.job_id,
    slack_workspace_name: presign.slack_workspace_name,
    raw_object_key: presign.raw_object_key,
  }
}


/**
 * Manually delete the staged Slack ZIP from MinIO. Useful when storage
 * is tight and the operator doesn't plan to retry. The cleanup loop
 * will eventually do this on its own after SLACK_IMPORT_RAW_RETENTION_DAYS,
 * but the manual path is instant.
 *
 * The endpoint refuses if the job is still active (running/validating/paused);
 * call cancelSlackImport first if you need to.
 */
export async function deleteStagedZip(jobId: string): Promise<void> {
  await axiosInstance.delete(
    `/admin/import/slack/jobs/${encodeURIComponent(jobId)}/staged-zip`,
  )
}
