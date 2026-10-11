"use client"

import * as React from "react"

import { Popover, PopoverAnchor, PopoverTrigger } from "@/components/ui/popover"

/**
 * A grid cell's popover, mounted only once it is first opened.
 *
 * A grid of 1,000 rows mounts a window of rows as it scrolls, and every
 * select, date, relation and error cell in it carried a whole Radix popover
 * (root, provider, trigger, portal and presence) while closed: about 1,300
 * popovers mounted per scroll through the Launch budget, which held a 4x
 * slowed CPU under 30 frames a second. Until the cell is opened it renders
 * only its trigger; the first click (or Enter on it) mounts the popover open,
 * and from then on it stays mounted, so closing and reopening is the usual
 * Radix behaviour, focus return included.
 *
 * `anchor` uses PopoverAnchor instead of PopoverTrigger, for a popover opened
 * by hover or focus (a formula's error) rather than by a click.
 */
export function LazyPopover({
  open,
  onOpenChange,
  trigger,
  anchor = false,
  children,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  trigger: React.ReactElement<{ onClick?: (e: React.MouseEvent) => void }>
  anchor?: boolean
  children: React.ReactNode
}) {
  const [armed, setArmed] = React.useState(false)
  React.useEffect(() => {
    if (open) setArmed(true)
  }, [open])

  if (!armed && !open) {
    if (anchor) return trigger
    return React.cloneElement(trigger, {
      onClick: (e: React.MouseEvent) => {
        trigger.props.onClick?.(e)
        if (e.defaultPrevented) return
        setArmed(true)
        onOpenChange(true)
      },
    })
  }
  const Part = anchor ? PopoverAnchor : PopoverTrigger
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <Part asChild>{trigger}</Part>
      {children}
    </Popover>
  )
}
