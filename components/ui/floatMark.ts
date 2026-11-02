import { useCallback, type ForwardedRef } from "react"

// Marks a float's positioner and the page while it is up, for its sheet on a
// phone (app/overlay.css 8): a :has() tried every element for them.
let up = 0

// Animating these makes a box a fixed float's containing block.
const HOLDS = ["transform", "translate", "scale", "rotate", "filter", "perspective"]

function holdingAnimationsAbove(node: Element): Animation[] {
  if (typeof document.getAnimations !== "function") return []
  return document.getAnimations().filter((a) => {
    const effect = a.effect as KeyframeEffect | null
    const box = effect?.target
    return !!effect && !effect.pseudoElement && !!box && box !== node && box.contains(node) && a.timeline === document.timeline && a.playState === "running"
      && Number.isFinite(Number(effect.getComputedTiming().endTime)) && effect.getKeyframes().some((k) => HOLDS.some((p) => p in k))
  })
}

export function useFloatRef<T extends HTMLElement>(ref: ForwardedRef<T>) {
  return useCallback(
    (node: T | null) => {
      const set = (n: T | null) => (typeof ref === "function" ? ref(n) : ref && (ref.current = n))
      const html = document.documentElement
      set(node)
      if (!node) return
      node.parentElement?.setAttribute("data-overlay-wrapper", "")
      // Finish a box's grow-in before the float is placed in it (e2e/newTaskTemplate).
      for (const a of holdingAnimationsAbove(node)) a.finish()
      if (!up++) html.setAttribute("data-float", "")
      return () => {
        set(null)
        if (!--up) html.removeAttribute("data-float")
      }
    },
    [ref],
  )
}
