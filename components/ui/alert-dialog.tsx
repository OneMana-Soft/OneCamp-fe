"use client"

import * as React from "react"
import * as AlertDialogPrimitive from "@radix-ui/react-alert-dialog"

import { cn } from "@/lib/utils/helpers/cn"
import { Button } from "@/components/ui/button"
import { useSheetMode } from "@/components/ui/overlayMode"

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
      "v3-overlay fixed inset-0 z-[var(--z-confirm)]",
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
>(({ className, ...props }, ref) => {
  // On a phone the confirm is a sheet (owner, 18 Oct), and still Radix's
  // alert dialog: its role, the first focus on Cancel, no closing on a tap
  // outside. Its rise and fall are app/phone.css's (C5d).
  const sheet = useSheetMode()
  return (
    <AlertDialogPortal>
      <AlertDialogOverlay data-v3-scrim={sheet ? "" : undefined} />
      <AlertDialogPrimitive.Content
        ref={ref}
        data-v3-sheet={sheet ? "" : undefined}
        className={
          sheet
            ? // The sheet's surface, the pop at e4, laid on the bottom edge by
              // app/phone.css C5d as every dialog's sheet is. It is its one
              // scroller, with nothing under the pinned footer, which keeps
              // the home-indicator strip. A caller's classes size a dialog,
              // so they stay off.
              "v3-dialog v3-confirm v3-confirm-sheet fixed z-[var(--z-confirm)] flex flex-col gap-4 overflow-y-auto overscroll-contain bg-pop px-5 pt-5 shadow-e4"
            : cn(
                // The dialog's surface and motion (design v3, admin §8 H3):
                // --pop, r16, e4, no border, at the small width (400). Radix
                // puts the first focus on Cancel, the safe default for a
                // destructive question.
                "v3-dialog v3-confirm fixed inset-0 m-auto h-fit z-[var(--z-confirm)] grid w-[calc(100%-2rem)] max-w-[400px] max-h-[85dvh] overflow-y-auto overscroll-contain gap-4 rounded-[16px] bg-pop p-5 shadow-e4",
                className
              )
        }
        {...props}
      />
    </AlertDialogPortal>
  )
})
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
}: React.HTMLAttributes<HTMLDivElement>) => {
  const sheet = useSheetMode()
  return (
    <div
      data-sheet-footer={sheet ? "" : undefined}
      className={cn(
        sheet
          ? // The sheet's footer, pinned to its foot over the home-indicator
            // strip while the rest scrolls under it (and fades there,
            // [data-sheet-footer] in app/phone.css): the actions at the
            // sheet's width and 44px tall, the action over Cancel, which comes
            // last, as an action sheet's Cancel card does. Its foot is every
            // phone sheet's (app/overlay.css 8b): its 20px gutter, or the strip.
            "v3-alert-footer sticky bottom-0 z-[1] -mx-5 mt-1 flex flex-col-reverse gap-2 bg-pop px-5 pt-3 [&>*]:min-h-11"
          : // No sunken strip in a confirm (it is small): the buttons
            // right-aligned. v3-alert-footer: 44px buttons on a phone
            // (styles/admin/feedback.css).
            "v3-alert-footer mt-1 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end",
        className
      )}
      {...props}
    />
  )
}
AlertDialogFooter.displayName = "AlertDialogFooter"

const AlertDialogTitle = React.forwardRef<
  React.ElementRef<typeof AlertDialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <AlertDialogPrimitive.Title
    ref={ref}
    // title-3, 17/24 590, joined by hand (cn() drops it beside a colour);
    // balanced as DialogTitle is.
    className={cn("font-semibold [text-wrap-style:balance]", className) + (/(?:^|\s)text-(?:xs|sm|base|lg|xl|\dxl|body|heading|title-[123])(?:\s|$)/.test(className ?? "") ? "" : " text-title-3")}
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
    className={cn("text-sm text-muted-foreground text-pretty", className)}
    {...props}
  />
))
AlertDialogDescription.displayName =
  AlertDialogPrimitive.Description.displayName

type ConfirmButtonProps = Pick<React.ComponentProps<typeof Button>, "variant" | "size">

/**
 * Danger-solid (design v3, admin §8 H3): the one solid danger button, for the
 * action of a confirm that destroys. The --destructive fill on the primary's
 * elevation stack mixed from danger (btn-danger-solid, styles/admin/
 * feedback.css), its label the fill's foreground: white in light, dark ink in
 * dark, where white on the lifted red was 3.9:1. Drawn on a Button with no
 * variant of its own, so it darkens under the pointer as the primary does.
 */
const DANGER_SOLID = "btn-danger-solid bg-destructive text-destructive-foreground"

/**
 * The confirm's action: a Button (shadcn's), so it has the interaction layer,
 * the press and a finger's target. variant="dangerSolid" for a confirm that
 * destroys; the brand's otherwise.
 */
const AlertDialogAction = React.forwardRef<
  React.ElementRef<typeof AlertDialogPrimitive.Action>,
  React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Action> & Omit<ConfirmButtonProps, "variant"> & { variant?: ConfirmButtonProps["variant"] | "dangerSolid" }
>(({ className, variant = "default", size, ...props }, ref) => (
  <Button asChild variant={variant === "dangerSolid" ? null : variant} size={size} className={cn(variant === "dangerSolid" && DANGER_SOLID, className)}>
    <AlertDialogPrimitive.Action ref={ref} data-slot="alert-dialog-action" {...props} />
  </Button>
))
AlertDialogAction.displayName = AlertDialogPrimitive.Action.displayName

/** The confirm's way out: a secondary Button. */
const AlertDialogCancel = React.forwardRef<
  React.ElementRef<typeof AlertDialogPrimitive.Cancel>,
  React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Cancel> & ConfirmButtonProps
>(({ className, variant = "secondary", size, ...props }, ref) => (
  <Button asChild variant={variant} size={size} className={className}>
    <AlertDialogPrimitive.Cancel ref={ref} data-slot="alert-dialog-cancel" {...props} />
  </Button>
))
AlertDialogCancel.displayName = AlertDialogPrimitive.Cancel.displayName


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
