"use client"

import * as React from "react"
import { Drawer as DrawerPrimitive } from "vaul"

import { cn } from "@/lib/utils/helpers/cn"

const Drawer = ({
  shouldScaleBackground = true,
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.Root>) => (
  <DrawerPrimitive.Root
    shouldScaleBackground={shouldScaleBackground}
    {...props}
  />
)
Drawer.displayName = "Drawer"

const DrawerTrigger = DrawerPrimitive.Trigger

const DrawerPortal = DrawerPrimitive.Portal

const DrawerClose = DrawerPrimitive.Close

const DrawerOverlay = React.forwardRef<
  React.ElementRef<typeof DrawerPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DrawerPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DrawerPrimitive.Overlay
    ref={ref}
    className={cn("fixed inset-0 z-[var(--z-modal-backdrop)] bg-black/80", className)}
    {...props}
  />
))
DrawerOverlay.displayName = DrawerPrimitive.Overlay.displayName

const DrawerContent = React.forwardRef<
  React.ElementRef<typeof DrawerPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DrawerPrimitive.Content>
>(({ className, children, ...props }, ref) => (
  <DrawerPortal>
    <DrawerOverlay />
    <DrawerPrimitive.Content
      ref={ref}
      className={cn(
        "fixed inset-x-0 bottom-0 z-[var(--z-modal)] flex h-auto flex-col rounded-t-[10px] border bg-background",
        // A sheet taller than the screen used to grow off the top of it.
        //
        // The element is fixed to the bottom with an automatic height, so
        // `mt-24` never applied: margin does nothing to a fixed box with no
        // top. Content simply extended past the top edge and was clipped, and
        // the rows up there could not be reached by any gesture. The More menu
        // is the one people meet, because it is the longest, but only three of
        // the twenty-nine drawers handled their own height and none capped it,
        // so this was every drawer on a short screen.
        //
        // dvh, not vh: on mobile Safari `vh` is the tall viewport, measured as
        // if the address bar were hidden, so a 92vh sheet still runs under the
        // bar when it is not.
        "max-h-[92dvh]",
        // Reserve the home-indicator strip. layout.tsx sets viewportFit:"cover",
        // so a `bottom-0` sheet genuinely extends under it, and the OS owns the
        // bottom ~34px for its swipe gesture. Without this the last row of every
        // drawer (Apply/Clear in the filter drawers, the last option in every
        // options drawer) sits where the system swipe wins and the tap opens the
        // app switcher instead. One line here covers all the drawers.
        "pb-[env(safe-area-inset-bottom)]",
        className
      )}
      {...props}
    >
      {/* The handle stays put; the content below it scrolls. A drawer whose
          own body already scrolls keeps doing so and this never engages.
          overscroll-contain stops a flick at the end of the list from
          scrolling the page underneath the sheet. */}
      <div className="mx-auto mt-4 h-2 w-[100px] shrink-0 rounded-full bg-muted" />
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain">
        {children}
      </div>
    </DrawerPrimitive.Content>
  </DrawerPortal>
))
DrawerContent.displayName = "DrawerContent"

const DrawerHeader = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn("grid gap-1.5 p-4 text-center sm:text-left", className)}
    {...props}
  />
)
DrawerHeader.displayName = "DrawerHeader"

const DrawerFooter = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn("mt-auto flex flex-col gap-2 p-4", className)}
    {...props}
  />
)
DrawerFooter.displayName = "DrawerFooter"

const DrawerTitle = React.forwardRef<
  React.ElementRef<typeof DrawerPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DrawerPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DrawerPrimitive.Title
    ref={ref}
    className={cn(
      "text-lg font-semibold leading-none tracking-tight",
      className
    )}
    {...props}
  />
))
DrawerTitle.displayName = DrawerPrimitive.Title.displayName

const DrawerDescription = React.forwardRef<
  React.ElementRef<typeof DrawerPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DrawerPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DrawerPrimitive.Description
    ref={ref}
    className={cn("text-sm text-muted-foreground", className)}
    {...props}
  />
))
DrawerDescription.displayName = DrawerPrimitive.Description.displayName

export {
  Drawer,
  DrawerPortal,
  DrawerOverlay,
  DrawerTrigger,
  DrawerClose,
  DrawerContent,
  DrawerHeader,
  DrawerFooter,
  DrawerTitle,
  DrawerDescription,
}
