"use client"

import * as React from "react"
import { useSheetMode } from "@/components/ui/overlayMode"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, type DialogSize } from "@/components/ui/dialog"
import { Drawer, DrawerContent, DrawerDescription, DrawerTitle } from "@/components/ui/drawer"
import { OverlayBody } from "@/components/ui/overlay"

/**
 * One of the page chrome's dialogs (B6): a v3 dialog on a wide screen, the
 * phone's sheet on a phone held either way (components/ui/overlayMode), with
 * the same title, body and buttons. In the sheet the title and the buttons
 * stay put and the body between them is the one thing that scrolls (the
 * share list's own height cap made a second scroller in it: e2e/sheetLayout),
 * each section at its own height: a flex column there squeezed Share's
 * General access to a 12px sliver on a phone held sideways.
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
  const sheet = useSheetMode()
  if (sheet)
    return (
      <Drawer open={open} onOpenChange={(o) => !o && onClose()} detent="medium">
        <DrawerContent
          {...rest}
          header={
            <>
              <DrawerTitle className="text-title-3 text-ink">{title}</DrawerTitle>
              {description ? <DrawerDescription className="text-ui-sm text-ink-2">{description}</DrawerDescription> : null}
            </>
          }
          footer={
            footer || tertiary ? (
              // The note on its own line; the actions in one row under it, the
              // first on the left and the last on the right.
              <div className="flex flex-col gap-2">
                {tertiary ? <div className="flex items-center gap-2">{tertiary}</div> : null}
                {footer ? <div className="flex items-center justify-end gap-2 [&>*:first-child:not(:last-child)]:mr-auto">{footer}</div> : null}
              </div>
            ) : undefined
          }
        >
          <OverlayBody asChild className="mx-0 space-y-4 px-4 pb-2">
            <div>{children}</div>
          </OverlayBody>
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
