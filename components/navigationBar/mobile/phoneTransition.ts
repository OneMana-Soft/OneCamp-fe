"use client"

import { useEffect, useRef, type RefObject } from "react"
import { parentPath } from "@/lib/navigation/back"

/**
 * Push and pop between pages on a phone (design v3, mobile C4).
 *
 * The rule from 9 Oct holds: no exit animation that keeps a route mounted, and
 * nothing that waits on data. The framer transition this app once had held the
 * old page for 450ms and froze the router, 500 to 900ms a navigation. So only
 * the NEW page moves, once it has committed, enter only: a push brings it 24px
 * in from the right as it comes up from .4, a pop from the left, 240ms on the
 * out-curve; a tab is a sibling, not depth, and only fades (120ms). The top
 * bar stays where it is and its title follows the page in.
 *
 * Played with the Web Animations API on the phone's scroller, so it is
 * transform and opacity on the compositor, and nothing renders twice.
 *
 * When the browser already animated the change (Safari's own edge swipe back
 * in a tab, which plays its snapshot), ours is skipped: the Navigation API's
 * hasUAVisualTransition where it exists, and otherwise a popstate within
 * 400ms of a touch that began at a screen edge.
 */

export type PhoneMotion = "push" | "pop" | "tab" | "none"

/** The four tabs' roots: moving between them is sideways, not deeper. */
export const TAB_ROOTS = ["/app/home", "/app/channel", "/app/chat", "/app/inbox"]

export const isTabRoot = (path: string) => TAB_ROOTS.includes(clean(path))

