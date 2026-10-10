"use client"

import * as React from "react"
import * as ToastPrimitives from "@radix-ui/react-toast"
import { cva, type VariantProps } from "class-variance-authority"
import { X } from "@/lib/icons"

import { cn } from "@/lib/utils/helpers/cn"

const ToastProvider = ToastPrimitives.Provider

/**
 * Bottom right from sm up; at the top on a phone. A phone's toast used to sit
 * 5rem up, clear of the bottom navigation but over a channel's message box,
 * which has no navigation under it, so a toast covered what the person was
 * typing. At the top, under the status bar, it covers nothing they are using.
 */
const ToastViewport = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Viewport>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Viewport>
>(({ className, ...props }, ref) => (
  <ToastPrimitives.Viewport
    ref={ref}
    className={cn(
      "fixed z-[var(--z-toast)] flex flex-col gap-2 p-4 max-h-screen w-full",
      // Phone: at the top, full width less the padding, under the status bar.
      "top-0 left-1/2 -translate-x-1/2 pt-[calc(env(safe-area-inset-top)+0.75rem)]",
      // sm and up: bottom right, at a bounded width.
      "sm:top-auto sm:bottom-0 sm:right-0 sm:left-auto sm:translate-x-0 sm:pt-4 sm:max-w-[380px]",
      className,
    )}
    {...props}
  />
))
ToastViewport.displayName = ToastPrimitives.Viewport.displayName

const toastVariants = cva(
  cn(
    "group pointer-events-auto relative flex w-full items-start justify-between gap-3",
    "overflow-hidden rounded-lg border p-3 pr-10 shadow-overlay",
    "data-[swipe=cancel]:translate-x-0",
    "data-[swipe=end]:translate-x-[var(--radix-toast-swipe-end-x)]",
    "data-[swipe=move]:translate-x-[var(--radix-toast-swipe-move-x)] data-[swipe=move]:transition-none",
    "data-[state=open]:animate-in data-[state=closed]:animate-out",
    "data-[swipe=end]:animate-out data-[state=closed]:fade-out-80",
    // In from below by a few pixels and out as a fade, on the house curve: a
    // toast confirms something happened, it does not need to fly across the
    // screen to do it. Swipe-to-dismiss still slides, because there the
    // finger is moving it.
    "duration-200 ease-standard data-[state=open]:fade-in-0",
    // From the edge it sits at: down from the top on a phone, up from below on a desktop.
    "data-[state=open]:slide-in-from-top-2 sm:data-[state=open]:slide-in-from-bottom-2",
    "data-[swipe=end]:slide-out-to-right-full",
    "transition-[transform,opacity]",
  ),
  {
    variants: {
      variant: {
        default: "border-border/60 bg-background text-foreground",
        // A failure is said in words and one red title, on the same calm
        // surface as every other toast. A solid red slab in the corner was the
        // loudest thing in the app for something a retry usually fixes, and
        // its white-on-red body text was the hardest to read.
        destructive:
          "destructive border-destructive/40 bg-background text-foreground",
        notification:
          "border-border/60 bg-background text-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
)

const Toast = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Root>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Root> &
    VariantProps<typeof toastVariants>
>(({ className, variant, ...props }, ref) => {
  return (
    <ToastPrimitives.Root
      ref={ref}
      className={cn(toastVariants({ variant }), className)}
      {...props}
    />
  )
})
Toast.displayName = ToastPrimitives.Root.displayName

const ToastAction = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Action>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Action>
>(({ className, ...props }, ref) => (
  <ToastPrimitives.Action
    ref={ref}
    className={cn(
      "inline-flex h-8 shrink-0 items-center justify-center rounded-md border border-input",
      "bg-transparent px-3 text-xs font-medium",
      "transition-colors hover:bg-accent",
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70",
      "disabled:pointer-events-none disabled:opacity-50",
      "group-[.destructive]:border-destructive/40 group-[.destructive]:text-danger-ink",
      "group-[.destructive]:hover:bg-destructive/10",
      className,
    )}
    {...props}
  />
))
ToastAction.displayName = ToastPrimitives.Action.displayName

const ToastClose = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Close>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Close>
>(({ className, ...props }, ref) => (
  <ToastPrimitives.Close
    ref={ref}
    className={cn(
      "absolute right-2 top-2 inline-flex h-6 w-6 items-center justify-center rounded-md",
      "text-foreground/60 hover:text-foreground hover:bg-accent",
      "transition-colors",
      "focus:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/70",
      className,
    )}
    toast-close=""
    aria-label="Close notification"
    {...props}
  >
    <X className="h-3.5 w-3.5" />
  </ToastPrimitives.Close>
))
ToastClose.displayName = ToastPrimitives.Close.displayName

const ToastTitle = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Title>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Title>
>(({ className, ...props }, ref) => (
  <ToastPrimitives.Title
    ref={ref}
    className={cn("text-sm font-semibold leading-tight group-[.destructive]:text-danger-ink", className)}
    {...props}
  />
))
ToastTitle.displayName = ToastPrimitives.Title.displayName

const ToastDescription = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Description>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Description>
>(({ className, ...props }, ref) => (
  <ToastPrimitives.Description
    ref={ref}
    className={cn("text-xs leading-snug text-muted-foreground mt-0.5", className)}
    {...props}
  />
))
ToastDescription.displayName = ToastPrimitives.Description.displayName

type ToastProps = React.ComponentPropsWithoutRef<typeof Toast>
type ToastActionElement = React.ReactElement<typeof ToastAction>

export {
  type ToastProps,
  type ToastActionElement,
  ToastProvider,
  ToastViewport,
  Toast,
  ToastTitle,
  ToastDescription,
  ToastClose,
  ToastAction,
}
