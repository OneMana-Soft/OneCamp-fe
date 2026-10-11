"use client"

import * as React from "react"
import * as AlertDialogPrimitive from "@radix-ui/react-alert-dialog"

import { cn } from "@/lib/utils/helpers/cn"
import { buttonVariants } from "@/components/ui/button"

const AlertDialog = AlertDialogPrimitive.Root

const AlertDialogTrigger = AlertDialogPrimitive.Trigger

const AlertDialogPortal = AlertDialogPrimitive.Portal

const AlertDialogOverlay = React.forwardRef<
  React.ElementRef<typeof AlertDialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <AlertDialogPrimitive.Overlay
    className={cn(
      // The dialog's dim (v3-overlay): no blur, 180ms in, 150ms out.
      "v3-overlay fixed inset-0 z-[var(--z-modal-backdrop)]",
      className
    )}
    {...props}
    ref={ref}
  />
))
AlertDialogOverlay.displayName = AlertDialogPrimitive.Overlay.displayName

const AlertDialogContent = React.forwardRef<
  React.ElementRef<typeof AlertDialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Content>
>(({ className, ...props }, ref) => (
  <AlertDialogPortal>
    <AlertDialogOverlay />
    <AlertDialogPrimitive.Content
      ref={ref}
      className={cn(
        // The dialog's surface and motion (design v3, admin §8 H3): --pop,
        // r16, e4, no border, at the small width (400). Radix puts the first
        // focus on Cancel, the safe default for a destructive question.
        "v3-dialog v3-confirm fixed left-[50%] top-[50%] z-[var(--z-modal)] grid w-[calc(100%-2rem)] max-w-[400px] max-h-[85dvh] overflow-y-auto overscroll-contain translate-x-[-50%] translate-y-[-50%] gap-4 rounded-[16px] bg-pop p-5 shadow-e4",
        className
      )}
      {...props}
    />
  </AlertDialogPortal>
))
AlertDialogContent.displayName = AlertDialogPrimitive.Content.displayName

const AlertDialogHeader = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      // The description 4px under the title.
      "flex flex-col gap-1 text-left",
      className
    )}
    {...props}
  />
)
AlertDialogHeader.displayName = "AlertDialogHeader"

const AlertDialogFooter = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      // No sunken strip in a confirm (it is small): the buttons right-aligned.
      "mt-1 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end",
      className
    )}
    {...props}
  />
)
AlertDialogFooter.displayName = "AlertDialogFooter"

const AlertDialogTitle = React.forwardRef<
  React.ElementRef<typeof AlertDialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <AlertDialogPrimitive.Title
    ref={ref}
    // title-3, 17/24 590, joined by hand (cn() drops it beside a colour).
    className={cn("font-semibold text-balance", className) + (/(?:^|\s)text-(?:xs|sm|base|lg|xl|\dxl|body|heading|title-[123])(?:\s|$)/.test(className ?? "") ? "" : " text-title-3")}
    {...props}
  />
))
AlertDialogTitle.displayName = AlertDialogPrimitive.Title.displayName

const AlertDialogDescription = React.forwardRef<
  React.ElementRef<typeof AlertDialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <AlertDialogPrimitive.Description
    ref={ref}
    className={cn("text-sm text-muted-foreground", className)}
    {...props}
  />
))
AlertDialogDescription.displayName =
  AlertDialogPrimitive.Description.displayName

const AlertDialogAction = React.forwardRef<
  React.ElementRef<typeof AlertDialogPrimitive.Action>,
  React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Action>
>(({ className, ...props }, ref) => (
  <AlertDialogPrimitive.Action
    ref={ref}
    className={cn(buttonVariants(), className)}
    {...props}
  />
))
AlertDialogAction.displayName = AlertDialogPrimitive.Action.displayName

const AlertDialogCancel = React.forwardRef<
  React.ElementRef<typeof AlertDialogPrimitive.Cancel>,
  React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Cancel>
>(({ className, ...props }, ref) => (
  <AlertDialogPrimitive.Cancel
    ref={ref}
    className={cn(
      buttonVariants({ variant: "secondary" }),
      className
    )}
    {...props}
  />
))
AlertDialogCancel.displayName = AlertDialogPrimitive.Cancel.displayName

/**
 * Danger-solid (design v3, admin §8 H3): the --destructive fill, white text and
 * the primary's elevation stack mixed from danger (btn-danger-solid in
 * styles/admin/feedback.css). The one solid danger button in the app, for the
 * action of a confirm that destroys. No variant is asked of buttonVariants, so
 * nothing else sets the fill.
 */
const dangerSolidClass = cn(
  buttonVariants({ variant: null }),
  "btn-danger-solid bg-destructive text-white hover:bg-[color-mix(in_oklab,var(--destructive)_90%,black)]",
)

/**
 * The 40px r12 tile on top of a confirm: the danger tint and glyph for one
 * that destroys, a neutral sunken square otherwise. Its glyph pops 80ms after
 * the dialog opens.
 */
const AlertDialogTile = ({
  className,
  tone = "neutral",
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { tone?: "neutral" | "danger" }) => (
  <span
    aria-hidden="true"
    data-confirm-tile={tone}
    className={cn(
      "v3-confirm-tile inline-flex size-10 shrink-0 items-center justify-center rounded-lg [&>svg]:size-5",
      tone === "danger"
        ? "bg-[color-mix(in_oklab,var(--destructive)_10%,transparent)] text-danger-ink"
        : "bg-sunken text-faint-foreground ring-1 ring-inset ring-line",
      className,
    )}
    {...props}
  />
)
AlertDialogTile.displayName = "AlertDialogTile"

export {
  AlertDialogTile,
  dangerSolidClass,
  AlertDialog,
  AlertDialogPortal,
  AlertDialogOverlay,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
}
