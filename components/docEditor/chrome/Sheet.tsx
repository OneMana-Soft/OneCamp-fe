"use client"

import * as React from "react"
import { useMedia } from "@/context/MediaQueryContext"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, type DialogSize } from "@/components/ui/dialog"
import { Drawer, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle } from "@/components/ui/drawer"

/**
 * One of the page chrome's dialogs (B6): a v3 dialog on a wide screen, the
 * phone's sheet on a phone, with the same title, body and buttons.
 */
export function ChromeSheet({
  open = true,
  onClose,
  title,
  description,
  size = "sm",
  footer,
  tertiary,
  children,
  ...rest
}: {
  open?: boolean
  onClose: () => void
  title: React.ReactNode
  description?: React.ReactNode
  size?: DialogSize
  footer?: React.ReactNode
  /** On the footer's left on a wide screen (Copy link). */
  tertiary?: React.ReactNode
  children?: React.ReactNode
} & { [data: `data-${string}`]: string }) {
  const { isMobile } = useMedia()
  if (isMobile)
    return (
      <Drawer open={open} onOpenChange={(o) => !o && onClose()} detent="medium">
        <DrawerContent {...rest}>
          <DrawerHeader className="pb-2">
            <DrawerTitle className="text-title-3 text-ink">{title}</DrawerTitle>
            {description ? <DrawerDescription className="text-ui-sm text-ink-2">{description}</DrawerDescription> : null}
          </DrawerHeader>
          <div className="flex flex-col gap-4 px-4 pb-2">{children}</div>
          {footer || tertiary ? (
            <DrawerFooter className="flex-row flex-wrap items-center justify-end gap-2">
              {tertiary ? <div className="mr-auto flex items-center gap-2">{tertiary}</div> : null}
              {footer}
            </DrawerFooter>
          ) : null}
        </DrawerContent>
      </Drawer>
    )
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent size={size} {...rest}>
        <DialogHeader>
          <DialogTitle className="text-title-3 text-ink">{title}</DialogTitle>
          {description ? <DialogDescription className="text-ui-sm text-ink-2">{description}</DialogDescription> : null}
        </DialogHeader>
        {children}
        {footer || tertiary ? <DialogFooter tertiary={tertiary}>{footer}</DialogFooter> : null}
      </DialogContent>
    </Dialog>
  )
}
