"use client"

import { useCallback, useEffect, useRef, useState, type RefObject } from "react"
import { feedback } from "@/lib/ui/feedback"

/**
 * Pull to refresh on a phone (design v3, mobile L4, mock M6).
 *
 * The lists live on MQTT and SWR, so they are rarely stale, but a pull is how
 * a person on a phone asks "is this current?", and before this a pull did
 * nothing at all (the frame is overscroll-none). Pulled from the top of a
 * tab's list, the content follows with resistance, and the logo ring in the
 * space above fills as it goes. Past 72px the ring closes and ticks (the
 * selection signature); let go there and the content settles at 56px while
 * the ring spins and the lists ask again; then a moss check, and it goes
 * home. A failure shows a danger "!" that shakes, and a toast.
 *
 * Only from scrollTop 0: the indicator never mounts while the list is
 * scrolled. Touch only; a mouse has the browser's reload.
 */

/** Where the ring closes and a release refreshes. */
export const PULL_ARM = 72
/** Where the content rests while it refreshes. */
export const PULL_REST = 56
/** The resistance's ceiling: no pull goes further than this. */
export const PULL_MAX = 120

/**
 * How far the content follows a finger that has moved dy: 120 x (1 - e^(-dy/120)).
 * It reaches the 72px arm at a comfortable pull (about 110px of finger) and
 * never passes 120. (mobile.md writes the curve with 72 in front, but that
 * one could never reach its own 72px arm; the ceiling is its "never more
 * than 120".) Pure.
 */
export function pullDistance(dy: number): number {
  if (dy <= 0) return 0
  return PULL_MAX * (1 - Math.exp(-dy / PULL_MAX))
}

/** The ring's fill, 0 to 1, for a distance. Pure. */
export const pullProgress = (distance: number) => Math.max(0, Math.min(1, distance / PULL_ARM))

export type PullState = "idle" | "pulling" | "armed" | "refreshing" | "done" | "error"

interface Options {
  enabled: boolean
  onRefresh: () => Promise<unknown>
  /** Called when a refresh fails, after the ring has said so (a toast, usually). */
  onError?: () => void
}

const PUSH = "cubic-bezier(0.32, 0.72, 0, 1)"

/**
 * Attaches the gesture to a scroller. Returns what the indicator draws. The
 * content is moved with a transform on the scroller itself, so nothing is laid
 * out again while the finger moves.
 */
export function usePullToRefresh(scrollerRef: RefObject<HTMLElement | null>, { enabled, onRefresh, onError }: Options) {
  const [state, setState] = useState<PullState>("idle")
  const [distance, setDistance] = useState(0)
  const busy = useRef(false)
  const refresh = useRef(onRefresh)
  refresh.current = onRefresh
  const fail = useRef(onError)
  fail.current = onError
  const ringRef = useRef<HTMLDivElement>(null)

  const moveTo = useCallback((el: HTMLElement, from: number, to: number, ms: number) => {
    setDistance(to)
    if (typeof el.animate !== "function" || ms === 0) {
      el.style.transform = to > 0 ? `translateY(${to}px)` : ""
      return
    }
    const anim = el.animate([{ transform: `translateY(${from}px)` }, { transform: `translateY(${to}px)` }], { duration: ms, easing: PUSH, fill: "forwards" })
    anim.onfinish = () => {
      el.style.transform = to > 0 ? `translateY(${to}px)` : ""
      anim.cancel()
    }
  }, [])

  useEffect(() => {
    const el = scrollerRef.current
    if (!el || !enabled) return
    let startY = 0
    let startX = 0
    let active: "maybe" | "yes" | "no" = "no"
    let current = 0
    let armed = false

    const onStart = (e: TouchEvent) => {
      if (busy.current || e.touches.length !== 1 || el.scrollTop > 0) return
      startY = e.touches[0].clientY
      startX = e.touches[0].clientX
      active = "maybe"
      armed = false
    }
    const onMove = (e: TouchEvent) => {
      if (active === "no") return
      const dy = e.touches[0].clientY - startY
      const dx = e.touches[0].clientX - startX
      if (active === "maybe") {
        // Down, more than sideways, and still at the top: ours. Anything
        // else belongs to the scroll or to a sideways gesture.
        if (dy < 6 && Math.abs(dx) < 6) return
        if (dy <= 0 || Math.abs(dx) > dy || el.scrollTop > 0) {
          active = "no"
          return
        }
        active = "yes"
        el.setAttribute("data-pulling", "")
      }
      e.preventDefault()
      current = pullDistance(dy)
      el.style.transform = `translateY(${current}px)`
      setDistance(current)
      const nowArmed = current >= PULL_ARM
      if (nowArmed !== armed) {
        armed = nowArmed
        setState(nowArmed ? "armed" : "pulling")
        if (nowArmed) feedback("selection")
      } else if (!nowArmed) setState("pulling")
    }
    const onEnd = () => {
      if (active !== "yes") {
        active = "no"
        return
      }
      active = "no"
      el.removeAttribute("data-pulling")
      const reduced = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches
      if (!armed) {
        setState("idle")
        moveTo(el, current, 0, reduced ? 0 : 260)
        return
      }
      busy.current = true
      setState("refreshing")
      moveTo(el, current, PULL_REST, reduced ? 0 : 220)
      Promise.resolve()
        .then(() => refresh.current())
        .then(
          () => {
            setState("done")
            feedback("success", ringRef.current)
            window.setTimeout(() => {
              moveTo(el, PULL_REST, 0, reduced ? 0 : 300)
              setState("idle")
              busy.current = false
            }, 300)
          },
          () => {
            setState("error")
            feedback("warning")
            window.setTimeout(() => {
              moveTo(el, PULL_REST, 0, reduced ? 0 : 300)
              setState("idle")
              busy.current = false
              fail.current?.()
            }, 300)
          },
        )
    }
    el.addEventListener("touchstart", onStart, { passive: true })
    el.addEventListener("touchmove", onMove, { passive: false })
    el.addEventListener("touchend", onEnd, { passive: true })
    el.addEventListener("touchcancel", onEnd, { passive: true })
    return () => {
      el.removeEventListener("touchstart", onStart)
      el.removeEventListener("touchmove", onMove)
      el.removeEventListener("touchend", onEnd)
      el.removeEventListener("touchcancel", onEnd)
      el.style.transform = ""
      el.removeAttribute("data-pulling")
    }
  }, [scrollerRef, enabled, moveTo])

  return { state, distance, ringRef }
}

