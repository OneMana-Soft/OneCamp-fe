import type { AxiosError } from "axios"

/**
 * Why a page's one thing (a thread, a table, a board) isn't on screen: it is
 * gone (or not yours: 403, 404, 410, or an answer with nothing in it), or it
 * couldn't be loaded (a 5xx, a dropped connection), which Try again can fix.
 * Saying "doesn't exist" for a dropped connection sends people away from
 * something that is still there. Pure.
 */
export function loadFailure(error: unknown): "gone" | "failed" {
  if (!error) return "gone"
  const status = (error as AxiosError)?.response?.status
  return status === 403 || status === 404 || status === 410 ? "gone" : "failed"
}
