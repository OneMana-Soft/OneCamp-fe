"use client"

import * as React from "react"

import { Drawer, DrawerContent, DrawerDescription, DrawerTitle } from "@/components/ui/drawer"

/**
 * ResponsiveDialog on a phone (components/ui/responsive-dialog): the sheet's
 * pinned header and footer, the content its one scroller. The footer sat in
 * the sheet's scroller once, with a second scroller of its own inside. Loaded
 * when one first opens on a phone, so a page that offers one doesn't carry
 * the sheet.
 */
export default function ResponsiveSheet({
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
  return (
    <Drawer open onOpenChange={(open) => !open && onClose()} detent={wide ? "large" : "medium"}>
      <DrawerContent
        header={
          <>
            <DrawerTitle className="text-title-3 text-ink">{title}</DrawerTitle>
            {description ? <DrawerDescription className="mt-0.5 text-meta text-ink-3">{description}</DrawerDescription> : null}
          </>
        }
        footer={<div className="flex flex-col-reverse gap-2 [&>*]:h-11">{footer}</div>}
      >
        <div className="px-4 pb-2">{children}</div>
      </DrawerContent>
    </Drawer>
  )
}
