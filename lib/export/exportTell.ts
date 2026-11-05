/**
 * An export's tell to the admin log, which a doc's and a board's exports both
 * wait on before they make a file (V-363): an export the log can't record
 * isn't made. What a refused tell says is shared here.
 */

import { saysWhy } from "@/lib/utils/errorToast"

/** What a tell that went unanswered, or failed on the server, says: no file was made. */
export const EXPORT_NOT_RECORDED = "The export couldn't be recorded, so no file was made. Check your connection and try again."

/**
 * What a refused tell says: the server's own words for a refusal (a 4xx that
 * says why, such as too many exports in a few minutes), or EXPORT_NOT_RECORDED
 * for no answer or a server fault. Pure.
 */
export function tellRefusal(error: unknown): string {
  const res = (error as { response?: { status?: number; data?: { msg?: unknown } } } | null)?.response
  const status = res?.status ?? 0
  const msg = res?.data?.msg
  return status >= 400 && status < 500 && typeof msg === "string" && saysWhy(msg, status) ? msg.trim() : EXPORT_NOT_RECORDED
}
