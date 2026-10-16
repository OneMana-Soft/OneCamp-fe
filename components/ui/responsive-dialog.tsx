"use client"

import * as React from "react"
import { useMedia } from "@/context/MediaQueryContext"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Drawer, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle } from "@/components/ui/drawer"

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
  const { isMobile } = useMedia()
  const change = (open: boolean) => !open && onClose()
  if (isMobile) {
    return (
      <Drawer open onOpenChange={change} detent={wide ? "large" : "medium"}>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle>{title}</DrawerTitle>
            {description ? <DrawerDescription>{description}</DrawerDescription> : null}
          </DrawerHeader>
          <div className="min-h-0 flex-1 overflow-auto px-4">{children}</div>
          <DrawerFooter>{footer}</DrawerFooter>
        </DrawerContent>
      </Drawer>
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
