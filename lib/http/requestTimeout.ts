import type { AxiosRequestConfig } from "axios"

/** How long a request waits for an answer (FE-F-10). */
export const REQUEST_TIMEOUT_MS = 30_000

const UNTIMED_ROUTES = [/\/ai\//, /\/ai[A-Z]/, /[/-]ai-/, /\/(generate|draft|query-plan)(\/|$)/, /\/(import|export|restore)/i, /\/(test|test-connection|check)(\/|$)/]

const FILE_ANSWERS = ["blob", "arraybuffer", "stream", "document"]

/** No timeout for a file, followed progress, or a slow route. */
export function waitsAsLongAsItTakes(c: AxiosRequestConfig): boolean {
  const d = c.data
  if ((typeof FormData !== "undefined" && d instanceof FormData) || (typeof Blob !== "undefined" && d instanceof Blob) || d instanceof ArrayBuffer || ArrayBuffer.isView(d)) return true
  if (FILE_ANSWERS.includes(c.responseType ?? "") || c.onUploadProgress || c.onDownloadProgress) return true
  const path = (c.url || "").split("?")[0]
  return UNTIMED_ROUTES.some((r) => r.test(path))
}

export const isTimeout = (e: { code?: string } | null | undefined) => e?.code === "ECONNABORTED" || e?.code === "ETIMEDOUT"
