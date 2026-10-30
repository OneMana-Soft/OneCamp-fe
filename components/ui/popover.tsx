"use client"

import * as React from "react"
import * as PopoverPrimitive from "@radix-ui/react-popover"

import { cn } from "@/lib/utils/helpers/cn"
import { useFloatRef } from "@/components/ui/floatMark"

const Popover = PopoverPrimitive.Root

const PopoverTrigger = PopoverPrimitive.Trigger

const PopoverAnchor = PopoverPrimitive.Anchor

type PopoverContentProps = React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Content> & {
  container?: HTMLElement
  portalled?: boolean
}

/**
 * How far a popover keeps from an edge of the window it would touch, unless
 * its caller says otherwise: no floating panel touches the window's edge
 * (design review, 29 Oct 2026; cellPickers kept 16 px already).
 */
export const EDGE_PX = 16

// data-overlay: components/ui/overlay; a sheet on a phone (app/overlay.css 8).
// At most the room the window leaves it (Radix's available height, short of
// the window's edge by the collision padding), and what is more scrolls inside
// it: View options with Your week ran off a 1280x720 laptop's window with its
// last actions (V-43b). A root that holds an overlay body is a column with its
// footer in view instead (app/overlay.css 1). A caller's own height, overflow
// or collisionPadding wins.
const PopoverContent = React.forwardRef<
  React.ElementRef<typeof PopoverPrimitive.Content>,
  PopoverContentProps
>(({ className, align = "center", sideOffset = 4, collisionPadding = EDGE_PX, container, portalled = true, ...props }, ref) => {
  const content = (
    <PopoverPrimitive.Content
      ref={useFloatRef(ref)}
      align={align}
      sideOffset={sideOffset}
      collisionPadding={collisionPadding}
      data-overlay="float"
      className={cn(
        "z-[var(--z-popover)] w-72 max-h-[var(--radix-popover-content-available-height)] overflow-y-auto overscroll-contain rounded-lg bg-popover p-4 text-popover-foreground shadow-overlay outline-none pointer-events-auto duration-[180ms] ease-out data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[side=bottom]:slide-in-from-top-1 data-[side=left]:slide-in-from-right-1 data-[side=right]:slide-in-from-left-1 data-[side=top]:slide-in-from-bottom-1 origin-[--radix-popover-content-transform-origin]",
        className
      )}
      {...props}
    />
  )

  if (portalled) {
    return (
      <PopoverPrimitive.Portal container={container}>
        {content}
      </PopoverPrimitive.Portal>
    )
  }

  return content
})
PopoverContent.displayName = PopoverPrimitive.Content.displayName

export { Popover, PopoverTrigger, PopoverContent, PopoverAnchor }
