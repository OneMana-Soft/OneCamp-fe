"use client"

import * as React from "react"

import { Drawer, DrawerContent, DrawerDescription, DrawerTitle } from "@/components/ui/drawer"
import { noWords } from "@/components/ui/overlayWords"

/**
 * ResponsiveDialog on a phone (components/ui/responsive-dialog): the sheet's
 * pinned header and footer, the content its one scroller. The footer sat in
 * the sheet's scroller once, with a second scroller of its own inside. Loaded
 * when one first opens on a phone, so a page that offers one doesn't carry
 * the sheet.
 *
 * It hugs what it holds, at any width (the medium detent): a short step's
 * footer sits under its last field, and only a long one grows to the sheet's
 * most and scrolls its body. A wide dialog's sheet was the large detent,
 * 92dvh whatever it held, with the guided run's invite step 380px above its
 * footer (DESIGN-BUILD-2, 20 Oct). Wide is the computer's dialog width only.
 */
export default function ResponsiveSheet({
  title,
  description,
  footer,
  onClose,
  children,
}: {
  title: string
  description?: string
  footer: React.ReactNode
  onClose(): void
  children: React.ReactNode
}) {
  return (
    <Drawer open onOpenChange={(open) => !open && onClose()} detent="medium">
      <DrawerContent
        {...noWords(description)}
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
