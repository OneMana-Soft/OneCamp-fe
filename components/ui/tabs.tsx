"use client"

import * as React from "react"
import * as TabsPrimitive from "@radix-ui/react-tabs"

import { cn } from "@/lib/utils/helpers/cn"
import { ix, withLabel } from "@/lib/ui/interactive"

const Tabs = TabsPrimitive.Root

/** A segment well (default), or underline tabs: the open one in ink over a 2px rule (design v3). */
type TabsShape = "segment" | "underline"
const Shape = React.createContext<TabsShape>("segment")

const underlineTabsList = "flex w-full items-center justify-start gap-0.5 h-10 rounded-none border-b border-line bg-transparent p-0 overflow-x-auto no-scrollbar"
const underlineTab = "relative inline-flex h-7 shrink-0 items-center justify-center self-center gap-[7px] whitespace-nowrap rounded-md px-2.5 text-xs font-normal text-muted-foreground hover:text-foreground [&_svg]:size-3.5 [&_svg]:text-faint-foreground after:absolute after:inset-x-2 after:-bottom-[5.5px] after:h-0.5 after:rounded-full after:bg-transparent data-[state=active]:text-foreground data-[state=active]:after:bg-foreground"

const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List> & { variant?: TabsShape }
>(({ className, variant = "segment", ...props }, ref) => (
  <Shape.Provider value={variant}>
    <TabsPrimitive.List
      ref={ref}
      data-segmented={variant === "segment" ? "" : undefined}
      className={cn(
        variant === "underline" ? underlineTabsList : "inline-flex h-8 items-center justify-center rounded-md bg-hover p-0.5 text-muted-foreground",
        className
      )}
      {...props}
    />
  </Shape.Provider>
))
TabsList.displayName = TabsPrimitive.List.displayName

const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, children, ...props }, ref) => {
  const shape = React.useContext(Shape)
  return (
    <TabsPrimitive.Trigger
      ref={ref}
      className={cn(
        shape === "underline"
          ? underlineTab
          : "inline-flex h-full items-center justify-center gap-1.5 whitespace-nowrap rounded-sm px-2.5 text-xs font-medium hover:text-foreground data-[state=active]:text-foreground",
        className
      )}
      // A finger's target is 44px (app/phone.css F3).
      data-touch-target=""
      {...ix("tab")}
      {...props}
    >
      {withLabel(children)}
    </TabsPrimitive.Trigger>
  )
})
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName

const TabsContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content ref={ref} className={cn("mt-2", className)} {...props} />
))
TabsContent.displayName = TabsPrimitive.Content.displayName

export { Tabs, TabsList, TabsTrigger, TabsContent, underlineTabsList, underlineTab }
