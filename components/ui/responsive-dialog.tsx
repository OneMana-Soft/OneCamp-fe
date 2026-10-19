"use client"

import * as React from "react"
import dynamic from "next/dynamic"
import { useSheetMode } from "@/components/ui/overlayMode"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"

// On a phone, the sheet: loaded with the first one opened there.
const ResponsiveSheet = dynamic(() => import("@/components/ui/responsive-sheet"), { ssr: false })

/**
 * A dialog on a wide screen, the shared sheet (Drawer) on a phone: one
 * component for any dialog that must work on both (first B4's crop and words
 * dialogs). Closing it, by Escape, the scrim or a button, is onClose.
 */
export function ResponsiveDialog({
  title,
  description,
  footer,
  onClose,
  wide,
  children,
}: {
  title: string
  description?: string
  footer: React.ReactNode
  onClose(): void
  wide?: boolean
  children: React.ReactNode
}) {
  // The phone rule (components/ui/overlayMode): a phone in landscape too.
  const sheet = useSheetMode()
  const change = (open: boolean) => !open && onClose()
  if (sheet) {
    return (
      <ResponsiveSheet title={title} description={description} footer={footer} onClose={onClose} wide={wide}>
        {children}
      </ResponsiveSheet>
    )
  }
  return (
    <Dialog open onOpenChange={change}>
      <DialogContent size={wide ? "lg" : "sm"}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>
        {children}
        <DialogFooter>{footer}</DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
