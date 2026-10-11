"use client"

import { useCallback, useEffect, useState } from "react"

/**
 * Whether a newer build of the web app is out (design v3, shell T3).
 *
 * The page knows the build it came from (NEXT_PUBLIC_BUILD_ID, baked in by
 * next.config.ts); /build-id says what the server runs now. Asked every ten
 * minutes and whenever the window comes back into focus. A dev build has no
 * id and never asks.
 */

export const UPDATE_POLL_MS = 10 * 60 * 1000

/** Whether the server's build differs from the page's. Pure. */
export function isNewerBuild(mine: string | undefined, theirs: string | undefined): boolean {
  return !!mine && !!theirs && mine !== theirs
}

/** True while the person is typing somewhere: no reload pulled from under them. */
function typing(): boolean {
  const el = document.activeElement as HTMLElement | null
  return !!el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))
}

export function useUpdateReady(): { ready: boolean; reload: () => void } {
  const mine = process.env.NEXT_PUBLIC_BUILD_ID
  const [ready, setReady] = useState(false)

  useEffect(() => {
    if (!mine || process.env.NODE_ENV !== "production") return
    let stopped = false
    const check = () => {
      if (stopped || document.visibilityState === "hidden") return
      fetch("/build-id", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .then((body: { id?: string } | null) => {
          if (!stopped && isNewerBuild(mine, body?.id)) setReady(true)
        })
        .catch(() => {})
    }
    const timer = window.setInterval(check, UPDATE_POLL_MS)
    window.addEventListener("focus", check)
    return () => {
      stopped = true
      window.clearInterval(timer)
      window.removeEventListener("focus", check)
    }
  }, [mine])

  const reload = useCallback(() => {
    if (typing()) (document.activeElement as HTMLElement | null)?.blur()
    window.location.reload()
  }, [])

  return { ready, reload }
}
