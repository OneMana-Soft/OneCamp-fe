"use client"

import * as React from "react"
import { Slot } from "@radix-ui/react-slot"

import { watchMore } from "@/components/ui/moreMarks"
import { cn } from "@/lib/utils/helpers/cn"
import { markAttribute } from "@/lib/ui/markAttribute"

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

/**
 * What app/overlay.css lays out around a body, marked by the body instead of
 * found by :has(), which Chrome tried on every element of every page
 * (app/selectorKeyGuard.test.ts). The same shapes the :has() rules had: a
 * floating root, or a dialog (a sheet of its own on a phone), that holds the
 * body up to three boxes down; a box one or two under a root with the body
 * one or two under it (one, for a box two down), unless it is a sheet's base;
 * a sheet's body that holds it directly or through its base. A drawer is a
 * column already, and its sheet's body is what holds. Returns the undo.
 */
export function markOverlayColumn(body: HTMLElement): () => void {
  const undo: Array<() => void> = []
  const [a1, a2, a3] = [body.parentElement, body.parentElement?.parentElement, body.parentElement?.parentElement?.parentElement]
  const root = (el?: Element | null) => !!el?.hasAttribute("data-overlay")
  const box = (el?: Element | null) => !!el && !el.hasAttribute("data-overlay-body") && !el.hasAttribute("data-sheet-base")
  const holder = (el?: Element | null) => ["float", "dialog"].includes(el?.getAttribute("data-overlay") ?? "")
  for (const el of [a1, a2, a3]) if (holder(el)) markAttribute(el, "data-overlay-holds-body", undo)
  if (box(a1) && (root(a2) || root(a3))) markAttribute(a1, "data-overlay-column", undo)
  if (box(a2) && root(a3)) markAttribute(a2, "data-overlay-column", undo)
  if (a1?.hasAttribute("data-sheet-body")) markAttribute(a1, "data-overlay-holds-body", undo)
  else if (a1?.hasAttribute("data-sheet-base") && a2?.hasAttribute("data-sheet-body")) markAttribute(a2, "data-overlay-holds-body", undo)
  return () => undo.splice(0).forEach((u) => u())
}

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
  const unmark = React.useRef<() => void>(undefined)
  // One callback for the element's life, or React hands it null and back each commit.
  // It marks the layout's column before the first paint (markOverlayColumn).
  const refs = React.useMemo(
    () => (el: HTMLDivElement | null) => {
      unmark.current?.()
      unmark.current = el ? markOverlayColumn(el) : undefined
      setNode(el)
      if (typeof ref === "function") ref(el)
      else if (ref) ref.current = el
    },
    [ref],
  )
  React.useEffect(() => {
    watchScrolling()
    return watchMore(node)
  }, [node])
  return <Comp ref={refs} data-overlay-body="" className={cn("-mx-1 min-h-0 p-1", className)} {...props} />
})
OverlayBody.displayName = "OverlayBody"

/**
 * What app/overlay.css 8b lays out under a footer, marked by the footer
 * instead of found by :has() (app/selectorKeyGuard.test.ts): a floating root
 * that holds one adds no bottom padding of its own on a phone, where the
 * footer's foot is the sheet's. A drawer marks itself (components/ui/drawer).
 * Returns the undo.
 */
function markOverlayFooter(footer: HTMLElement): () => void {
  const undo: Array<() => void> = []
  const root = footer.parentElement?.closest("[data-overlay]")
  if (root?.getAttribute("data-overlay") === "float") markAttribute(root, "data-overlay-holds-footer", undo)
  return () => undo.splice(0).forEach((u) => u())
}

/** The actions, pinned under the body. */
export const OverlayFooter = React.forwardRef<HTMLDivElement, PartProps>(({ asChild, className, ...props }, ref) => {
  const Comp = asChild ? Slot : "div"
  const unmark = React.useRef<() => void>(undefined)
  // One callback for the element's life, as OverlayBody's: it marks the root before the first paint.
  const refs = React.useMemo(
    () => (el: HTMLDivElement | null) => {
      unmark.current?.()
      unmark.current = el ? markOverlayFooter(el) : undefined
      if (typeof ref === "function") ref(el)
      else if (ref) ref.current = el
    },
    [ref],
  )
  return <Comp ref={refs} data-overlay-footer="" className={cn("shrink-0", className)} {...props} />
})
OverlayFooter.displayName = "OverlayFooter"