const R = 15
const C = 2 * Math.PI * R

/**
 * The indicator: the logo ring, centred in the space the pull opens. Mounted
 * only while there is a pull (state not idle), so a scrolled list never has it.
 */
export function PullIndicator({ state, distance, ringRef }: { state: PullState; distance: number; ringRef?: RefObject<HTMLDivElement | null> }) {
  if (state === "idle") return null
  const progress = state === "pulling" ? pullProgress(distance) : 1
  // Centred in what the content uncovered.
  const top = Math.max(0, distance / 2 - 18)
  return (
    <div
      ref={ringRef}
      className="ptr"
      data-state={state}
      data-pull-indicator=""
      role={state === "refreshing" ? "status" : undefined}
      aria-label={state === "refreshing" ? "Refreshing" : undefined}
      style={{ transform: `translateY(${top}px)` }}
    >
      <svg viewBox="0 0 36 36" width="36" height="36" aria-hidden="true">
        <defs>
          <linearGradient id="ptr-gradient" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" className="ptr-stop-a" />
            <stop offset="1" className="ptr-stop-b" />
          </linearGradient>
        </defs>
        {state === "done" ? (
          <path className="ptr-check" d="M11 18.5l4.5 4.5L25 13.5" fill="none" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" pathLength={1} strokeDasharray="1" style={{ animation: "ptr-draw 200ms cubic-bezier(0.22, 1, 0.36, 1) both" }} />
        ) : state === "error" ? (
          <g>
            <circle className="ptr-bang" cx="18" cy="18" r="13" />
            <path d="M18 11.5v8" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" />
            <circle cx="18" cy="24" r="1.5" fill="#fff" />
          </g>
        ) : (
          <>
            <g className="ptr-ring">
              <circle className="ptr-track" cx="18" cy="18" r={R} fill="none" strokeWidth="1.5" />
              <circle
                className="ptr-arc"
                cx="18"
                cy="18"
                r={R}
                fill="none"
                stroke="url(#ptr-gradient)"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeDasharray={C}
                strokeDashoffset={C * (1 - progress)}
                transform="rotate(-90 18 18)"
              />
            </g>
            <g className="ptr-orbit">
              <circle className="ptr-dot-a" cx={18 + R} cy="18" r="2.5" />
              <circle className="ptr-dot-b" cx={18 + R * Math.cos((210 * Math.PI) / 180)} cy={18 + R * Math.sin((210 * Math.PI) / 180)} r="2" />
            </g>
          </>
        )}
      </svg>
      {state === "refreshing" && <span className="ptr-label motion-safe:hidden">Refreshing…</span>}
    </div>
  )
}
