"use client"

import { useEffect, useState } from "react"

/** Whether the person asked for less motion. */
export function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches
}

/**
 * How many of `count` items have been revealed, one more every `stepMs`: a
 * presentation stagger over results that are already real (the self-test's
 * checks, the drill's rows). Under reduced motion everything is shown at once.
 * A count that falls (a new run) starts again from it.
 */
export function useStagger(count: number, stepMs: number): number {
  const [shown, setShown] = useState(() => (prefersReducedMotion() ? count : 0))
  useEffect(() => {
    if (shown > count) {
      setShown(count)
      return
    }
    if (shown === count) return
    if (prefersReducedMotion()) {
      setShown(count)
      return
    }
    const t = window.setTimeout(() => setShown((s) => Math.min(count, s + 1)), stepMs)
    return () => window.clearTimeout(t)
  }, [count, shown, stepMs])
  return Math.min(shown, count)
}
