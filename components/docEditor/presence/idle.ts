"use client"

/**
 * This tab says its own idle state in its awareness (B8): idle after 2
 * minutes with no input here (keys, pointer, touch, scroll, focus), and out
 * of sight it goes idle after the same 2 minutes whatever moved. A doc's
 * presence overlay and a board's Here now both say it, so the people the
 * presence reader groups (people.ts) are idle by one rule.
 */

import * as React from "react"
import type { AwarenessLike } from "./live"

export const IDLE_AFTER = 2 * 60_000

export function usePublishIdle(awareness: AwarenessLike | null | undefined) {
  React.useEffect(() => {
    if (!awareness) return
    // Unknown until said: a tab opened out of sight says it is idle 2 minutes on.
    let idle: boolean | null = null
    let last = 0
    const set = (next: boolean) => {
      if (next === idle) return
      idle = next
      awareness.setLocalStateField("idle", next)
    }
    let timer = window.setTimeout(() => set(true), IDLE_AFTER)
    const active = () => {
      if (document.visibilityState === "hidden") return
      const now = Date.now()
      if (idle === false && now - last < 1000) return
      last = now
      set(false)
      window.clearTimeout(timer)
      timer = window.setTimeout(() => set(true), IDLE_AFTER)
    }
    const seen = () => {
      if (document.visibilityState === "visible") active()
    }
    const events = ["pointerdown", "pointermove", "keydown", "wheel", "touchstart", "focus"] as const
    for (const e of events) window.addEventListener(e, active, { capture: true, passive: true })
    document.addEventListener("visibilitychange", seen)
    active()
    return () => {
      window.clearTimeout(timer)
      for (const e of events) window.removeEventListener(e, active, { capture: true })
      document.removeEventListener("visibilitychange", seen)
    }
  }, [awareness])
}
