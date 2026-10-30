"use client"

import * as React from "react"

import { Drawer, DrawerContent } from "@/components/ui/drawer"
import { useSheetMode } from "@/components/ui/overlayMode"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"

/**
 * A picker in a bar: a popover above it on a computer, a sheet on a phone. The
 * notes bar's colour, tags and clusters, and the facilitation bar's results.
 */
export function BarPicker({ trigger, title, children, open, onOpenChange }: { trigger: React.ReactElement; title: string; children: React.ReactNode; open: boolean; onOpenChange: (o: boolean) => void }) {
  const sheet = useSheetMode()
  if (sheet) {
    return (
      <>
        {React.cloneElement(trigger as React.ReactElement<{ onClick?: () => void }>, { onClick: () => onOpenChange(true) })}
        <Drawer open={open} onOpenChange={onOpenChange} detent="medium">
          <DrawerContent header={<p className="text-heading text-ink">{title}</p>}>
            <div className="px-4 pb-6">{children}</div>
          </DrawerContent>
        </Drawer>
      </>
    )
  }
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent side="top" align="center" sideOffset={10} className="content-float w-auto max-w-[320px] rounded-xl bg-pop p-3 shadow-e3">
        <p className="mb-2 text-meta font-medium text-ink-3">{title}</p>
        {children}
      </PopoverContent>
    </Popover>
  )
}
