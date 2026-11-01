import { useCallback, useRef, type Ref, type RefCallback } from "react"

// The page's one sheet mark, html[data-sheet="open"], while any sheet is open:
// a drawer, a dialog or confirm drawn as one, or the task's sheet
// (OverlaySheet). app/phone.css C9 reads it to keep a phone's toasts off the
// sheet's foot. One mark on <html>, never an html:has(), which is matched
// again on every change to the document (app/globals.css, AppShellMark).
// Counted, so a sheet over a sheet keeps it until the last one closes.
let open = 0

function hold(): () => void {
  if (!open++) document.documentElement.setAttribute("data-sheet", "open")
  let held = true
  return () => {
    if (!held) return
    held = false
    if (!--open) document.documentElement.removeAttribute("data-sheet")
  }
}

/**
 * A sheet primitive's ref, passed on to `ref`: while its node is a sheet
 * ([data-v3-sheet]) that says it is open, the page is marked. The mark goes
 * as the sheet starts to close, before its slide ends, and when it leaves.
 */
export function useSheetMark<T extends HTMLElement>(ref?: Ref<T>): RefCallback<T> {
  // The node's watch. React ends it through the cleanup below; vaul composes
  // refs the older way, dropping the cleanup, and calls the ref with null.
  const watching = useRef<(() => void) | null>(null)
  return useCallback(
    (node: T | null) => {
      watching.current?.()
      watching.current = null
      const pass = (n: T | null) => {
        if (typeof ref === "function") return ref(n)
        if (ref) ref.current = n
      }
      const undo = pass(node)
      if (!node) return
      let release: (() => void) | null = null
      const watch = () => {
        const isOpen = node.hasAttribute("data-v3-sheet") && node.getAttribute("data-state") === "open"
        if (isOpen && !release) release = hold()
        else if (!isOpen && release) {
          release()
          release = null
        }
      }
      const observer = new MutationObserver(watch)
      observer.observe(node, { attributes: true, attributeFilter: ["data-state", "data-v3-sheet"] })
      watch()
      const end = () => {
        observer.disconnect()
        release?.()
        release = null
      }
      watching.current = end
      return () => {
        if (watching.current === end) watching.current = null
        end()
        if (typeof undo === "function") undo()
        else pass(null)
      }
    },
    [ref],
  )
}
