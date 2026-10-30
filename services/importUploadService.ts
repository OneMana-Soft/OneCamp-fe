/**
 * An import's file (a CSV of tasks), sent straight to storage: presigned,
 * PUT, then finalised. Apart from importService, which pages showing an
 * import's people load, because only the admin's import screen sends one.
 */

import axiosInstance, { OWN_ERRORS } from "@/lib/axiosInstance"
import { presignedUpload } from "@/lib/http/presignedUpload"
import type { ImportProvider } from "@/services/importService"

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

// The caller says what went wrong (importProblemOf), so neither shows a toast.
async function presignImportUpload(
  provider: ImportProvider,
  workspaceName: string,
  fileSize: number,
  source: string,
  signal?: AbortSignal,
): Promise<PresignResponse> {
  const res = await axiosInstance.post(
    `/admin/import/${encodeURIComponent(provider)}/presign`,
    { source_workspace_name: workspaceName, file_size: fileSize, source },
    { ...OWN_ERRORS, signal },
  )
  return res.data
}

async function finalizeImportUpload(provider: ImportProvider, jobId: string): Promise<void> {
  await axiosInstance.post(
    `/admin/import/${encodeURIComponent(provider)}/finalize/${encodeURIComponent(jobId)}`,
    undefined,
    OWN_ERRORS,
  )
}

/**
 * A file brought in as an import named name, reporting the PUT's progress.
 * Stopped through signal, nothing is finalised and the import is left in the
 * history to discard.
 */
export async function uploadImportFile(
  provider: ImportProvider,
  file: File,
  name: string,
  source: string,
  onProgress?: (percent: number) => void,
  signal?: AbortSignal,
): Promise<{ job_id: string }> {
  const p = await presignedUpload(
    file,
    () => presignImportUpload(provider, name, file.size, source, signal),
    (presigned) => finalizeImportUpload(provider, presigned.job_id),
    onProgress,
    signal,
  )
  return { job_id: p.job_id }
}
