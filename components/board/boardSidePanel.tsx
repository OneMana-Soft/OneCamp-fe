"use client"

// The board's side panel (Frames, Filter by tag): a sheet on a phone, a panel floating at the board's right on a
// computer. Its name heads it, and what it does sits in a footer pinned under its one scroller, so however long the
// list above grows, the actions stay in sight (and in a thumb's reach on a phone: the owner's overlay rule, 18 Oct).
// Loaded with the panels that use it, never with the board.

import * as React from "react"
import { Drawer, DrawerContent, type SheetDetent } from "@/components/ui/drawer"
import { useSheetMode } from "@/components/ui/overlayMode"
import { Button } from "@/components/ui/button"
import { X } from "@/lib/icons"
import { cn } from "@/lib/utils/helpers/cn"

/** What a panel marks itself with (data-frames-panel, data-tag-filter): on the sheet, or on the panel. */
type Marks = { [mark: `data-${string}`]: string }

export function BoardSidePanel({
  name,
  closeLabel,
  count,
  footer,
  detent = "half",
  onClose,
  children,
  ...marks
}: {
  /** Its heading, and its name to a screen reader. */
  name: string
  /** The computer's close button's name ("Close frames"). A sheet closes by its grabber, its scrim or Escape. */
  closeLabel: string
  /** How many it lists, beside its name on a computer. */
  count?: number
  /**
   * Its actions, pinned under the scroller: told whether they're on a phone's sheet, where buttons are full-size.
   * Nothing given, or nothing returned, and there's no footer.
   */
  footer?: (sheet: boolean) => React.ReactNode
  /** The sheet's height: half for a long list, medium to fit what it holds. */
  detent?: SheetDetent
  onClose: () => void
  children: React.ReactNode
} & Marks) {
  const sheet = useSheetMode()
  const foot = footer?.(sheet)

  if (sheet) {
    return (
      <Drawer open onOpenChange={(o) => !o && onClose()} detent={detent}>
        <DrawerContent {...marks} header={<p className="text-heading text-ink">{name}</p>} footer={foot || undefined}>
          <div className={cn("px-2", foot ? "pb-2" : "pb-6")}>{children}</div>
        </DrawerContent>
      </Drawer>
    )
  }

  return (
    <aside
      aria-label={name}
      {...marks}
      data-board-chrome=""
      className="content-float pointer-events-auto absolute right-3 top-16 z-30 flex max-h-[calc(100%-9rem)] w-[300px] flex-col rounded-xl bg-pop shadow-e3"
    >
      <header className="flex h-11 shrink-0 items-center gap-2 border-b border-line pl-3.5 pr-1.5">
        <p className="flex-1 text-heading text-ink">{name}</p>
        {count !== undefined && count > 0 && <span className="text-meta tabular-nums text-ink-3">{count}</span>}
        <Button variant="ghost" size="icon" aria-label={closeLabel} onClick={onClose}>
          <X />
        </Button>
      </header>
      <div className={cn("min-h-0 flex-1 overflow-y-auto p-1.5", !foot && "pb-3")}>{children}</div>
      {foot && (
        <div data-board-panel-footer="" className="shrink-0 border-t border-line px-3 py-2.5">
          {foot}
        </div>
      )}
    </aside>
  )
}
