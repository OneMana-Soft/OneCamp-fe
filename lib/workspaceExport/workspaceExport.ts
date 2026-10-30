/**
 * An admin's export of the workspace's docs and boards (business/ContentIO
 * workspaceExport.go): every doc they can open, and the private docs whose
 * owners let them in, as Markdown in folders that follow the page tree, and
 * every board they can open, as an Excalidraw file with its pictures in a
 * Boards folder, all in one zip. It runs as a job; its progress arrives as the Content IO job message
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
  /** How many boards it wrote; absent for none, and for an export from before boards went in. */
  exported_boards?: number
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
  if (e.status === 'done') {
    out.push(count(e.exported ?? 0, 'doc', 'docs'))
    if ((e.exported_boards ?? 0) > 0) out.push(count(e.exported_boards ?? 0, 'board', 'boards'))
  }
  return out
}

/** Why the server leaves a board out when its drawing can't be read (ContentIO's boardUnread). */
export const BOARD_UNREAD = 'the board could not be read'

/**
 * What an export left out, in words: the private docs and boards as a line
 * each ("3 private docs left out: their owners haven't let them in"), and a
 * board's pictures past its file's budget; then the docs it couldn't read, by
 * title, a few and how many more, and the boards likewise.
 */
export function leftOut(e: WorkspaceExport, shown = 3): string[] {
  const skipped = e.skipped ?? []
  const lines: string[] = []
  const unread: string[] = []
  const unreadBoards: string[] = []
  for (const s of skipped) {
    if (s.why === 'it could not be read') unread.push(s.what)
    else if (s.why === BOARD_UNREAD) unreadBoards.push(s.what)
    else lines.push(`${s.what} left out: ${s.why}.`)
  }
  const named = (titles: string[]) => {
    const more = titles.length > shown ? ` and ${count(titles.length - shown, 'other', 'others')}` : ''
    return titles.slice(0, shown).map((t) => `‘${t}’`).join(', ') + more
  }
  if (unread.length > 0) lines.push(`Couldn't be read, so not in it: ${named(unread)}.`)
  if (unreadBoards.length > 0) lines.push(`Boards that couldn't be read, so not in it: ${named(unreadBoards)}.`)
  return lines
}
