/**
 * The API's Content IO routes (business/ContentIO): what someone may export
 * and import, the record every export leaves, and imports, which run as jobs.
 */

import axiosInstance, { OWN_ERRORS } from '@/lib/axiosInstance'

// Here until the integrator adds them to services/endPoints.ts (append-only).
export const CONTENT_IO_ROUTES = {
  capabilities: '/content-io/capabilities',
  job: (id: string) => `/content-io/jobs/${encodeURIComponent(id)}`,
  importDoc: '/doc/import',
  presignImport: '/doc/import/presign',
  startImport: (id: string) => `/doc/import/${encodeURIComponent(id)}/start`,
  recordExport: '/doc/recordExport',
} as const

/** The browser's export formats: Markdown and HTML as the API writes them, PDF and Word made here. */
export type ExportFormat = 'md' | 'html' | 'pdf' | 'docx'

export interface ContentIOCapabilities {
  /** Whether this person may export docs (the docs.export.members policy; admins always may). */
  export: boolean
  export_formats: string[]
  import_extensions: string[]
  max_import_bytes: number
  /** A larger file goes to storage first, then the import starts. */
  max_direct_bytes: number
}

export type JobStatus = 'uploading' | 'queued' | 'running' | 'done' | 'failed'

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
  created_at: string
  finished_at?: string
}

/** The MQTT message (MESSAGE_CONTENT_IO_JOB) a job's changes arrive as, re-sent as a window event by the message handler. */
export const CONTENT_IO_JOB_EVENT = 'content-io-job'

export const jobIsOver = (job: ContentIOJob) => job.status === 'done' || job.status === 'failed'

// What someone may do changes when an admin changes the policy: asked again
// after five minutes, and never more than once at a time.
const FRESH_MS = 5 * 60 * 1000
let known: { at: number; caps: ContentIOCapabilities } | null = null
let asking: Promise<ContentIOCapabilities | null> | null = null

/** The last capabilities heard, asking again when they are old; null until the first answer. */
export function knownCapabilities(): ContentIOCapabilities | null {
  if (!known || Date.now() - known.at > FRESH_MS) void loadCapabilities()
  return known?.caps ?? null
}

export function loadCapabilities(): Promise<ContentIOCapabilities | null> {
  if (asking) return asking
  asking = axiosInstance
    .get(CONTENT_IO_ROUTES.capabilities, OWN_ERRORS)
    .then((res) => {
      const caps = res.data?.capabilities as ContentIOCapabilities | undefined
      if (caps) known = { at: Date.now(), caps }
      return caps ?? null
    })
    .catch(() => known?.caps ?? null)
    .finally(() => {
      asking = null
    })
  return asking
}

/** For tests: forget what was heard. */
export function forgetCapabilities(caps: ContentIOCapabilities | null = null) {
  known = caps ? { at: Date.now(), caps } : null
  asking = null
}

export class ExportRefused extends Error {}

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
      if (known) known = { at: Date.now(), caps: { ...known.caps, export: false } }
      throw new ExportRefused('Your workspace’s admins have turned exports off for members.')
    }
    throw new ExportRefused('The export could not be recorded, so no file was made. Check your connection and try again.')
  }
}

/** Imports one file as new docs under a parent (none: at the top of the person's docs). */
export async function startImport(file: File, parentUUID: string, caps: ContentIOCapabilities | null): Promise<ContentIOJob> {
  const direct = caps?.max_direct_bytes ?? 7 << 20
  if (file.size <= direct) {
    const form = new FormData()
    // The parent goes first: the API reads the form as it streams in.
    if (parentUUID) form.append('parent_uuid', parentUUID)
    form.append('file', file, file.name)
    const res = await axiosInstance.post(CONTENT_IO_ROUTES.importDoc, form, OWN_ERRORS)
    return res.data.job as ContentIOJob
  }
  // A large file goes straight to storage, then the import starts.
  const pre = await axiosInstance.post(
    CONTENT_IO_ROUTES.presignImport,
    { filename: file.name, media_type: file.type, size: file.size, parent_uuid: parentUUID },
    OWN_ERRORS,
  )
  const job = pre.data.job as ContentIOJob
  const upload = pre.data.upload as { url: string; method: string; headers?: Record<string, string> }
  const put = await fetch(upload.url, { method: upload.method || 'PUT', headers: upload.headers || {}, body: file })
  if (!put.ok) throw new Error('The file could not be uploaded.')
  const started = await axiosInstance.post(CONTENT_IO_ROUTES.startImport(job.id), {}, OWN_ERRORS)
  return started.data.job as ContentIOJob
}

export async function getJob(id: string): Promise<ContentIOJob> {
  const res = await axiosInstance.get(CONTENT_IO_ROUTES.job(id), OWN_ERRORS)
  return res.data.job as ContentIOJob
}

/** The API's message for a failed request, when it sent one. */
export function apiMessage(err: unknown, fallback: string): string {
  const msg = (err as { response?: { data?: { msg?: unknown } } })?.response?.data?.msg
  return typeof msg === 'string' && msg.trim() ? msg : fallback
}
