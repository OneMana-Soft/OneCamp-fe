/**
 * An admin's export of the workspace's docs (business/ContentIO
 * workspaceExport.go): every doc they can open, and the private docs whose
 * owners let them in, as a zip of Markdown in folders that follow the page
 * tree. It runs as a job; its progress arrives as the Content IO job message
 * (CONTENT_IO_JOB_EVENT) and the list answers it too.
 */

import axiosInstance, { OWN_ERRORS } from '@/lib/axiosInstance'
import type { ContentIOJob } from '@/lib/export/contentIO'
import { shortDateTime } from '@/lib/utils/date/shortDate'

export const WORKSPACE_EXPORT_ROUTES = {
  list: '/admin/docs/exports',
  one: (id: string) => `/admin/docs/exports/${encodeURIComponent(id)}`,
} as const

/** A workspace export, as its job. */
export interface WorkspaceExport extends ContentIOJob {
  /** How many docs it wrote. */
  exported?: number
  /** When the server removes its zip; absent once it has, and before it is made. */
  kept_until?: string
}

export const exportIsRunning = (e: WorkspaceExport) => e.status === 'queued' || e.status === 'running'

/**
 * Starts an export. One the admin started that is still being made answers
 * instead (the API's 409), so a second click is the same export.
 */
export async function startWorkspaceExport(): Promise<WorkspaceExport> {
  try {
    const res = await axiosInstance.post(WORKSPACE_EXPORT_ROUTES.list, {}, OWN_ERRORS)
    return res.data.export as WorkspaceExport
  } catch (err) {
    const res = (err as { response?: { status?: number; data?: { export?: WorkspaceExport } } })?.response
    if (res?.status === 409 && res.data?.export) return res.data.export
    throw err
  }
}

/** Where to download a finished export from, for the next 15 minutes; "" once the zip is gone. */
export async function downloadAddress(id: string): Promise<string> {
  const res = await axiosInstance.get(WORKSPACE_EXPORT_ROUTES.one(id), OWN_ERRORS)
  return (res.data?.download_url as string) ?? ''
}

const count = (n: number, one: string, many: string) => `${n.toLocaleString('en')} ${n === 1 ? one : many}`

/** An export's meta line: when it started, and what it holds once made. */
export function exportMeta(e: WorkspaceExport): string[] {
  const out = [`Started ${shortDateTime(new Date(e.created_at))}`]
  if (e.status === 'done') out.push(count(e.exported ?? 0, 'doc', 'docs'))
  return out
}

/**
 * What an export left out, in words: the private docs as one line ("3
 * private docs: their owners haven't let them in"), then the docs it couldn't
 * read, by title, a few and how many more.
 */
export function leftOut(e: WorkspaceExport, shown = 3): string[] {
  const skipped = e.skipped ?? []
  const lines: string[] = []
  const unread: string[] = []
  for (const s of skipped) {
    if (s.why === 'it could not be read') unread.push(s.what)
    else lines.push(`${s.what} left out: ${s.why}.`)
  }
  if (unread.length > 0) {
    const named = unread.slice(0, shown).map((t) => `‘${t}’`).join(', ')
    const more = unread.length > shown ? ` and ${count(unread.length - shown, 'other', 'others')}` : ''
    lines.push(`Couldn't be read, so not in it: ${named}${more}.`)
  }
  return lines
}
