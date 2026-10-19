"use client"

import * as React from "react"
import { Slot } from "@radix-ui/react-slot"

import { cn } from "@/lib/utils/helpers/cn"

/**
 * ONE OVERLAY LAYOUT: a header, a body that is the only scroller, a footer
 * always in view (app/overlay.css holds the rules and why; design/drawers-v3).
 * A root holding a body never scrolls itself. In first-load code, write the
 * data attributes these set (data-overlay-body, data-overlay-footer) instead
 * of importing this module.
 */
export { SHEET_QUERY, useSheetMode } from "@/components/ui/overlayMode"

// The quiet bar shows a thumb for a moment after a scroll: one listener.
let watching = false
const timers = new WeakMap<Element, number>()
function watchScrolling() {
  if (watching || typeof document === "undefined") return
  watching = true
  document.addEventListener(
    "scroll",
    (event) => {
      const el = event.target
      if (!(el instanceof HTMLElement) || !el.closest("[data-overlay]")) return
      el.setAttribute("data-scrolling", "")
      window.clearTimeout(timers.get(el))
      timers.set(el, window.setTimeout(() => el.removeAttribute("data-scrolling"), 900))
    },
    { capture: true, passive: true },
  )
}

type PartProps = React.HTMLAttributes<HTMLDivElement> & { asChild?: boolean }

/** Pinned over the body. */
export const OverlayHeader = React.forwardRef<HTMLDivElement, PartProps>(({ asChild, className, ...props }, ref) => {
  const Comp = asChild ? Slot : "div"
  return <Comp ref={ref} data-overlay-header="" className={cn("shrink-0", className)} {...props} />
})
OverlayHeader.displayName = "OverlayHeader"

/**
 * The one scroller. It says data-more-above and data-more-below, so the header
 * and footer draw a hairline only while there is more to see; 4px of room for
 * a field's halo, given back off its sides. `asChild` makes a list the body.
 */
export const OverlayBody = React.forwardRef<HTMLDivElement, PartProps>(({ asChild, className, ...props }, ref) => {
  const Comp = asChild ? Slot : "div"
  const [node, setNode] = React.useState<HTMLDivElement | null>(null)
  // One callback for the element's life, or React hands it null and back each commit.
  const refs = React.useMemo(
    () => (el: HTMLDivElement | null) => {
      setNode(el)
      if (typeof ref === "function") ref(el)
      else if (ref) ref.current = el
    },
    [ref],
  )
  React.useEffect(() => {
    watchScrolling()
    if (!node) return
    const measure = () => {
      node.toggleAttribute("data-more-above", node.scrollTop > 0)
      node.toggleAttribute("data-more-below", node.scrollTop + node.clientHeight < node.scrollHeight - 1)
    }
    measure()
    node.addEventListener("scroll", measure, { passive: true })
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null
    ro?.observe(node)
    if (node.firstElementChild) ro?.observe(node.firstElementChild)
    return () => {
      node.removeEventListener("scroll", measure)
      ro?.disconnect()
    }
  }, [node])
  return <Comp ref={refs} data-overlay-body="" className={cn("-mx-1 min-h-0 p-1", className)} {...props} />
})
OverlayBody.displayName = "OverlayBody"

/** The actions, pinned under the body. */
export const OverlayFooter = React.forwardRef<HTMLDivElement, PartProps>(({ asChild, className, ...props }, ref) => {
  const Comp = asChild ? Slot : "div"
  return <Comp ref={ref} data-overlay-footer="" className={cn("shrink-0", className)} {...props} />
})
OverlayFooter.displayName = "OverlayFooter"
