"use client"

import * as React from "react"

import { cn } from "@/lib/utils/helpers/cn"
import { Drawer, DrawerContent, DrawerDescription, DrawerTitle } from "@/components/ui/drawer"
import { noWords } from "@/components/ui/overlayWords"
import { SHEET_FOOTER_ROW, SHEET_LINE } from "@/components/ui/sheetFrame"

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
  className,
  afterFrame,
  children,
}: {
  title: string
  description?: string
  footer: React.ReactNode
  onClose(): void
  /** The sheet's own surface, where its caller stands on one: a call's sheet is on the call's dark surface (callSurface). */
  className?: string
  /** It takes the place of its loading frame (sheetFrame), which rose already: it doesn't rise again (app/phone.css C5f). */
  afterFrame?: boolean
  children: React.ReactNode
}) {
  return (
    <Drawer open onOpenChange={(open) => !open && onClose()} detent="medium">
      <DrawerContent
        // Its mark: e2e/approvalsWaiting holds the chunk that carries it to see the loading frame (sheetFrame).
        data-responsive-sheet=""
        className={cn(className, afterFrame && "sheet-after-frame")}
        overlayClassName={afterFrame ? "sheet-after-frame" : undefined}
        {...noWords(description)}
        header={
          <>
            <DrawerTitle className="text-title-3 text-ink">{title}</DrawerTitle>
            {description ? <DrawerDescription className={SHEET_LINE}>{description}</DrawerDescription> : null}
          </>
        }
        // Stacked upright; side by side held sideways, where two rows of 44px
        // left Remind me's month a sliver above them. 4px over the content, so
        // a field at its top keeps its ring.
        footer={<div className={SHEET_FOOTER_ROW}>{footer}</div>}
      >
        <div className="px-4 pb-2 pt-1">{children}</div>
      </DrawerContent>
    </Drawer>
  )
}
