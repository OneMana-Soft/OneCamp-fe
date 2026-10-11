"use client"

import { useEffect, useState, type CSSProperties } from "react"

import { prefersReducedMotion } from "@/lib/celebrate"

/**
 * The first reveal of a view's numbers (work.md §1.5, `grow`): timeline bars
 * scale X from their start, chart bars scale Y from the baseline, progress
 * fills scale X, 320 ms on the out-curve, 16 ms apart and never more than
 * 240 ms of stagger in all.
 *
 * Once per view per session (the key): coming back to a view shows its bars
 * where they are, so motion means "this is new to you", never "the page
 * loaded again". Under reduced motion the bars are drawn at their final size,
 * and the flag says so (data-grown="instant") for the guard.
 */
const revealed = new Set<string>()

export type GrowMode = "animate" | "instant"

export interface Grow {
  mode: GrowMode
  /** Props for the nth bar: its data-grown flag and, when animating, its animation. */
  bar: (index: number, axis?: "x" | "y", origin?: string) => { "data-grown": GrowMode; style?: CSSProperties }
}

const GROW_MS = 320
const STAGGER_MS = 16
const CAP_MS = 240

/** The grow animation for the nth bar, as an inline style. */
export function growStyle(index: number, axis: "x" | "y" = "x", origin?: string, stagger = STAGGER_MS): CSSProperties {
  return {
    animation: `work-grow-${axis} ${GROW_MS}ms var(--ease-out) both`,
    animationDelay: `${Math.min(index * stagger, CAP_MS)}ms`,
    transformOrigin: origin ?? (axis === "x" ? "left center" : "center bottom"),
  }
}

/**
 * key names the view ("timeline:<project>"); ready is false while its data
 * loads, so a skeleton never uses up the reveal.
 */
export function useGrow(key: string, ready = true, stagger = STAGGER_MS): Grow {
  // Decided once, on the first render with data: animate only if this view
  // has not been revealed before in this session.
  const [mode, setMode] = useState<GrowMode | null>(null)
  useEffect(() => {
    if (!ready || mode) return
    if (prefersReducedMotion() || revealed.has(key)) setMode("instant")
    else {
      revealed.add(key)
      setMode("animate")
    }
  }, [key, ready, mode])
  const m: GrowMode = mode ?? (ready && !revealed.has(key) && !prefersReducedMotion() ? "animate" : "instant")
  return {
    mode: m,
    bar: (index, axis = "x", origin) =>
      m === "animate" ? { "data-grown": "animate", style: growStyle(index, axis, origin, stagger) } : { "data-grown": "instant" },
  }
}

/** For tests: forget which views were revealed. */
export function resetGrowForTests() {
  revealed.clear()
}
