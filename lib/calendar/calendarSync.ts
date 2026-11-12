/**
 * Moving from another calendar in one go, and the two-way sync after it:
 * Google's (calendar B6) and Outlook's (B7), said and done the same way from
 * one table. Every calendar of the person's own link comes into OneCamp, and
 * both stay in step while a team switches. When the provider stops answering
 * for the account (C9), the sync is broken until the person connects it
 * again. Pure but for the requests.
 */

import { useEffect, useRef, useState } from "react"
import axiosInstance, { OWN_ERRORS } from "@/lib/axiosInstance"
import { useFetch } from "@/hooks/useFetch"
import { apiErrorMessage } from "@/lib/utils/apiError"
import { relativeTime } from "@/lib/utils/relativeTime"

import { SYNC, syncUrl, type SyncProvider } from "@/lib/calendar/syncProviders"
export { SYNC, syncUrl, type SyncProvider }

export interface CalendarSync {
  provider: SyncProvider
  account?: string
  state: "none" | "moving" | "synced" | "failed" | "broken"
  progress: number
  moved: number
  unchanged: number
  skipped?: { what: string; why: string }[]
  error?: string
  last_synced_at?: string
  /** The admin has set the provider's app up, so people can connect it. */
  available?: boolean
}

/** Starts the move; answers where it stands. */
export async function moveFrom(provider: SyncProvider): Promise<CalendarSync> {
  const res = await axiosInstance.post(`${syncUrl(provider)}/move`, {}, OWN_ERRORS)
  return res.data.data as CalendarSync
}

/**
 * What the Calendars panel says of it: "Moving from Google · 45%", "In step
 * with Outlook · 2m ago", "Google stopped answering" (the action beside it,
 * Connect Google again, says what to do). Pure.
 */
export function syncWords(provider: SyncProvider, s: CalendarSync | undefined, now: number = Date.now()): string {
  const name = SYNC[provider].name
  if (!s || s.state === "none") return ""
  if (s.state === "moving") return `Moving from ${name} · ${s.progress}%`
  if (s.state === "failed") return s.error || `The move from ${name} didn't finish.`
  if (s.state === "broken") return `${name} stopped answering`
  const when = s.last_synced_at ? relativeTime(s.last_synced_at, now) : ""
  return when ? `In step with ${name} · ${when}` : `In step with ${name}`
}

/**
 * The provider's status line, said once on the computer and the phone: the
 * account and how the sync stands while it moves, is in step or stopped
 * ("sam@gmail.com · Google stopped answering"). A failed move's why goes
 * under its action instead. Pure.
 */
export function syncLine(provider: SyncProvider, account: string | undefined, s: CalendarSync | undefined): string {
  const said = s?.state === "moving" || s?.state === "synced" || s?.state === "broken"
  return [account, said ? syncWords(provider, s) : ""].filter(Boolean).join(" · ")
}

/**
 * What the person can do about the sync now, and its words: move everything
 * (before anything moved, or before the sync is read), try a move that
 * failed again, or connect the provider again once it stopped answering.
 * Nothing while it moves or is in step. Pure.
 */
export function syncNext(provider: SyncProvider, s: CalendarSync | undefined): { label: string; reconnect: boolean } | undefined {
  const name = SYNC[provider].name
  if (s?.state === "moving" || s?.state === "synced") return undefined
  if (s?.state === "broken") return { label: `Connect ${name} again`, reconnect: true }
  return { label: s?.state === "failed" ? `Try the move from ${name} again` : `Move everything from ${name}`, reconnect: false }
}

/**
 * The person's move from a provider and its sync, asked every two seconds
 * while it moves and every minute after (never while the admin hasn't set
 * the provider up); start begins it. onMoved runs once when a move
 * finishes, so the calendar reads what came. The Calendars panel and a
 * phone's calendar options both show it.
 */
export function useCalendarSync(provider: SyncProvider, onMoved?: () => void) {
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState("")
  const res = useFetch<{ data?: CalendarSync }>(syncUrl(provider), undefined, { refreshInterval: (d) => (d?.data?.state === "moving" ? 2000 : d?.data?.available === false ? 0 : 60000) }, OWN_ERRORS)
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
      await res.mutate({ data: await moveFrom(provider) }, { revalidate: false })
    } catch (err) {
      setError(apiErrorMessage(err, "The move couldn't start. Try again."))
    } finally {
      setStarting(false)
    }
  }
  // failed: the read answered an error and nothing is on screen for it (CR-B22 G1); a refresh's failure keeps what's shown.
  return { sync, ready: !!res.data, failed: !res.data && !!res.isError, starting, error, start, words: syncWords(provider, sync) }
}

/**
 * A provider linked through the connectors (Outlook): whether the admin set
 * its app up, whether the person linked their own account (read only once
 * it is set up), and connecting or disconnecting it. Connecting comes back
 * to the calendar (?connector=success&provider=…). Both ask without
 * OWN_ERRORS, so the app's own toast says a failure; connect answers whether
 * it is on its way, and disconnect throws for the confirm that asked.
 */
export function useConnectorLink(provider: SyncProvider, available: boolean) {
  const id = SYNC[provider].connector
  const list = useFetch<{ data?: { connectors?: { id: string; connected: boolean }[] } }>(available ? "/connectors" : "", undefined, undefined, OWN_ERRORS)
  const connectors = list.data?.data?.connectors
  // One ask at a time (CR-B22 L2): a second tap while Connect or Disconnect is out sends nothing, and busy
  // disables the buttons of whichever surface asked (the panel's, the phone's options).
  const asking = useRef(false)
  const [busy, setBusy] = useState(false)
  const hold = (on: boolean) => {
    asking.current = on
    setBusy(on)
  }
  return {
    connected: connectors ? !!connectors.find((c) => c.id === id)?.connected : undefined,
    failed: !connectors && !!list.isError,
    busy,
    connect: async () => {
      if (asking.current) return false
      hold(true)
      try {
        const res = await axiosInstance.get(`/connectors/${id}/connect?return=calendar`)
        const url = (res.data as { data?: { url?: string } })?.data?.url
        // On the way to Microsoft: still busy until the page leaves.
        if (url) {
          window.location.href = url
          return true
        }
      } catch {
        // The shared interceptor's toast says why.
      }
      hold(false)
      return false
    },
    disconnect: async () => {
      if (asking.current) return
      hold(true)
      try {
        await axiosInstance.post(`/connectors/${id}/disconnect`, {})
        await list.mutate()
      } finally {
        hold(false)
      }
    },
  }
}
