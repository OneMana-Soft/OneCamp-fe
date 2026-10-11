"use client"

import { useEffect, type RefObject } from "react"

/**
 * The edge swipe back, in the installed app only (design v3, mobile C4.4).
 *
 * In Safari's tab iOS gives a back swipe of its own; in a standalone PWA it
 * gives nothing, and the 44px arrow was the only way back. So there, a drag
 * that starts within 20px of the left edge and goes sideways before it goes
 * down takes the page with the finger, 1:1, over the frame. Let go past half
 * the width, or flicked faster than 500px/s, and it finishes the trip and goes
 * back; otherwise it springs home. Android has its own predictive back and is
 * left alone.
 *
 * Long press ignores touches within 30px of the edges (useLongPress EDGE_PX),
 * so the two never fight. Under reduced motion the page still follows the
 * finger (direct manipulation) and the finish is instant.
 */

/** Where an edge swipe may begin, from the left edge. */
export const EDGE_START_PX = 20
/** How far sideways it must go, before it goes down, to be a swipe. */
export const AXIS_LOCK_PX = 8
/** The flick that commits on its own, in px/ms (500 px/s). */
export const COMMIT_VELOCITY = 0.5

/** Whether a release goes back: past half the width, or a flick. Pure. */
export function shouldCommit(dx: number, width: number, velocity: number): boolean {
  if (dx <= 0) return false
  return dx > width * 0.5 || velocity > COMMIT_VELOCITY
}

/** How long the rest of the trip takes, from where it was let go: max(160, 380 x what remains). Pure. */
export function finishMs(dx: number, width: number, commit: boolean): number {
  if (!commit) return 260
  const remaining = Math.max(0, Math.min(1, 1 - dx / Math.max(1, width)))
  return Math.round(Math.max(160, 380 * remaining))
}

export function isStandalone(win: Window = window): boolean {
  if (typeof win.matchMedia !== "function") return false
  const nav = win.navigator as Navigator & { standalone?: boolean }
  return win.matchMedia("(display-mode: standalone)").matches || nav.standalone === true
}

/** The installed app on a platform that gives it no back swipe of its own (iOS, not Android). */
export function wantsEdgeBack(win: Window = window): boolean {
  return isStandalone(win) && !/Android/i.test(win.navigator.userAgent)
}

const PUSH = "cubic-bezier(0.32, 0.72, 0, 1)"
const SPRING = "cubic-bezier(0.3, 1.35, 0.5, 1)"

/**
 * Wires the gesture onto the scroller. `canGoBack` says whether there is
 * somewhere to go (a tab's root has nowhere); `back` goes there.
 */
export function useEdgeBack(
  scrollerRef: RefObject<HTMLElement | null>,
  viewportRef: RefObject<HTMLElement | null>,
  canGoBack: boolean,
  back: () => void,
): void {
  useEffect(() => {
    const el = scrollerRef.current
    const frame = viewportRef.current
    if (!el || !frame || !canGoBack || !wantsEdgeBack()) return

    let startX = 0
    let startY = 0
    let tracking: "maybe" | "yes" | "no" = "no"
    let lastX = 0
    let lastT = 0
    let velocity = 0
    const reduced = () => typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches

    const set = (dx: number) => {
      el.style.transform = dx > 0 ? `translateX(${dx}px)` : ""
    }
    const end = (commit: boolean, dx: number) => {
      const width = el.clientWidth || window.innerWidth
      const ms = reduced() ? 0 : finishMs(dx, width, commit)
      const to = commit ? width : 0
      const done = () => {
        if (commit) {
          back()
          // The next page comes in with the pop; until then the frame shows.
          window.setTimeout(() => {
            el.style.transform = ""
            frame.removeAttribute("data-edge-back")
          }, 600)
        } else {
          el.style.transform = ""
          frame.removeAttribute("data-edge-back")
        }
      }
      if (ms === 0 || typeof el.animate !== "function") {
        set(to)
        done()
        return
      }
      const anim = el.animate([{ transform: `translateX(${dx}px)` }, { transform: `translateX(${to}px)` }], {
        duration: ms,
        easing: commit ? PUSH : SPRING,
        fill: "forwards",
      })
      anim.onfinish = () => {
        set(to)
        anim.cancel()
        done()
      }
    }

    const onStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) return
      const t = e.touches[0]
      if (t.clientX > EDGE_START_PX) return
      startX = t.clientX
      startY = t.clientY
      lastX = t.clientX
      lastT = e.timeStamp
      velocity = 0
      tracking = "maybe"
    }
    const onMove = (e: TouchEvent) => {
      if (tracking === "no") return
      const t = e.touches[0]
      const dx = t.clientX - startX
      const dy = t.clientY - startY
      if (tracking === "maybe") {
        if (Math.abs(dy) > AXIS_LOCK_PX && Math.abs(dy) >= Math.abs(dx)) {
          tracking = "no"
          return
        }
        if (dx < AXIS_LOCK_PX) return
        tracking = "yes"
        frame.setAttribute("data-edge-back", "true")
      }
      e.preventDefault()
      const dt = Math.max(1, e.timeStamp - lastT)
      velocity = (t.clientX - lastX) / dt
      lastX = t.clientX
      lastT = e.timeStamp
      set(Math.max(0, dx))
    }
    const onEnd = () => {
      if (tracking !== "yes") {
        tracking = "no"
        return
      }
      tracking = "no"
      const dx = Math.max(0, lastX - startX)
      end(shouldCommit(dx, el.clientWidth || window.innerWidth, velocity), dx)
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
      frame.removeAttribute("data-edge-back")
    }
  }, [scrollerRef, viewportRef, canGoBack, back])
}
