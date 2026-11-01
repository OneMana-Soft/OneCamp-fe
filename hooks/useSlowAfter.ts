"use client"

import { useCallback, useEffect, useState } from "react"

/** How long the app lets a load run before it says the load is slow: a panel's code, or what the panel reads (V-180). */
export const SLOW_AFTER_MS = 10_000

/**
 * Whether something has been on its way for longer than `ms`: true once `waiting` has held that long, and false again
 * as soon as it stops. Each wait counts from its own start, and again() starts the count over, for a Try again that
 * waits once more. V-180: an event panel opened cold on a slow line sat blank for 30 s, with nothing to say so.
 */
export function useSlowAfter(waiting: boolean, ms: number = SLOW_AFTER_MS): [slow: boolean, again: () => void] {
  const [round, setRound] = useState(0)
  const [late, setLate] = useState<number | null>(null)
  useEffect(() => {
    if (!waiting) return
    const timer = setTimeout(() => setLate(round), ms)
    return () => {
      clearTimeout(timer)
      setLate(null)
    }
  }, [waiting, ms, round])
  const again = useCallback(() => setRound((r) => r + 1), [])
  return [waiting && late === round, again]
}
