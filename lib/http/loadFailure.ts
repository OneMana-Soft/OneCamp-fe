import type { AxiosError } from "axios"
import { useEffect } from "react"
import { toast } from "@/hooks/use-toast"
import { errorToastCopy, shownRecently } from "@/lib/utils/errorToast"

/**
 * Why a page's one thing (a project, a task, a board, a table, a doc) isn't
 * on screen, read from the failed read's error. Three answers, each drawn by
 * components/ui/load-failure-state:
 *
 *   - "no-access" (403): it is there, and not this person's to see. "You
 *     can't see this project", with Request access where the product has it.
 *   - "gone" (404 and 410; 400, which a read by id answers for an id that
 *     names nothing; an answer with nothing in it): "This project doesn't
 *     exist or was deleted". A server that hides what a person may not see
 *     answers 404 for both, and the words allow for it.
 *   - "failed" (a 5xx, a timeout, a dropped connection): nothing is lost, and
 *     Try again can fix it.
 *
 * Saying "doesn't exist" for a dropped connection sends people away from
 * something that is still there; saying "connection problem" for something
 * gone sends them to Try again for ever.
 *
 * For READS only. A write's failure is the person's own change not made, and
 * its request says so at once (lib/axiosInstance); a 400 from a write is a
 * refusal of what was sent, never "gone". Pure.
 */
export type LoadFailure = "no-access" | "gone" | "failed"

export function loadFailure(error: unknown): LoadFailure {
  if (!error) return "gone"
  const status = (error as AxiosError)?.response?.status
  if (status === 403) return "no-access"
  return status === 400 || status === 404 || status === 410 ? "gone" : "failed"
}

/*
 * Who says that a read failed (owner's policy, 12 Oct 2026):
 *
 *   - a screen that draws its own error state ("Couldn't load members", Try
 *     again) says it there, and only there;
 *   - a toast is for something the person did (a write, which the request
 *     interceptor reports at once) and for a read that nothing on screen
 *     explains;
 *   - a refresh that fails under what is already on screen says nothing:
 *     what is shown still stands, and the next refresh tries again
 *     (hooks/useFetch).
 *
 * Members said a failed list in place and again in a toast; a failed refresh
 * in chat raised "Something went wrong · internal error" over messages that
 * were all still there.
 *
 * A failed read waits a beat before its toast, for the screen to draw what it
 * draws for the failure. Every error state drawn in place of what failed calls
 * useSaysLoadFailure while it is on screen: then the toast stays quiet, and one
 * raised a moment before an error state that came late is taken back.
 */

/** How long a failed read waits for an error state to say it. */
export const READ_FAILURE_BEAT_MS = 400
/** How long after a read's toast an error state that arrives late takes it back. */
const LATE_MS = 4000

let saying = 0
let lastToast: { dismiss: () => void; at: number } | null = null

/** Called by every error state drawn in place of what failed to load, while it is on screen. */
export function useSaysLoadFailure(on: boolean = true): void {
  useEffect(() => {
    if (!on) return
    saying++
    if (lastToast && Date.now() - lastToast.at < LATE_MS) lastToast.dismiss()
    lastToast = null
    return () => {
      saying--
    }
  }, [on])
}

/**
 * The same, as a mark beside a screen's own words for a failed load ("Couldn't
 * load the skills."): it draws nothing, and says the failure is said there.
 */
export function SaysLoadFailure(): null {
  useSaysLoadFailure()
  return null
}

/**
 * A failed read that nobody has said yet: a toast, unless an error state on
 * screen says it. No answer at all raises nothing (the offline notice says the
 * server can't be reached, once), and neither does a 401 (the session's own
 * path refreshes or signs out).
 */
export function tellReadFailure(error: unknown): void {
  const res = (error as AxiosError<{ msg?: unknown; code?: unknown }>)?.response
  if (!res || res.status === 401) return
  const copy = errorToastCopy(res.status, res.data?.msg, res.data?.code)
  setTimeout(() => {
    if (saying > 0 || shownRecently(copy)) return
    const shown = toast({ variant: "destructive", ...copy })
    lastToast = { dismiss: shown.dismiss, at: Date.now() }
  }, READ_FAILURE_BEAT_MS)
}
