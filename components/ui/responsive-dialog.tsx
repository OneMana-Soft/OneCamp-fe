"use client"

import * as React from "react"
import dynamic from "next/dynamic"
import { useSheetMode } from "@/components/ui/overlayMode"
import { noWords } from "@/components/ui/overlayWords"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, focusDialogItself } from "@/components/ui/dialog"

// On a phone, the sheet: loaded with the first one opened there.
const ResponsiveSheet = dynamic(() => import("@/components/ui/responsive-sheet"), { ssr: false })

/**
 * A dialog on a wide screen, the shared sheet (Drawer) on a phone: one
 * component for any dialog that must work on both (first B4's crop and words
 * dialogs). Closing it, by Escape, the scrim or a button, is onClose.
 * `focusSelf` focuses the dialog itself on a computer, with no ring, for one
 * whose first control is a button (focusDialogItself).
 */
export function ResponsiveDialog({
  title,
  description,
  footer,
  onClose,
  wide,
  focusSelf,
  children,
}: {
  title: string
  description?: string
  footer: React.ReactNode
  onClose(): void
  wide?: boolean
  focusSelf?: boolean
  children: React.ReactNode
}) {
  // The phone rule (components/ui/overlayMode): a phone in landscape too.
  const sheet = useSheetMode()
  const change = (open: boolean) => !open && onClose()
  if (sheet) {
    return (
      <ResponsiveSheet title={title} description={description} footer={footer} onClose={onClose}>
        {children}
      </ResponsiveSheet>
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
          carries data-overlay-holds-body, which the layout's rules read. */}
      <DialogContent
        size={wide ? "lg" : "sm"}
        data-overlay="float"
        data-overlay-holds-body=""
        {...noWords(description)}
        className={focusSelf ? "outline-none" : undefined}
        onOpenAutoFocus={focusSelf ? focusDialogItself : undefined}
      >
        <DialogHeader data-overlay-header="">
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>
        <div data-overlay-body="" className="-mx-1 min-h-0 p-1">
          {children}
        </div>
        <DialogFooter data-overlay-footer="">{footer}</DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
