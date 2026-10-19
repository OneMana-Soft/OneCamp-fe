"use client"

/**
 * One selection that slides between options (hub.md S8 scope chips, A3's
 * segmented filter, the account menu's Light / Dark / Auto): a single knob
 * element placed under the selected option. It moves by transform: placed at
 * its new box at once, then played from the old box (translate and scaleX),
 * so nothing is laid out per frame. Under reduced motion it simply jumps.
 */
import { useEffect, useLayoutEffect, useRef, type RefObject } from "react"

import { prefersReducedMotion } from "@/lib/reducedMotion"

const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect

/**
 * Keeps `knob` under the child of `container` matching `[data-selected]`.
 * `key` is whatever names the selection; the knob moves when it changes.
 */
export function useSlidingKnob(container: RefObject<HTMLElement | null>, knob: RefObject<HTMLElement | null>, key: string, duration = 180) {
  const last = useRef<{ left: number; width: number } | null>(null)
  useIsoLayoutEffect(() => {
    const box = container.current
    const k = knob.current
    if (!box || !k) return
    const sel = box.querySelector<HTMLElement>("[data-selected]")
    if (!sel) {
      k.style.opacity = "0"
      return
    }
    const left = sel.offsetLeft
    const width = sel.offsetWidth
    k.style.opacity = "1"
    k.style.width = `${width}px`
    k.style.transform = `translateX(${left}px)`
    const was = last.current
    last.current = { left, width }
    if (!was || (was.left === left && was.width === width) || prefersReducedMotion() || typeof k.animate !== "function") return
    k.animate(
      [
        { transform: `translateX(${was.left}px) scaleX(${was.width / Math.max(1, width)})` },
        { transform: `translateX(${left}px) scaleX(1)` },
      ],
      { duration, easing: "cubic-bezier(0.22, 1, 0.36, 1)" },
    )
  }, [key])
}
