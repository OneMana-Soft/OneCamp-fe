"use client"

import { useEffect } from "react"

/**
 * Runs `run` once, when the page has opened and the browser has a quiet
 * moment (requestIdleCallback, at most `timeoutMs` later), or after a short
 * wait where there is no such call: work that makes a later step quick, such
 * as fetching a surface's code ahead of its first use, without slowing the
 * first screen. Dropped if the page goes before then.
 */
export function useWhenIdle(run: () => void, timeoutMs = 2500) {
  useEffect(() => {
    if (typeof window.requestIdleCallback === "function") {
      const id = window.requestIdleCallback(run, { timeout: timeoutMs })
      return () => window.cancelIdleCallback(id)
    }
    const t = window.setTimeout(run, Math.min(timeoutMs, 1200))
    return () => window.clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, when the page opens
  }, [])
}
