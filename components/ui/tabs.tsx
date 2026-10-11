"use client"

import * as React from "react"
import * as TabsPrimitive from "@radix-ui/react-tabs"

import { cn } from "@/lib/utils/helpers/cn"

const Tabs = TabsPrimitive.Root

const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    className={cn(
      "inline-flex h-8 items-center justify-center rounded-md bg-hover p-0.5 text-muted-foreground",
      className
    )}
    {...props}
  />
))
TabsList.displayName = TabsPrimitive.List.displayName

const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn(
      // A segment (design v3): the active one is the raised surface at e1 on
      // the hover overlay, concentric (r6 inside the r8 track's 2px), so it
      // reads as picked in both themes without a border.
      "inline-flex h-full items-center justify-center gap-1.5 whitespace-nowrap rounded-sm px-2.5 text-xs font-medium transition-[color,background-color,box-shadow] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-raised data-[state=active]:text-foreground data-[state=active]:shadow-e1",
      className
    )}
    {...props}
  />
))
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName

const TabsContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    className={cn(
      "mt-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70",
      className
    )}
    {...props}
  />
))
TabsContent.displayName = TabsPrimitive.Content.displayName

/**
 * A page's view tabs (List, Board, Timeline...) as design v3 draws them: a
 * 40px row on a hairline, 13px ink-2 labels with ink-3 icons, and the open
 * tab in ink at 510 with its icon in ink over a 2px ink rule, rounded and
 * inset 8px. Pass these to TabsList and TabsTrigger.
 */
const underlineTabsList = "w-full justify-start gap-0.5 h-10 rounded-none border-b border-line bg-transparent p-0 overflow-x-auto no-scrollbar"
const underlineTab = "relative h-full gap-[7px] rounded-none bg-transparent px-2.5 text-xs font-normal text-muted-foreground shadow-none hover:text-foreground [&_svg]:size-3.5 [&_svg]:text-faint-foreground after:absolute after:inset-x-2 after:-bottom-px after:h-0.5 after:rounded-full after:bg-transparent data-[state=active]:bg-transparent data-[state=active]:font-medium data-[state=active]:text-foreground data-[state=active]:shadow-none data-[state=active]:after:bg-foreground data-[state=active]:[&_svg]:text-foreground"

export { Tabs, TabsList, TabsTrigger, TabsContent, underlineTabsList, underlineTab }
