"use client"

import { useEffect, useState } from "react"

/**
 * Now, in ms, read again every `everyMs` while `on` and at once when it turns
 * on: for a clock on screen (how long a call or a recording has run, how long
 * someone has waited, a room's countdown). Off, it keeps its last reading and
 * runs no timer.
 */
export function useNow(on: boolean, everyMs = 1000): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!on) return
    setNow(Date.now())
    const t = window.setInterval(() => setNow(Date.now()), everyMs)
    return () => window.clearInterval(t)
  }, [on, everyMs])
  return now
}
