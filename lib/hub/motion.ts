"use client"

/**
 * The hub's once-per-session entrance (hub.md §1.1, `rise`), and the `resolve`
 * exit every list in the hub shares.
 *
 * RISE runs the first time a route is shown in a browser session: the greeting,
 * the guide and the two answers come up 6px, 40ms apart. Never on a
 * revalidation, a tab switch or coming back to the route, so a page somebody
 * lives in does not re-perform every visit. Off under reduced motion.
 *
 * RESOLVE is how a row leaves when it is done, approved, dismissed or archived:
 * the check springs, the row holds 280ms so the result is seen, then it slides
 * 12px and fades while the rows below FLIP up by its height (lib/hub/flip.ts).
 * Height never animates. Under reduced motion the row goes at once, and the
 * caller says what happened in an aria-live line.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react"

import { prefersReducedMotion } from "@/lib/reducedMotion"
import { captureRects, playFlip, type Rects } from "@/lib/hub/flip"

const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect

/** How long a resolved row holds still before it leaves (ms). */
export const RESOLVE_HOLD_MS = 280
/** How long the row's slide-and-fade takes (ms). */
export const RESOLVE_OUT_MS = 180

/**
 * A decision made in this page load, so React's strict double mount (and two
 * components on one route) get the same answer, while coming back to the route
 * later in the session gets "no".
 */
const decided = new Map<string, { at: number; rise: boolean }>()
const SAME_MOUNT_MS = 1500

/**
 * Whether `route` should play its entrance now. Marks the route as seen.
 * Storage is read in try/catch: a private window that refuses it simply
 * never animates twice, since the in-memory map still remembers.
 */
export function shouldRise(route: string, now = Date.now()): boolean {
  if (typeof window === "undefined" || prefersReducedMotion()) return false
  const prior = decided.get(route)
  if (prior) {
    if (now - prior.at < SAME_MOUNT_MS) return prior.rise
    return false
  }
  const key = `rise:${route}`
  let seen = false
  try {
    seen = window.sessionStorage.getItem(key) !== null
    if (!seen) window.sessionStorage.setItem(key, "1")
  } catch {
    seen = false
  }
  decided.set(route, { at: now, rise: !seen })
  return !seen
}

/** Test seam: forget this page load's decisions. */
export function resetRiseMemory(): void {
  decided.clear()
}

/**
 * True on the first render of `route` in this session (and under the same
 * mount). Decided before paint, so the entrance class is on the first frame
 * and nothing flashes in its final place first.
 */
export function useRiseOnce(route: string): boolean {
  const [rise, setRise] = useState(false)
  useIsoLayoutEffect(() => {
    if (shouldRise(route)) setRise(true)
  }, [route])
  return rise
}

/** The props an element in a rise stagger takes: its class and its step. */
export function riseProps(
  rise: boolean,
  step: number,
  { still = false }: { still?: boolean } = {},
): { className?: string; style?: React.CSSProperties; "data-rise-still"?: string } {
  if (!rise) return {}
  return {
    className: "hub-rise",
    style: { ["--i" as string]: Math.min(step, 6) } as React.CSSProperties,
    // The page's largest text moves without fading, so it counts as painted at once.
    ...(still ? { "data-rise-still": "" } : {}),
  }
}

export type ResolvePhase = "done" | "leaving"

/**
 * The resolve recipe for a list. `resolve(id, remove)` marks the row "done"
 * (it springs its check), holds, marks it "leaving" (it slides out), then
 * captures the rows' positions, calls `remove` (which drops it from the data)
 * and FLIPs the followers into their new places on the next layout.
 *
 *   const { phase, resolve } = useResolve(listRef)
 *   <HubRow data-resolve={phase(id)} ... />
 *   onDone={() => resolve(id, () => setRows((r) => r.filter((x) => x.id !== id)))}
 */
export function useResolve(container: RefObject<HTMLElement | null>) {
  const [phases, setPhases] = useState<Record<string, ResolvePhase>>({})
  const pending = useRef<Rects | null>(null)
  const timers = useRef<number[]>([])

  useEffect(() => {
    const live = timers.current
    return () => live.forEach((t) => window.clearTimeout(t))
  }, [])

  useIsoLayoutEffect(() => {
    if (!pending.current || !container.current) return
    playFlip(container.current, pending.current)
    pending.current = null
  })

  const resolve = useCallback(
    (id: string, remove: () => void) => {
      if (prefersReducedMotion()) {
        remove()
        return
      }
      setPhases((p) => ({ ...p, [id]: "done" }))
      timers.current.push(
        window.setTimeout(() => {
          setPhases((p) => ({ ...p, [id]: "leaving" }))
          timers.current.push(
            window.setTimeout(() => {
              if (container.current) pending.current = captureRects(container.current)
              setPhases((p) => {
                const next = { ...p }
                delete next[id]
                return next
              })
              remove()
            }, RESOLVE_OUT_MS),
          )
        }, RESOLVE_HOLD_MS),
      )
    },
    [container],
  )

  const phase = useCallback((id: string): ResolvePhase | undefined => phases[id], [phases])
  return { phase, resolve, resolving: Object.keys(phases).length > 0 }
}
