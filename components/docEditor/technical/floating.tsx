"use client"

/**
 * One floating panel at a time for the doc's technical blocks (docs programme
 * B3): a code block's language list, an equation's editor, a table's menu. The
 * blocks draw themselves in plain DOM (I20), so their panels are mounted here,
 * each in a React root of its own, when first asked for: this module and the
 * panels load on first use, never with the doc.
 *
 * A panel sits under its anchor (above it when there is no room), inside the
 * viewport (the shared Popover); on a phone it is the shared Drawer, a menu
 * sheet with its scrim. Escape and a click outside close it, and focus goes
 * back where it was (or to the editor).
 */

import * as React from "react"
import { createRoot, type Root } from "react-dom/client"
import { PHONE_QUERY } from "@/context/MediaQueryContext"
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover"
import { Drawer, DrawerContent, DrawerTitle } from "@/components/ui/drawer"
import { cn } from "@/lib/utils/helpers/cn"

export interface FloatingOptions {
  /** What the panel stands under, read again as the page scrolls. */
  anchor: () => DOMRect | null
  /** The panel's accessible name. */
  label: string
  /** Called once it has closed, however it closed. */
  onClose?(): void
  /** Where focus goes when it closes (else where it was before). */
  returnFocus?: () => void
  /** A phone shows a sheet at the bottom of the screen. */
  sheetOnPhone?: boolean
  className?: string
}

export type Render = (close: () => void) => React.ReactNode

let open: { close(): void } | null = null

/** Closes the panel that is open, if one is. */
export function closeFloating() {
  open?.close()
}

/** Opens a panel; the returned function closes it. */
export function openFloating(render: Render, options: FloatingOptions): () => void {
  open?.close()
  const host = document.createElement("div")
  host.setAttribute("data-doc-floating", "")
  document.body.appendChild(host)
  const before = document.activeElement as HTMLElement | null
  const root: Root = createRoot(host)
  let closed = false
  const close = () => {
    if (closed) return
    closed = true
    if (open === handle) open = null
    // Unmount after the click that closed it has finished.
    queueMicrotask(() => {
      root.unmount()
      host.remove()
    })
    if (options.returnFocus) options.returnFocus()
    else if (before && before.isConnected) before.focus({ preventScroll: true })
    options.onClose?.()
  }
  const handle = { close }
  open = handle
  root.render(<Floating options={options} close={close} render={render} host={host} />)
  return close
}

function Floating({ options, close, render, host }: { options: FloatingOptions; close: () => void; render: Render; host: HTMLElement }) {
  const phone = React.useMemo(() => !!options.sheetOnPhone && typeof window !== "undefined" && !!window.matchMedia?.(PHONE_QUERY).matches, [options.sheetOnPhone])
  const onOpenChange = (on: boolean) => !on && close()

  if (phone)
    return (
      <Drawer open onOpenChange={onOpenChange} detent="menu">
        <DrawerContent aria-label={options.label} data-doc-floating-panel="">
          <DrawerTitle className="sr-only">{options.label}</DrawerTitle>
          {render(close)}
        </DrawerContent>
      </Drawer>
    )

  // A virtual anchor: the block draws itself in plain DOM, and the rect is read again as the page moves.
  const anchor = { current: { getBoundingClientRect: () => options.anchor() ?? new DOMRect(-9999, -9999, 0, 0) } }
  return (
    <Popover open onOpenChange={onOpenChange}>
      <PopoverAnchor virtualRef={anchor} />
      <PopoverContent
        aria-label={options.label}
        data-doc-floating-panel=""
        side="bottom"
        align="start"
        sideOffset={6}
        collisionPadding={8}
        // The panel focuses its own first field or item; focus back is close()'s.
        onOpenAutoFocus={(e) => e.preventDefault()}
        onCloseAutoFocus={(e) => e.preventDefault()}
        // A press outside or Escape closes it; the doc taking focus back (a block selecting itself) doesn't.
        onFocusOutside={(e) => e.preventDefault()}
        // In the panel's own host, so it goes when the host does.
        container={host}
        className={cn("content-float w-auto p-0", options.className)}
      >
        {render(close)}
      </PopoverContent>
    </Popover>
  )
}
