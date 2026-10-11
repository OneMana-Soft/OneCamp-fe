"use client"

import * as React from "react"
import { Drawer as DrawerPrimitive } from "vaul"

import { cn } from "@/lib/utils/helpers/cn"

/**
 * The phone's sheet (design v3, mobile C5). Every sheet declares how tall it
 * is, which is also how it behaves:
 *
 *   menu    as tall as its content, at most 60dvh, no grabber: an options
 *           menu (channel, doc, task, calendar options). It dims the page.
 *   medium  as tall as its content, at most 92dvh, with the grabber: most
 *           sheets. It dims the page.
 *   large   92dvh, with the grabber, and the page behind steps back as a card
 *           (scaled to .94, rounded, dimmed; vaul scales
 *           [data-vaul-drawer-wrapper], the phone's viewport, and app/phone.css
 *           rounds and dims it): the More sheet, a picker, filters.
 *
 * The surface is the pop step at r20 (top corners) and e4, no border, over a
 * scrim of 32% ink (55% black in dark). It rises in 420ms and goes in 300ms on
 * the iOS sheet curve (app/phone.css).
 */
export type SheetDetent = "menu" | "medium" | "large"

const DetentContext = React.createContext<SheetDetent>("medium")

const Drawer = ({
  detent = "medium",
  shouldScaleBackground,
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.Root> & { detent?: SheetDetent }) => (
  <DetentContext.Provider value={detent}>
    <DrawerPrimitive.Root
      shouldScaleBackground={shouldScaleBackground ?? detent === "large"}
      {...props}
    />
  </DetentContext.Provider>
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
    data-v3-scrim=""
    className={cn("fixed inset-0 z-[var(--z-modal-backdrop)] bg-[rgb(10_11_14/0.32)] dark:bg-[rgb(0_0_0/0.55)]", className)}
    {...props}
  />
))
DrawerOverlay.displayName = DrawerPrimitive.Overlay.displayName

/** How tall each detent may be. dvh, never vh (see below). */
const DETENT_HEIGHT: Record<SheetDetent, string> = {
  menu: "max-h-[60dvh]",
  medium: "max-h-[92dvh]",
  large: "h-[92dvh] max-h-[92dvh]",
}

const DrawerContent = React.forwardRef<
  React.ElementRef<typeof DrawerPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DrawerPrimitive.Content> & {
    /** The scrim's look, for a sheet that asks for its own. */
    overlayClassName?: string
    /** The grabber's look. */
    handleClassName?: string
  }
>(({ className, children, overlayClassName, handleClassName, ...props }, ref) => {
  const detent = React.useContext(DetentContext)
  return (
    <DrawerPortal>
      <DrawerOverlay className={overlayClassName} />
      <DrawerPrimitive.Content
        ref={ref}
        data-v3-sheet=""
        data-detent={detent}
        className={cn(
          // The pop surface at e4, no border; the r20 top corners are
          // app/phone.css's ([data-v3-sheet]), the sheet step.
          "fixed inset-x-0 bottom-0 z-[var(--z-modal)] flex h-auto flex-col bg-pop shadow-e4",
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
          DETENT_HEIGHT[detent],
          // Reserve the home-indicator strip. layout.tsx sets viewportFit:"cover",
          // so a `bottom-0` sheet genuinely extends under it, and the OS owns the
          // bottom ~34px for its swipe gesture. Without this the last row of every
          // drawer (Apply/Clear in the filter drawers, the last option in every
          // options drawer) sits where the system swipe wins and the tap opens the
          // app switcher instead. One line here covers all the drawers.
          "pb-[env(safe-area-inset-bottom)]",
          // A menu has no grabber; its first group starts 8px down.
          detent === "menu" && "pt-2",
          className
        )}
        {...props}
      >
        {/* The grabber, on a sheet that can be dragged taller or away: 36x5 in
            line-3, 6px from the top. It stays put; the content below it
            scrolls. A drawer whose own body already scrolls keeps doing so and
            this never engages. overscroll-contain stops a flick at the end of
            the list from scrolling the page underneath the sheet. */}
        {detent !== "menu" && (
          <div aria-hidden="true" data-drawer-handle="" data-v3-grabber="" className={cn("mx-auto mt-1.5 mb-1 shrink-0", handleClassName)} />
        )}
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain">
          {children}
        </div>
      </DrawerPrimitive.Content>
    </DrawerPortal>
  )
})
DrawerContent.displayName = "DrawerContent"

/**
 * A group of a sheet's rows (design v3, mobile C7): an r14 card on the sheet,
 * iOS's inset-grouped look, so a menu reads as a tray of cards and not a list
 * on a slab. A menu has at most three: what is used most, what manages, and
 * what destroys, which is alone and last.
 */
const SheetGroup = ({ className, label, ...props }: React.HTMLAttributes<HTMLDivElement> & { label?: string }) => (
  <div role="group" aria-label={label} data-sheet-group="" className={cn("sheet-group", className)} {...props} />
)
SheetGroup.displayName = "SheetGroup"

/** The Cancel card under a menu's groups: a thumb's-reach way out (iOS's action sheet). */
const SheetCancel = ({ label = "Cancel", className }: { label?: string; className?: string }) => (
  <DrawerPrimitive.Close asChild>
    <button type="button" data-sheet-cancel="" data-press="row" className={cn("sheet-cancel mb-2", className)}>
      {label}
    </button>
  </DrawerPrimitive.Close>
)
SheetCancel.displayName = "SheetCancel"

const DrawerHeader = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn("grid gap-1.5 p-4 text-left", className)}
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
      "text-lg font-semibold leading-tight text-balance",
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
  SheetGroup,
  SheetCancel,
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
