import type { AxiosRequestConfig } from "axios"

/** How long a request waits for an answer (FE-F-10). */
export const REQUEST_TIMEOUT_MS = 30_000

// Writes answered as their work ends: a run, an eval, a drill, a summary; an
// archive run's undo (the whole run), a doc tree's duplicate (200 copies) and
// purge (5,000 pages), which go on to the end on the server if the request is
// cut (business/Archive UndoArchiveJob; business/Doc). Cut at 30 s, the app
// said the change may not have been saved, and Duplicate made copies again.
const RUNS_TO_THE_END = [/\/(run|summary)$/, /\/archive\/undo\//, /^\/doc\/(duplicate|purge)$/]

const UNTIMED_ROUTES = [/\/ai\/|\/ai[A-Z]|[/-]ai-/, /\/(generate|draft|query-plan|test|test-connection|check)(\/|$)/, /\/(import|export|restore)/i]

/** No timeout for a file, followed progress, or a slow route. */
export function waitsAsLongAsItTakes(c: AxiosRequestConfig): boolean {
  const d = c.data
  if (d instanceof FormData || d instanceof Blob || d instanceof ArrayBuffer || ArrayBuffer.isView(d)) return true
  if (/^(blob|arraybuffer|stream|document)$/.test(c.responseType ?? "") || c.onUploadProgress || c.onDownloadProgress) return true
  const path = (c.url || "").split("?")[0]
  return UNTIMED_ROUTES.some((r) => r.test(path)) || (RUNS_TO_THE_END.some((r) => r.test(path)) && (c.method ?? "get").toLowerCase() !== "get")
}

export const isTimeout = (e?: { code?: string }) => e?.code === "ECONNABORTED" || e?.code === "ETIMEDOUT"
