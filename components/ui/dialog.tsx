"use client"

import * as React from "react"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import { X } from "@/lib/icons";

import { cn } from "@/lib/utils/helpers/cn"

const Dialog = DialogPrimitive.Root

const DialogTrigger = DialogPrimitive.Trigger

const DialogPortal = DialogPrimitive.Portal

const DialogClose = DialogPrimitive.Close

const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      // Fixed dark backdrop in both themes. Inverting via tokens (foreground/X)
      // would flip to a white veil in dark mode, which is wrong for a modal
      // backdrop — the purpose is to dim, not invert.
      "fixed inset-0 z-[var(--z-modal-backdrop)] bg-black/50 duration-200 ease-standard data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
      className
    )}
    {...props}
  />
))
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName

/**
 * Where focus lands when a dialog opens: the first field a person can type
 * in, if there is one. Radix's own default is the first tabbable element,
 * which in a dialog whose header carries an action, or whose only fields come
 * after a button row, was a button, often the filled primary one. That reads
 * as "about to submit", and Enter would do it. A field says "type here".
 * Without a field, or on a touch screen, Radix's default stands. A caller's onOpenAutoFocus runs
 * first and wins by calling preventDefault (to focus something else).
 *
 * A field is something typed in and seen. A file, range or colour input is
 * picked rather than typed in, and a hidden one has nowhere to show focus: the
 * profile dialog's hidden photo input came first, took the focus, and the
 * dialog opened with focus nowhere a person could see it.
 */
const FIRST_FIELD =
  'input:not([type="hidden"]):not([type="button"]):not([type="submit"]):not([type="reset"]):not([type="checkbox"]):not([type="radio"]):not([type="file"]):not([type="range"]):not([type="color"]):not([type="image"]):not([disabled]):not([readonly]), textarea:not([disabled]):not([readonly]), select:not([disabled]), [contenteditable="true"]'

/** The first field in the dialog a person can see and type in, if any. */
function firstVisibleField(content: HTMLElement): HTMLElement | null {
  for (const field of Array.from(content.querySelectorAll<HTMLElement>(FIRST_FIELD))) {
    // Disabled by a fieldset around it, or hidden. display: none, on the field
    // or on anything around it, leaves it no boxes at all.
    if (field.matches(":disabled") || field.closest("[hidden], [inert]")) continue
    if (field.getClientRects().length > 0) return field
  }
  return null
}

function focusFirstField(event: Event) {
  // Desktop only (web-design-guidelines: autoFocus sparingly, avoid on
  // mobile): on a touch screen, focusing a field throws up the keyboard over
  // the dialog before the person has read it.
  if (typeof window === "undefined" || !window.matchMedia?.("(pointer: fine)").matches) return
  // Radix dispatches this event on the content element itself.
  const content = event.target instanceof HTMLElement ? event.target : null
  const field = content && firstVisibleField(content)
  if (!field) return
  field.focus({ preventScroll: true })
  // Radix's default (the first tabbable element) stands unless the focus is
  // now really on the field.
  if (field.ownerDocument.activeElement === field) event.preventDefault()
}

const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>
>(({ className, children, onOpenAutoFocus, ...props }, ref) => (
  <DialogPortal>
    <DialogOverlay />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(
        // Fade only, no scale (motion confirms a state change; it does not
        // perform). On a phone the dialog keeps a 16px gutter and its 14px
        // corners instead of running edge to edge with square ones: a sheet
        // that touches both sides of the screen reads as a new page, not as a
        // question asked over this one. overscroll-contain stops a long form's
        // last flick from scrolling the page underneath.
        "fixed left-[50%] top-[50%] z-[var(--z-modal)] grid w-[calc(100%-2rem)] max-w-lg max-h-[85dvh] overflow-y-auto overscroll-contain translate-x-[-50%] translate-y-[-50%] gap-4 rounded-2xl border border-border bg-background p-6 shadow-dialog duration-200 ease-standard data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
        className
      )}
      onOpenAutoFocus={(event) => {
        onOpenAutoFocus?.(event)
        if (!event.defaultPrevented) focusFirstField(event)
      }}
      {...props}
    >
      {children}
      <DialogPrimitive.Close
        className={cn(
          "absolute right-3 top-3 inline-flex h-8 w-8 items-center justify-center rounded-md",
          "text-muted-foreground hover:text-foreground hover:bg-accent transition-colors",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70",
          "disabled:pointer-events-none",
        )}
      >
        <X className="h-4 w-4" />
        <span className="sr-only">Close</span>
      </DialogPrimitive.Close>
    </DialogPrimitive.Content>
  </DialogPortal>
))
DialogContent.displayName = DialogPrimitive.Content.displayName

const DialogHeader = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      // Left-aligned at every width, and clear of the close button.
      "flex flex-col gap-1.5 pr-8 text-left",
      className
    )}
    {...props}
  />
)
DialogHeader.displayName = "DialogHeader"

const DialogFooter = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "flex flex-col-reverse gap-2 sm:flex-row sm:justify-end",
      className
    )}
    {...props}
  />
)
DialogFooter.displayName = "DialogFooter"

const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn(
      "text-lg font-semibold leading-tight text-balance",
      className
    )}
    {...props}
  />
))
DialogTitle.displayName = DialogPrimitive.Title.displayName

const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn("text-sm text-muted-foreground", className)}
    {...props}
  />
))
DialogDescription.displayName = DialogPrimitive.Description.displayName

export {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogTrigger,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
}