function clean(path: string): string {
  return (path || "").split(/[?#]/)[0].replace(/\/+$/, "") || "/"
}

/** Which way a route change moves. Pure. */
export function routeMotion(prev: string, next: string, popped: boolean): PhoneMotion {
  const a = clean(prev)
  const b = clean(next)
  if (a === b) return "none"
  if (isTabRoot(a) && isTabRoot(b)) return "tab"
  if (popped) return "pop"
  // Up a level without history (the back arrow's replace to the parent).
  if (a.startsWith(`${b}/`) || parentPath(a) === b) return "pop"
  return "push"
}

const PUSH_X = 24
const OUT = "cubic-bezier(0.22, 1, 0.36, 1)"
const PUSH_CURVE = "cubic-bezier(0.32, 0.72, 0, 1)"

/** The page's keyframes and timing for a motion. Pinned by phoneTransition.test.ts. */
export function pageFrames(motion: PhoneMotion): { frames: Keyframe[]; options: KeyframeAnimationOptions } | null {
  switch (motion) {
    case "push":
    case "pop": {
      const x = motion === "push" ? PUSH_X : -PUSH_X
      return {
        frames: [
          { transform: `translateX(${x}px)`, opacity: 0.4 },
          { transform: "translateX(0)", opacity: 1 },
        ],
        options: { duration: 240, easing: OUT },
      }
    }
    case "tab":
      return { frames: [{ opacity: 0.5 }, { opacity: 1 }], options: { duration: 120, easing: "linear" } }
    default:
      return null
  }
}

/** The top bar's title, which enters from x +16 (push) or -16 (pop) and fades; on a tab it only fades. */
export function titleFrames(motion: PhoneMotion): { frames: Keyframe[]; options: KeyframeAnimationOptions } | null {
  if (motion === "push" || motion === "pop") {
    const x = motion === "push" ? 16 : -16
    return {
      frames: [
        { transform: `translateX(${x}px)`, opacity: 0 },
        { transform: "translateX(0)", opacity: 1 },
      ],
      options: { duration: 240, easing: PUSH_CURVE },
    }
  }
  if (motion === "tab") return { frames: [{ opacity: 0 }, { opacity: 1 }], options: { duration: 120, easing: "linear" } }
  return null
}

/** Under reduced motion, every change is the same 120ms fade. */
export const REDUCED_PAGE: { frames: Keyframe[]; options: KeyframeAnimationOptions } = {
  frames: [{ opacity: 0.6 }, { opacity: 1 }],
  options: { duration: 120, easing: "linear" },
}

/** A touch that began this close to a side edge may be the browser's own swipe back. */
export const EDGE_PX = 24
/** How soon after such a touch a popstate counts as the browser's animation. */
export const UA_SWIPE_MS = 400

/** Whether the browser animated this history change itself. Pure. */
export function browserAnimated(
  uaVisual: boolean | undefined,
  edgeTouchEndedAt: number | null,
  poppedAt: number | null,
): boolean {
  if (uaVisual !== undefined) return uaVisual
  if (edgeTouchEndedAt === null || poppedAt === null) return false
  return poppedAt - edgeTouchEndedAt >= -50 && poppedAt - edgeTouchEndedAt <= UA_SWIPE_MS
}

interface NavigateEventLike extends Event {
  hasUAVisualTransition?: boolean
}

/**
 * Plays the phone's page motion on the scroller whenever the pathname
 * changes, and keeps each page's scroll so a pop lands where you left it.
 */
export function usePhoneTransition(
  scrollerRef: RefObject<HTMLElement | null>,
  titleSelector: string,
  pathname: string,
): void {
  const prev = useRef(pathname)
  const popped = useRef<number | null>(null)
  const edgeTouchEnd = useRef<number | null>(null)
  const uaVisual = useRef<boolean | undefined>(undefined)
  const scrolls = useRef(new Map<string, number>())

  useEffect(() => {
    const onPop = () => {
      popped.current = performance.now()
    }
    let edgeStart = false
    const onStart = (e: TouchEvent) => {
      const x = e.touches[0]?.clientX ?? 0
      edgeStart = x <= EDGE_PX || x >= window.innerWidth - EDGE_PX
    }
    const onEnd = () => {
      if (edgeStart) edgeTouchEnd.current = performance.now()
      edgeStart = false
    }
    const nav = (window as unknown as { navigation?: EventTarget }).navigation
    const onNavigate = (e: Event) => {
      const v = (e as NavigateEventLike).hasUAVisualTransition
      uaVisual.current = typeof v === "boolean" ? v : undefined
    }
    window.addEventListener("popstate", onPop)
    window.addEventListener("touchstart", onStart, { passive: true, capture: true })
    window.addEventListener("touchend", onEnd, { passive: true, capture: true })
    nav?.addEventListener?.("navigate", onNavigate)
    return () => {
      window.removeEventListener("popstate", onPop)
      window.removeEventListener("touchstart", onStart, { capture: true })
      window.removeEventListener("touchend", onEnd, { capture: true })
      nav?.removeEventListener?.("navigate", onNavigate)
    }
  }, [])

  // The scroll of the page being left, read while it is still on screen.
  useEffect(() => {
    const el = scrollerRef.current
    if (!el) return
    const save = () => scrolls.current.set(prev.current, el.scrollTop)
    el.addEventListener("scroll", save, { passive: true })
    return () => el.removeEventListener("scroll", save)
  }, [scrollerRef])

  useEffect(() => {
    const from = prev.current
    if (from === pathname) return
    prev.current = pathname
    const now = performance.now()
    const poppedAt = popped.current
    const wasPop = poppedAt !== null && now - poppedAt < 1000
    popped.current = null
    const skip = wasPop && browserAnimated(uaVisual.current, edgeTouchEnd.current, poppedAt)
    uaVisual.current = undefined
    const motion = skip ? "none" : routeMotion(from, pathname, wasPop)
    const el = scrollerRef.current
    if (!el) return

    // A pop lands where you left the page; anything else starts at its top.
    const kept = wasPop ? scrolls.current.get(pathname) : undefined
    if (kept !== undefined && kept > 0) {
      requestAnimationFrame(() => {
        el.scrollTop = Math.min(kept, el.scrollHeight - el.clientHeight)
      })
    }

    if (motion === "none" || typeof el.animate !== "function") return
    const reduced = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches
    const page = reduced ? REDUCED_PAGE : pageFrames(motion)
    if (page) el.animate(page.frames, page.options)
    const title = document.querySelector<HTMLElement>(titleSelector)
    const t = reduced ? null : titleFrames(motion)
    if (title && t && typeof title.animate === "function") title.animate(t.frames, t.options)
  }, [pathname, scrollerRef, titleSelector])
}
