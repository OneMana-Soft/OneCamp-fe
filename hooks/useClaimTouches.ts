"use client"

import { useEffect, type RefObject } from "react"

// One finger is the surface's; two or more are a pinch, which stays the browser's.
const claim = (e: Event) => {
  if (e.cancelable && ((e as TouchEvent).touches?.length ?? 1) < 2) e.preventDefault()
}

/**
 * A surface that keeps a finger's touches for itself while `on`, such as an ink layer while you draw: the browser
 * makes no gesture of them, so no scroll or fling. touch-action: none alone keeps the page still, but after a quick
 * stroke lifted mid-move Chromium still starts a fling, and the next tap anywhere only stops that fling: it never
 * clicks (V-207: the sharer's Clear drawings menu didn't open). Pointer events come before touch events, so the
 * surface's pointer handlers run as before. Touches that start anywhere else, and two fingers anywhere, are left
 * alone. React's onTouchStart and onTouchMove listen passively and can't do this, so the listeners are the element's
 * own, and they come off as soon as `on` does.
 */
export function useClaimTouches(ref: RefObject<Element | null>, on: boolean) {
  useEffect(() => {
    const el = ref.current
    if (!on || !el) return
    el.addEventListener("touchstart", claim, { passive: false })
    el.addEventListener("touchmove", claim, { passive: false })
    return () => {
      el.removeEventListener("touchstart", claim)
      el.removeEventListener("touchmove", claim)
    }
  }, [ref, on])
}
