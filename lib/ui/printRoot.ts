import { useCallback } from "react"

import { markAttribute } from "@/lib/ui/markAttribute"

/**
 * PRINTING ONE PART OF A PAGE (app/globals.css). An element marked
 * data-print-root prints alone: every box around it, up to <html>, carries
 * data-print-path while it is on the page, and the print rules key on that
 * mark. They used to find those boxes by :has(), which Chrome tries on every
 * element (app/selectorKeyGuard.test.ts). Returns the undo.
 */
export function markPrintPath(root: Element): () => void {
  const undo: Array<() => void> = []
  for (let el = root.parentElement; el; el = el.parentElement) markAttribute(el, "data-print-path", undo)
  return () => undo.splice(0).forEach((u) => u())
}

/** The print root's ref: it marks the boxes around it while it is mounted. */
export function usePrintRoot(): (el: HTMLElement | null) => (() => void) | undefined {
  return useCallback((el: HTMLElement | null) => (el ? markPrintPath(el) : undefined), [])
}
