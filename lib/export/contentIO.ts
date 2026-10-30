/**
 * The API's Content IO routes (business/ContentIO): what someone may export
 * and import, the record every export leaves, and imports, which run as jobs.
 */

import axiosInstance, { OWN_ERRORS } from '@/lib/axiosInstance'
import { randomUUID } from '@/lib/utils/randomUUID'
import { exportRefused, type ContentIOCapabilities, type ExportFormat } from './contentIOCapabilities'

// What someone may export and import is its own small module: a doc's More
// menu reads it on every doc, and the rest of this one is for the dialogs.
export { forgetCapabilities, knownCapabilities, loadCapabilities } from './contentIOCapabilities'
export type { ContentIOCapabilities, ExportFormat } from './contentIOCapabilities'

// Here until the integrator adds them to services/endPoints.ts (append-only).
const CONTENT_IO_ROUTES = {
  job: (id: string) => `/content-io/jobs/${encodeURIComponent(id)}`,
  importDoc: '/doc/import',
  presignImport: '/doc/import/presign',
  startImport: (id: string) => `/doc/import/${encodeURIComponent(id)}/start`,
  chooseImport: (id: string) => `/doc/import/${encodeURIComponent(id)}/choose`,
  recordExport: '/doc/recordExport',
} as const

/** A job that previews its file (a spreadsheet's) waits as 'ready' for the person's choices. */
export type JobStatus = 'uploading' | 'queued' | 'running' | 'ready' | 'done' | 'failed'

export interface ContentIOJob {
  id: string
  kind: 'import' | 'export'
  format: string
  status: JobStatus
  progress: number
  filename?: string
  parent_uuid?: string
  error?: string
  created?: { kind: string; uuid: string; title: string; parent_uuid?: string }[]
  skipped?: { what: string; why: string }[]
  /** Found there already, and left as it was. */
  unchanged?: number
  /** How many things it made or changed, where created names only the first (a table's rows). */
  made?: number
  /** What to open once it's done: the first table a spreadsheet made, or the one it came into. */
  show?: { kind: string; uuid: string; title: string }
  /** What a ready job found in its file, as its importer shows it; only a read of the job carries it. */
  preview?: unknown
  created_at: string
  finished_at?: string
}

export { CONTENT_IO_JOB_EVENT } from './contentIOEvent'

export const jobIsOver = (job: ContentIOJob) => job.status === 'done' || job.status === 'failed'

/** A job no one need follow: over, or ready and waiting on the person's choices (a sheet's import). */
export const jobIsAtRest = (job: ContentIOJob) => jobIsOver(job) || job.status === 'ready'

class ExportRefused extends Error {}

/**
 * Records an export (the doc.export event) before the file is made. A member
 * the policy leaves out is refused (403), and then no file is made.
 */
export async function recordExport(docUUID: string, format: ExportFormat): Promise<void> {
  try {
    await axiosInstance.post(CONTENT_IO_ROUTES.recordExport, { doc_uuid: docUUID, format }, OWN_ERRORS)
  } catch (err) {
    const status = (err as { response?: { status?: number } })?.response?.status
    if (status === 403) {
      exportRefused()
      throw new ExportRefused('Your workspace’s admins have turned exports off for members.')
    }
    throw new ExportRefused('The export could not be recorded, so no file was made. Check your connection and try again.')
  }
}

/**
 * Imports one file as new docs under a parent (none: at the top of the
 * person's docs), into a calendar, or as tables (a spreadsheet, previewed
 * first with choices, then confirmed by chooseImport). Each call is one
 * attempt with a key of its own (Idempotency-Key): the server answers a
 * resend of it, such as a retry after a lost answer, from its first answer,
 * and imports nothing twice.
 */
export async function startImport(
  file: File,
  parentUUID: string,
  caps: ContentIOCapabilities | null,
  into: '' | 'calendar' | 'table' = '',
  choices?: object,
): Promise<ContentIOJob> {
  const once = { ...OWN_ERRORS, headers: { 'Idempotency-Key': randomUUID() } }
  const direct = caps?.max_direct_bytes ?? 7 << 20
  if (file.size <= direct) {
    const form = new FormData()
    // The parent goes first: the API reads the form as it streams in.
    if (parentUUID) form.append('parent_uuid', parentUUID)
    if (into) form.append('into', into)
    if (choices) form.append('choices', JSON.stringify(choices))
    form.append('file', file, file.name)
    const res = await axiosInstance.post(CONTENT_IO_ROUTES.importDoc, form, once)
    return res.data.job as ContentIOJob
  }
  // A large file goes straight to storage, then the import starts.
  const pre = await axiosInstance.post(
    CONTENT_IO_ROUTES.presignImport,
    { filename: file.name, media_type: file.type, size: file.size, parent_uuid: parentUUID, into, choices },
    once,
  )
  const job = pre.data.job as ContentIOJob
  const upload = pre.data.upload as { url: string; method: string; headers?: Record<string, string> }
  const put = await fetch(upload.url, { method: upload.method || 'PUT', headers: upload.headers || {}, body: file })
  if (!put.ok) throw new Error('The file could not be uploaded.')
  const started = await axiosInstance.post(CONTENT_IO_ROUTES.startImport(job.id), {}, OWN_ERRORS)
  return started.data.job as ContentIOJob
}

/**
 * Answers a ready job's preview: with confirm, the import runs as chosen;
 * without, the file is previewed again as chosen (the job is ready again).
 */
export async function chooseImport(id: string, choices: object, confirm: boolean): Promise<ContentIOJob> {
  const res = await axiosInstance.post(CONTENT_IO_ROUTES.chooseImport(id), { choices, confirm }, OWN_ERRORS)
  return res.data.job as ContentIOJob
}

export async function getJob(id: string): Promise<ContentIOJob> {
  const res = await axiosInstance.get(CONTENT_IO_ROUTES.job(id), OWN_ERRORS)
  return res.data.job as ContentIOJob
}

