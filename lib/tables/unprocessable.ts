import { apiErrorCode, apiErrorStatus, refusalReason } from "@/lib/utils/apiError"

/**
 * Why the server won't do a table's request as it was asked, though it
 * understood it (a 422: a view it can't work out over every row yet), in its
 * own words. Nothing for any other answer, which says its own.
 */
export function unprocessableReason(error: unknown): string | undefined {
  return apiErrorStatus(error) === 422 ? refusalReason(error) : undefined
}

/** A formula's or a rollup's fill the server is still working through (airtable-03b): its words and how far it has got. */
export interface WorkingOut {
  words: string
  done: number
  total: number
}

/**
 * A 422 coded working_out: the server is still filling a formula or a rollup
 * the view reads (airtable-03b), so it says how far, and the view asks again.
 * Nothing for a refusal, any other answer, or a progress that isn't numbers.
 */
export function workingOutOf(error: unknown): WorkingOut | undefined {
  if (apiErrorStatus(error) !== 422 || apiErrorCode(error) !== "working_out") return undefined
  const p = (error as { response?: { data?: { progress?: { done?: unknown; total?: unknown } } } }).response?.data?.progress
  const words = refusalReason(error)
  if (!words || typeof p?.done !== "number" || typeof p?.total !== "number") return undefined
  return { words, done: p.done, total: p.total }
}
