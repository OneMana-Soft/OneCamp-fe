import { useEffect, useRef } from "react"
import { retryDelayMs, type PublicResult } from "@/services/publicApi"

export const GUEST_POLL_MS = 5000

/** What one poll came to: whether it worked, and the server's Retry-After when it didn't. */
export type GuestPollOutcome = { ok: boolean; retryAfter?: number }

/** A poll's outcome from a public call's result. Pure. */
export const pollOutcome = (res: PublicResult<unknown>): GuestPollOutcome => (res.ok ? { ok: true } : { ok: false, retryAfter: res.retryAfter })

/**
 * Keeps a guest page up to date: tick now (first is true), then every everyMs
 * while the page is shown. After a failure it waits longer each time, from 5
 * seconds up to a minute, and as long as the server's Retry-After says
 * (retryDelayMs), so a page left open on a server that is down or busy asks
 * less and less instead of every few seconds. One poller per key; an empty
 * key asks nothing (a page with no link to ask for, a member's).
 */
export function useGuestPoll(key: string, everyMs: number, tick: (first: boolean) => Promise<GuestPollOutcome>) {
  const latest = useRef(tick)
  useEffect(() => {
    latest.current = tick
  })
  useEffect(() => {
    if (!key) return
    let alive = true
    let failures = 0
    let timer: ReturnType<typeof setTimeout> | undefined
    const run = async (first: boolean) => {
      if (!first && document.visibilityState !== "visible") {
        timer = setTimeout(() => void run(false), everyMs)
        return
      }
      const out = await latest.current(first)
      if (!alive) return
      if (out.ok) failures = 0
      timer = setTimeout(() => void run(false), out.ok ? everyMs : retryDelayMs(failures++, out.retryAfter))
    }
    void run(true)
    return () => {
      alive = false
      clearTimeout(timer)
    }
  }, [key, everyMs])
}
