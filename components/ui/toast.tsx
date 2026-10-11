"use client"

import * as React from "react"
import * as ToastPrimitives from "@radix-ui/react-toast"
import { cva, type VariantProps } from "class-variance-authority"
import { AlertTriangle, Check, Info, Loader2, X } from "@/lib/icons"
import { AgentAvatar } from "@/components/ui/graphics/PrincipalAvatar"

import { cn } from "@/lib/utils/helpers/cn"

const ToastProvider = ToastPrimitives.Provider

/**
 * Where toasts are drawn (design v3, shell T1). Bottom right from sm up, 24px
 * from the window, which is 16px inside the sheet's edge (the sheet sits 8px
 * in), and above anything the right-hand corner stack holds (the demo prompt,
 * slash-command cards: --corner-right-h, set by CornerStack). On a phone
 * (design v3, mobile C9), a 44px pill 12px above whatever owns the bottom of
 * the screen: the tab bar, or on a channel its composer (--phone-floor, set by
 * MobileNavigationBar from --mobile-drawer-h), so it never sits over the box
 * the person is typing in; centred, min(100% - 32px, 360px) wide; swiped down
 * to go. While the keyboard is up it comes in under the top bar instead
 * (app/phone.css).
 *
 * The toasts inside stack: see globals.css, "V3 SHELL: TOASTS AND NOTICES".
 */
const ToastViewport = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Viewport>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Viewport>
>(({ className, ...props }, ref) => (
  <ToastPrimitives.Viewport
    ref={ref}
    // ⌥T reaches the toasts from the keyboard (Radix matches event.code).
    hotkey={["altKey", "KeyT"]}
    label="Notifications (Alt+T)"
    className={cn(
      "toast-viewport fixed z-[var(--z-toast)] m-0 list-none p-0 outline-none",
      // Phone: above the tab bar or the composer, centred.
      "bottom-[calc(var(--phone-floor)+12px)] left-1/2 w-[min(100%-32px,360px)] -translate-x-1/2",
      // sm and up: bottom right, 356px wide.
      "sm:left-auto sm:right-6 sm:translate-x-0 sm:bottom-[calc(1.5rem+var(--corner-right-h,0px))] sm:w-[356px]",
      className,
    )}
    {...props}
  />
))
ToastViewport.displayName = ToastPrimitives.Viewport.displayName

/**
 * The toast's root is a transparent shell that the stack moves (transform
 * only); what you see is its card. Variants keep their names, so every one of
 * the five hundred callers still works: destructive is the error tone,
 * notification an info toast.
 */
const toastVariants = cva("toast-root group pointer-events-auto", {
  variants: {
    variant: {
      default: "",
      destructive: "destructive",
      notification: "",
    },
  },
  defaultVariants: {
    variant: "default",
  },
})

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

/** The visible toast: 356px, at least 52px, r12 on the pop surface at e3. */
const ToastCard = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => <div ref={ref} className={cn("toast-card", className)} {...props} />,
)
ToastCard.displayName = "ToastCard"

type Tone = "success" | "error" | "info" | "agent" | "person" | "loading"

/**
 * The 24px tile that leads a toast and says what kind of news it is: a moss
 * check, a danger alert, a sky "i", the agent's square (so you see an agent
 * acted, which is the governance story again), a person's avatar, or a
 * spinner while something long runs.
 */
function ToastTile({ tone, icon }: { tone: Tone; icon?: React.ReactNode }) {
  if (tone === "agent" || tone === "person") {
    return (
      <span className={cn("toast-tile", `toast-tile-${tone}`)} aria-hidden="true" data-tone={tone}>
        {icon ?? (tone === "agent" ? <AgentAvatar /> : null)}
      </span>
    )
  }
  const Glyph = tone === "error" ? AlertTriangle : tone === "info" ? Info : tone === "loading" ? Loader2 : Check
  return (
    <span className={cn("toast-tile", `toast-tile-${tone}`)} aria-hidden="true" data-tone={tone}>
      {icon ?? <Glyph className={cn("size-3.5", tone === "loading" && "animate-spin")} />}
    </span>
  )
}

const ToastAction = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Action>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Action>
>(({ className, ...props }, ref) => (
  <ToastPrimitives.Action
    ref={ref}
    className={cn(
      // One 26px action, raised at e1: Undo, Retry, View. It may hold a kbd.
      "toast-action inline-flex h-[26px] shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-[7px]",
      "bg-raised px-2 font-medium text-ink shadow-e1",
      "transition-shadow hover:shadow-e2",
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-pop",
      "disabled:pointer-events-none disabled:opacity-50",
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
      // No × at rest: it shows on hover or focus, 20px at the top right
      // corner, so it never sits on the action.
      "toast-close inline-flex size-5 items-center justify-center rounded-full bg-pop text-ink-3 shadow-e1",
      "hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand",
      className,
    )}
    toast-close=""
    aria-label="Close notification"
    {...props}
  >
    <X className="size-3" />
  </ToastPrimitives.Close>
))
ToastClose.displayName = ToastPrimitives.Close.displayName

const ToastTitle = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Title>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Title>
>(({ className, ...props }, ref) => (
  <ToastPrimitives.Title
    ref={ref}
    className={cn("toast-title text-xs font-medium text-ink", className)}
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
    className={cn("toast-desc text-ink-2", className)}
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
  ToastCard,
  ToastTile,
  ToastTitle,
  ToastDescription,
  ToastClose,
  ToastAction,
}
