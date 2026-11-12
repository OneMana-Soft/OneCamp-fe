"use client"

import * as React from "react"

import { Drawer, DrawerContent } from "@/components/ui/drawer"
import { useSheetMode } from "@/components/ui/overlayMode"
import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from "@/components/ui/popover"

/**
 * A picker in a bar: a popover above it on a computer, a sheet on a phone. The
 * notes bar's colour, tags and clusters, and the facilitation bar's results.
 * Given an `anchor` in place of a `trigger`, the button stays the page's own
 * (the boards list's Project, whose picker loads on demand): the popover
 * hangs from it on `side`, its press toggles it, and closing gives it focus.
 * A `footer` holds the picker's actions: on a phone the sheet's pinned footer
 * (in a thumb's reach while the body scrolls, the house rule for phone
 * overlays), on a computer under what it holds.
 */
export function BarPicker({
  trigger,
  anchor,
  side = "top",
  title,
  children,
  open,
  onOpenChange,
  footer,
}: {
  trigger?: React.ReactElement
  anchor?: React.RefObject<HTMLElement | null>
  side?: "top" | "bottom"
  title: string
  children: React.ReactNode
  open: boolean
  onOpenChange: (o: boolean) => void
  footer?: React.ReactNode
}) {
  const sheet = useSheetMode()
  if (sheet) {
    return (
      <>
        {trigger ? React.cloneElement(trigger as React.ReactElement<{ onClick?: () => void }>, { onClick: () => onOpenChange(true) }) : null}
        <Drawer open={open} onOpenChange={onOpenChange} detent="medium">
          <DrawerContent header={<p className="text-heading text-ink">{title}</p>} footer={footer}>
            <div className="px-4 pb-6">{children}</div>
          </DrawerContent>
        </Drawer>
      </>
    )
  }
  const own = anchor
    ? {
        onInteractOutside: (e: Event) => void (anchor.current?.contains(e.target as Node) && e.preventDefault()),
        onCloseAutoFocus: (e: Event) => (e.preventDefault(), anchor.current?.focus()),
      }
    : {}
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      {trigger ? <PopoverTrigger asChild>{trigger}</PopoverTrigger> : <PopoverAnchor virtualRef={anchor as React.RefObject<HTMLElement>} />}
      <PopoverContent side={side} align={trigger ? "center" : "start"} sideOffset={trigger ? 10 : 6} className="content-float w-auto max-w-[320px] rounded-xl bg-pop p-3 shadow-e3" {...own}>
        <p className="mb-2 text-meta font-medium text-ink-3">{title}</p>
        {children}
        {footer ? <div className="mt-2">{footer}</div> : null}
      </PopoverContent>
    </Popover>
  )
}
