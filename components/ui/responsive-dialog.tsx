"use client"

import * as React from "react"
import { lazyView } from "@/lib/lazy/lazyView"
import { watchMore } from "@/components/ui/moreMarks"
import { useSheetMode } from "@/components/ui/overlayMode"
import { noWords } from "@/components/ui/overlayWords"
import { SheetFrame } from "@/components/ui/sheetFrame"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { focusDialogItself } from "@/components/ui/overlayFocus"

// On a phone, the sheet: loaded with the first one opened there. Until it
// lands, its frame (the scrim, the titled sheet, a busy body) stands in, so a
// tap is answered at once; next/dynamic showed nothing in the meantime.
const sheetView = lazyView(() => import("@/components/ui/responsive-sheet"))

/**
 * A dialog on a wide screen, the shared sheet (Drawer) on a phone: one
 * component for any dialog that must work on both (first B4's crop and words
 * dialogs). Closing it, by Escape, the scrim or a button, is onClose.
 * `focusSelf` focuses the dialog itself on a computer, with no ring, for one
 * whose first control is a button (focusDialogItself). `wide` is the dialog's
 * lg width; `xl` its widest, for two panes. On a phone the sheet hugs either.
 */
export function ResponsiveDialog({
  title,
  description,
  footer,
  onClose,
  wide,
  xl,
  focusSelf,
  children,
}: {
  title: string
  description?: string
  footer: React.ReactNode
  onClose(): void
  wide?: boolean
  xl?: boolean
  focusSelf?: boolean
  children: React.ReactNode
}) {
  // The phone rule (components/ui/overlayMode): a phone in landscape too.
  const sheet = useSheetMode()
  // Whether its loading frame stood in: the sheet then takes its place without rising again.
  const framed = React.useRef(false)
  const shown = React.useCallback(() => void (framed.current = true), [])
  const change = (open: boolean) => !open && onClose()
  if (sheet) {
    return (
      <sheetView.View
        fallback={<SheetFrame title={title} description={description} footer={footer} onShown={shown} onClose={onClose} />}
        render={({ default: ResponsiveSheet }) => (
          <ResponsiveSheet title={title} description={description} footer={footer} onClose={onClose} afterFrame={framed.current}>
            {children}
          </ResponsiveSheet>
        )}
      />
    )
  }
  return (
    <Dialog open onOpenChange={change}>
      {/* The one overlay layout (app/overlay.css): the content is a column that
          never scrolls itself; the body between the header and the footer is
          the one scroller, so the footer stays in view however tall the body
          (a step of the guided first run holds Admin › Import's whole card).
          Written as the data attributes, not OverlayBody, as first-load code
          should (components/ui/overlay): the content holds the body, so it
          carries data-overlay-holds-body, which the layout's rules read, and
          the body says when it has more above or below (moreMarks). */}
      <DialogContent
        size={xl ? "xl" : wide ? "lg" : "sm"}
        data-overlay="float"
        data-overlay-holds-body=""
        {...noWords(description)}
        className={focusSelf ? "outline-none" : undefined}
        onOpenAutoFocus={focusSelf ? focusDialogItself : undefined}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>
        <div ref={watchMore} data-overlay-body="" className="-mx-1 min-h-0 p-1">
          {children}
        </div>
        <DialogFooter>{footer}</DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
