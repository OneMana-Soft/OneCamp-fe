"use client"

import { useEffect, useRef } from "react"
import { usePathname } from "next/navigation"

interface PageTransitionProps {
  children: React.ReactNode
}

/** How long the sheet's content takes to come up from .6 to full (design v3, shell §R). */
export const SHEET_CROSSFADE_MS = 120

type Input = { kind: "pointer" | "key"; at: number }

// What the person last used, pointer or keyboard. Read when the route changes:
// a navigation a key made (G then H, J/K, ⌘K and Enter) lands with no motion
// at all, as Raycast and Superhuman do; one a click made comes up softly.
let lastInput: Input = { kind: "key", at: 0 }
let tracking = false
function trackInput() {
  if (tracking || typeof window === "undefined") return
  tracking = true
  window.addEventListener("pointerdown", () => (lastInput = { kind: "pointer", at: performance.now() }), { capture: true, passive: true })
  window.addEventListener(
    "keydown",
    (e) => {
      if (["Shift", "Control", "Alt", "Meta"].includes(e.key)) return
      lastInput = { kind: "key", at: performance.now() }
    },
    { capture: true, passive: true },
  )
}

/** Whether a route change should crossfade: a pointer started it, recently, and motion is welcome. Pure. */
export function shouldCrossfade(input: Input, now: number, reducedMotion: boolean): boolean {
  return !reducedMotion && input.kind === "pointer" && now - input.at < 1500
}

/**
 * The sheet's content root, and the one route transition the app has
 * (design v3, shell §R). Navigation stays instant: when a click changes the
 * route, the new page's content comes up from opacity .6 to 1 over 120ms,
 * enter only, no exit and no movement, on the compositor. After a key, and
 * under reduced motion, there is none.
 *
 * Not the View Transitions API: the route renders on Next's schedule, and a
 * view transition holds a frozen picture of the old page until the new one
 * is ready, which is the wait the framer transition this replaced was
 * removed for (500 to 900ms per navigation). Web Animations, then a class,
 * animate the page as it arrives instead.
 */
export const PageTransition = ({ children }: PageTransitionProps) => {
  const pathname = usePathname()
  const ref = useRef<HTMLDivElement>(null)
  const first = useRef(true)
  useEffect(() => trackInput(), [])
  useEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    const el = ref.current
    if (!el) return
    const reduced = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches
    if (!shouldCrossfade(lastInput, performance.now(), reduced)) return
    if (typeof el.animate === "function") {
      el.animate([{ opacity: 0.6 }, { opacity: 1 }], { duration: SHEET_CROSSFADE_MS, easing: "cubic-bezier(0.22, 1, 0.36, 1)" })
    } else {
      el.classList.remove("sheet-crossfade")
      // Restarts the animation for a second click in a row.
      void el.offsetWidth
      el.classList.add("sheet-crossfade")
    }
  }, [pathname])
  return (
    <div ref={ref} data-sheet-content="" className="h-full w-full bg-background">
      {children}
    </div>
  )
}
