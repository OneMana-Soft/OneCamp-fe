"use client"

import * as React from "react"
import * as SheetPrimitive from "@radix-ui/react-dialog"
import { cva, type VariantProps } from "class-variance-authority"
import { X } from "@/lib/icons";

import { cn } from "@/lib/utils/helpers/cn"
import { ix } from "@/lib/ui/interactive"

const Sheet = SheetPrimitive.Root

const SheetTrigger = SheetPrimitive.Trigger

const SheetClose = SheetPrimitive.Close

const SheetPortal = SheetPrimitive.Portal

const SheetOverlay = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof SheetPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <SheetPrimitive.Overlay
    className={cn(
      // The dialog's dim (v3-overlay): no blur.
      "v3-overlay fixed inset-0 z-[var(--z-modal-backdrop)]",
      className
    )}
    {...props}
    ref={ref}
  />
))
SheetOverlay.displayName = SheetPrimitive.Overlay.displayName

const sheetVariants = cva(
  // Every side scrolls its own content. A sheet with more in it than the screen
  // can show used to clip the overflow with no way to reach it.
  //
  // dvh, not vh: on mobile Safari vh is measured as if the address bar were
  // hidden, so a 92vh sheet still runs under the bar when it is not.
  //
  // Design v3 (admin §8 H5): the --panel surface (#16171A in dark) at e4, no
  // border, with the dialog's footer (v3-dlg-footer bleeds through
  // --dlg-pad). The right sheet floats 8px off the viewport's top and bottom
  // with r16 on its left corners, 452px wide (560 with `wide`), and moves in
  // from 16px on the panel curve (v3-sheet in styles/admin/feedback.css); on
  // a phone it fills the screen. The other sides keep their slides.
  "v3-sheet fixed z-[var(--z-modal)] gap-4 overflow-y-auto overscroll-contain bg-panel px-5 pb-5 pt-3.5 shadow-e4",
  {
    variants: {
      side: {
        top: "inset-x-0 top-0 max-h-[92dvh] duration-200 ease-standard data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:slide-out-to-top data-[state=open]:slide-in-from-top",
        bottom:
          "inset-x-0 bottom-0 max-h-[92dvh] rounded-t-[16px] pb-[max(1.25rem,env(safe-area-inset-bottom))] duration-200 ease-standard data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom",
        left: "inset-y-0 left-0 h-full w-full sm:max-w-md duration-200 ease-standard data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left",
        right:
          "inset-y-0 right-0 w-full max-h-dvh sm:inset-y-2 sm:max-h-[calc(100dvh-1rem)] sm:max-w-[452px] sm:rounded-l-[16px]",
      },
      wide: {
        true: "",
        false: "",
      },
    },
    compoundVariants: [{ side: "right", wide: true, className: "sm:max-w-[560px]" }],
    defaultVariants: {
      side: "right",
      wide: false,
    },
  }
)

interface SheetContentProps
  extends React.ComponentPropsWithoutRef<typeof SheetPrimitive.Content>,
    VariantProps<typeof sheetVariants> {}

const SheetContent = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Content>,
  SheetContentProps
>(({ side = "right", wide = false, className, children, ...props }, ref) => (
  <SheetPortal>
    <SheetOverlay />
    <SheetPrimitive.Content
      ref={ref}
      data-side={side ?? "right"}
      className={cn(sheetVariants({ side, wide }), className)}
      {...props}
    >
      {children}
      <SheetPrimitive.Close
        className={cn(
          // A 28px ghost icon button, on the 52px header's centre line.
          "absolute right-3 top-3 inline-flex h-7 w-7 items-center justify-center rounded-md",
          "text-faint-foreground hover:text-foreground disabled:pointer-events-none",
        )}
        {...ix("icon")}
      >
        <X className="h-4 w-4" />
        <span className="sr-only">Close</span>
      </SheetPrimitive.Close>
    </SheetPrimitive.Content>
  </SheetPortal>
))
SheetContent.displayName = SheetPrimitive.Content.displayName

const SheetHeader = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      // The 52px header: the title's 24px line centred in it, clear of close.
      "flex min-h-7 flex-col justify-center gap-1 pr-8 text-left",
      className
    )}
    {...props}
  />
)
SheetHeader.displayName = "SheetHeader"

/** The dialog's footer: 60px on --sunken, a hairline on top, edge to edge at the sheet's foot. */
const SheetFooter = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    data-sheet-footer=""
    className={cn(
      "v3-dlg-footer flex flex-col-reverse gap-2 sm:flex-row sm:justify-end",
      className
    )}
    {...props}
  />
)
SheetFooter.displayName = "SheetFooter"

const SheetTitle = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof SheetPrimitive.Title>
>(({ className, ...props }, ref) => (
  <SheetPrimitive.Title
    ref={ref}
    // title-3 (17/24 590), joined by hand: cn() drops it beside a colour.
    className={cn("font-semibold text-foreground text-balance", className) + (/(?:^|\s)text-(?:xs|sm|base|lg|xl|\dxl|body|heading|title-[123])(?:\s|$)/.test(className ?? "") ? "" : " text-title-3")}
    {...props}
  />
))
SheetTitle.displayName = SheetPrimitive.Title.displayName

const SheetDescription = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof SheetPrimitive.Description>
>(({ className, ...props }, ref) => (
  <SheetPrimitive.Description
    ref={ref}
    className={cn("text-sm text-muted-foreground", className)}
    {...props}
  />
))
SheetDescription.displayName = SheetPrimitive.Description.displayName

export {
  Sheet,
  SheetPortal,
  SheetOverlay,
  SheetTrigger,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetFooter,
  SheetTitle,
  SheetDescription,
}
