import { useCallback, type ForwardedRef } from "react"

// Marks a float's positioner and the page while it is up, for its sheet on a
// phone (app/overlay.css 8): a :has() tried every element for them.
let up = 0

export function useFloatRef<T extends HTMLElement>(ref: ForwardedRef<T>) {
  return useCallback(
    (node: T | null) => {
      const set = (n: T | null) => (typeof ref === "function" ? ref(n) : ref && (ref.current = n))
      const html = document.documentElement
      set(node)
      if (!node) return
      node.parentElement?.setAttribute("data-overlay-wrapper", "")
      if (!up++) html.setAttribute("data-float", "")
      return () => {
        set(null)
        if (!--up) html.removeAttribute("data-float")
      }
    },
    [ref],
  )
}
