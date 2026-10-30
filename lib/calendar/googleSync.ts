/**
 * Moving from Google Calendar in one go, and the two-way sync after it
 * (calendar B6): every calendar of the person's Google link comes into
 * OneCamp, and both stay in step while a team switches. When Google stops
 * answering for the account (C9), the sync is broken until the person
 * connects Google again. Pure but for the requests.
 */

import { useEffect, useRef, useState } from "react"
import axiosInstance, { OWN_ERRORS } from "@/lib/axiosInstance"
import { useFetch } from "@/hooks/useFetch"
import { apiErrorMessage } from "@/lib/utils/apiError"
import { relativeTime } from "@/lib/utils/relativeTime"
import { googleSyncUrl } from "@/lib/calendar/googleSyncBroken"

export interface GoogleSync {
  provider: "google"
  account?: string
  state: "none" | "moving" | "synced" | "failed" | "broken"
  progress: number
  moved: number
  unchanged: number
  skipped?: { what: string; why: string }[]
  error?: string
  last_synced_at?: string
}

/** Starts the move; answers where it stands. */
export async function moveFromGoogle(): Promise<GoogleSync> {
  const res = await axiosInstance.post(`${googleSyncUrl}/move`, {}, OWN_ERRORS)
  return res.data.data as GoogleSync
}

/**
 * What the Calendars panel says of it: "Moving from Google · 45%", "In step
 * with Google · 2m ago", "Google stopped answering" (the action beside it,
 * Connect Google again, says what to do). Pure.
 */
export function googleSyncWords(s: GoogleSync | undefined, now: number = Date.now()): string {
  if (!s || s.state === "none") return ""
  if (s.state === "moving") return `Moving from Google · ${s.progress}%`
  if (s.state === "failed") return s.error || "The move from Google didn't finish."
  if (s.state === "broken") return "Google stopped answering"
  const when = s.last_synced_at ? relativeTime(s.last_synced_at, now) : ""
  return when ? `In step with Google · ${when}` : "In step with Google"
}

/**
 * The Google row's status line, said once on the computer and the phone: the
 * account and how the sync stands while it moves, is in step or stopped
 * ("sam@gmail.com · Google stopped answering"). A failed move's why goes
 * under its action instead. Pure.
 */
export function googleSyncLine(account: string | undefined, s: GoogleSync | undefined): string {
  const said = s?.state === "moving" || s?.state === "synced" || s?.state === "broken"
  return [account, said ? googleSyncWords(s) : ""].filter(Boolean).join(" · ")
}

/**
 * What the person can do about the sync now, and its words: move everything
 * from Google (before anything moved, or before the sync is read), try a
 * move that failed again, or connect Google again once it stopped answering.
 * Nothing while it moves or is in step. Pure.
 */
export function googleSyncNext(s: GoogleSync | undefined): { label: string; reconnect: boolean } | undefined {
  if (s?.state === "moving" || s?.state === "synced") return undefined
  if (s?.state === "broken") return { label: "Connect Google again", reconnect: true }
  return { label: s?.state === "failed" ? "Try the move from Google again" : "Move everything from Google", reconnect: false }
}

/**
 * The person's move from Google and its sync, asked every two seconds while
 * it moves and every minute after; start begins it. onMoved runs once when
 * a move finishes, so the calendar reads what came. The Calendars panel and
 * a phone's calendar options both show it.
 */
export function useGoogleSync(onMoved?: () => void) {
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState("")
  const res = useFetch<{ data?: GoogleSync }>(googleSyncUrl, undefined, { refreshInterval: (d) => (d?.data?.state === "moving" ? 2000 : 60000) }, OWN_ERRORS)
  const sync = res.data?.data
  const was = useRef(sync?.state)
  useEffect(() => {
    if (was.current === "moving" && sync?.state === "synced") onMoved?.()
    was.current = sync?.state
  }, [sync?.state, onMoved])
  const start = async () => {
    setStarting(true)
    setError("")
    try {
      await res.mutate({ data: await moveFromGoogle() }, { revalidate: false })
    } catch (err) {
      setError(apiErrorMessage(err, "The move couldn't start. Try again."))
    } finally {
      setStarting(false)
    }
  }
  return { sync, ready: !!res.data, starting, error, start, words: googleSyncWords(sync) }
}

