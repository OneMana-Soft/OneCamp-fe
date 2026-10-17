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
 * useSaysLoadFailure while it is on screen: then that read's toast stays quiet
 * (the read that failed within a beat of its drawing; any other read's still
 * says itself), and one raised a moment before an error state that came late
 * is taken back.
 */

/** How long a failed read waits for an error state to say it. */
export const READ_FAILURE_BEAT_MS = 400
/** How long after a read's toast an error state that arrives late takes it back. */
const LATE_MS = 4000

/**
 * An error state on screen, and the reads it says: the ones that failed
 * within a beat of its drawing (its own, which it was drawn for). It keeps
 * those reads quiet while it is shown, a retry's failure too, and no others:
 * one error state on screen once kept every failed read's toast quiet,
 * whatever had failed (a 500 from another card said nothing at all).
 */
interface Saying {
  at: number
  reads: Set<string>
}
const sayings = new Set<Saying>()
/** Reads that failed lately, for an error state drawn just after its read failed. */
let lately: { read: string; at: number }[] = []
let lastToast: { dismiss: () => void; at: number; read: string } | null = null

/** A failed read's name: its method and address, or "" for an error that names none. */
function readOf(error: unknown): string {
  const config = (error as AxiosError)?.config
  return config?.url ? `${(config.method || "get").toLowerCase()} ${config.url}` : ""
}

/** Called by every error state drawn in place of what failed to load, while it is on screen. */
export function useSaysLoadFailure(on: boolean = true): void {
  useEffect(() => {
    if (!on) return
    const now = Date.now()
    const saying: Saying = { at: now, reads: new Set(lately.filter((f) => now - f.at <= READ_FAILURE_BEAT_MS).map((f) => f.read)) }
    // A toast raised a moment before an error state that came late is taken
    // back, and the read it said is the error state's.
    if (lastToast && now - lastToast.at < LATE_MS) {
      lastToast.dismiss()
      saying.reads.add(lastToast.read)
    }
    lastToast = null
    sayings.add(saying)
    return () => {
      sayings.delete(saying)
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
  // A read with no address is its own: only an error state drawn with it says it.
  const read = readOf(error) || `unnamed ${Math.random()}`
  const at = Date.now()
  lately = [...lately.filter((f) => at - f.at <= READ_FAILURE_BEAT_MS), { read, at }]
  // An error state drawn just before it failed is drawn for it too.
  for (const saying of sayings) if (at - saying.at <= READ_FAILURE_BEAT_MS) saying.reads.add(read)
  setTimeout(() => {
    if ([...sayings].some((s) => s.reads.has(read)) || shownRecently(copy)) return
    const shown = toast({ variant: "destructive", ...copy })
    lastToast = { dismiss: shown.dismiss, at: Date.now(), read }
  }, READ_FAILURE_BEAT_MS)
}
