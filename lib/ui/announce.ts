import { createElement } from "react"

/**
 * The app's one polite live region (INTERACTION_SPEC.md §7.5): what a drag
 * picked up, where it is, where it landed or that it went back, and an undo.
 * LiveRegion is mounted once, in the app's layout; announce() also makes the
 * region on a page that has none, so a public page can speak too.
 */
const ATTR = "data-announce"

function region(): HTMLElement | null {
  if (typeof document === "undefined") return null
  let el = document.querySelector<HTMLElement>(`[${ATTR}]`)
  if (!el) {
    el = document.createElement("div")
    el.setAttribute(ATTR, "")
    el.setAttribute("role", "status")
    el.setAttribute("aria-live", "polite")
    el.setAttribute("aria-atomic", "true")
    el.className = "sr-only"
    document.body.appendChild(el)
  }
  return el
}

let timer: ReturnType<typeof setTimeout> | undefined

/**
 * Says `text` once. The region is emptied first and filled a beat later, so
 * the same words said twice ("position 2 of 5") are spoken both times.
 */
export function announce(text: string): void {
  const el = region()
  if (!el) return
  el.textContent = ""
  clearTimeout(timer)
  timer = setTimeout(() => {
    el.textContent = text
  }, 60)
}

export function LiveRegion() {
  return createElement("div", { [ATTR]: "", role: "status", "aria-live": "polite", "aria-atomic": "true", className: "sr-only" })
}
