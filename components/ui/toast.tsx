"use client"

import * as React from "react"
import * as ToastPrimitives from "@radix-ui/react-toast"
import { cva, type VariantProps } from "class-variance-authority"
import { X } from "@/lib/icons"

import { cn } from "@/lib/utils/helpers/cn"

const ToastProvider = ToastPrimitives.Provider

/**
 * Bottom-right viewport on desktop, bottom-centre on mobile (above the
 * bottom nav safe-area). Matches Linear / Notion toast placement.
 */
const ToastViewport = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Viewport>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Viewport>
>(({ className, ...props }, ref) => (
  <ToastPrimitives.Viewport
    ref={ref}
    className={cn(
      "fixed z-[var(--z-toast)] flex flex-col gap-2 p-4 max-h-screen w-full",
      // Mobile: bottom-aligned, full-width minus padding, with safe-area inset
      "bottom-0 left-1/2 -translate-x-1/2 sm:translate-x-0",
      "pb-[calc(env(safe-area-inset-bottom)+1rem)] sm:pb-4",
      // Desktop: pin to bottom-right with bounded width
      "sm:bottom-0 sm:right-0 sm:left-auto sm:max-w-[380px]",
      className,
    )}
    {...props}
  />
))
ToastViewport.displayName = ToastPrimitives.Viewport.displayName

const toastVariants = cva(
  cn(
    "group pointer-events-auto relative flex w-full items-start justify-between gap-3",
    "overflow-hidden rounded-lg border p-3 pr-10 shadow-lg",
    "data-[swipe=cancel]:translate-x-0",
    "data-[swipe=end]:translate-x-[var(--radix-toast-swipe-end-x)]",
    "data-[swipe=move]:translate-x-[var(--radix-toast-swipe-move-x)] data-[swipe=move]:transition-none",
    "data-[state=open]:animate-in data-[state=closed]:animate-out",
    "data-[swipe=end]:animate-out data-[state=closed]:fade-out-80",
    "data-[state=closed]:slide-out-to-right-full data-[state=open]:slide-in-from-bottom-full",
    "sm:data-[state=open]:slide-in-from-right-full",
    "transition-all",
  ),
  {
    variants: {
      variant: {
        default: "border-border/60 bg-background text-foreground",
        destructive:
          "destructive border-destructive/60 bg-destructive text-destructive-foreground",
        notification:
          "border-border/60 bg-background/95 backdrop-blur-xl text-foreground",
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
      "focus:outline-none focus:ring-2 focus:ring-ring/40",
      "disabled:pointer-events-none disabled:opacity-50",
      "group-[.destructive]:border-destructive-foreground/30",
      "group-[.destructive]:hover:bg-destructive-foreground/10",
      "group-[.destructive]:hover:text-destructive-foreground",
      "group-[.destructive]:focus:ring-destructive-foreground/40",
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
      "focus:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
      "group-[.destructive]:text-destructive-foreground/70 group-[.destructive]:hover:text-destructive-foreground",
      "group-[.destructive]:hover:bg-destructive-foreground/10",
      "group-[.destructive]:focus-visible:ring-destructive-foreground/40",
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
    className={cn("text-sm font-semibold leading-tight", className)}
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
    className={cn("text-xs leading-snug opacity-90 mt-0.5", className)}
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
