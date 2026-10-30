"use client"

import * as React from "react"
import * as ToastPrimitives from "@radix-ui/react-toast"
import { cva, type VariantProps } from "class-variance-authority"
import { AlertTriangle, Check, CircleAlert, Info, Loader2, X } from "@/lib/icons"
import { AgentAvatar } from "@/components/ui/graphics/PrincipalAvatar"

import { cn } from "@/lib/utils/helpers/cn"
import { isTypedInto } from "@/lib/ui/typedInto"
import { lazyChunk } from "@/lib/loadChunk"

const ToastProvider = ToastPrimitives.Provider

/**
 * Where toasts are drawn (design v3, shell T1). From sm, bottom right, 16px
 * inside the sheet and above the right corner stack (--corner-right-h). On a
 * phone (mobile C9), a 44px pill 12px above the tab bar or a composer
 * (--phone-floor), centred, at most 360px, swiped down to go; under the top
 * bar while the keyboard, a sheet or the field in use holds the foot
 * (app/phone.css). Over a call, above its dock (--call-dock-floor). The stack:
 * globals.css, "V3 SHELL: TOASTS AND NOTICES".
 */
/**
 * Whether a key is the toasts' hotkey: ⌥T alone. Never while typing: in a
 * field or an editor ⌥T is a character on a Mac ("†"), and ⌘⌥T opens or closes
 * every toggle in a doc. Radix's own hotkey matched ⌥T with anything else held
 * and anywhere, so both took focus out of the text. Pure.
 */
export function isToastHotkey(e: Pick<KeyboardEvent, "altKey" | "metaKey" | "ctrlKey" | "shiftKey" | "code" | "target" | "defaultPrevented">): boolean {
  if (!e.altKey || e.metaKey || e.ctrlKey || e.shiftKey || e.code !== "KeyT" || e.defaultPrevented) return false
  const t = e.target as HTMLElement | null
  if (!t || typeof t.closest !== "function") return true
  return !isTypedInto(t)
}

/** The toasts' foot slot (toastFootSlot.ts), fetched with the first field used. */
const footSlot = lazyChunk(() => import("./toastFootSlot"))

const ToastViewport = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Viewport>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Viewport>
>(({ className, ...props }, ref) => {
  const own = React.useRef<React.ElementRef<typeof ToastPrimitives.Viewport>>(null)
  React.useImperativeHandle(ref, () => own.current as React.ElementRef<typeof ToastPrimitives.Viewport>)
  // ⌥T's turn in a modal (toastTurn.tsx, in the foot slot's chunk), while it's held.
  const [turn, setTurn] = React.useState<React.ReactNode>(null)
  // ⌥T reaches the toasts from the keyboard, when nobody is typing
  // (isToastHotkey). Radix's hotkey is off (hotkey={[]}) for this one. If a
  // modal's trap pulls focus back, the toasts take a turn on its stack (V-99).
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!isToastHotkey(e)) return
      const list = own.current!
      const from = document.activeElement
      list.focus()
      if (!(from instanceof HTMLElement)) return
      // Radix puts a modal's trap back a timer tick after a turn ends, and a
      // busy thread runs keys first: ⌥T in that tick keeps focus in the list,
      // and a modal's toasts still need their turn, or Esc goes nowhere.
      const inModal = !!from.closest('[role="dialog"], [role="alertdialog"]')
      if (document.activeElement === list && !inModal) return
      void footSlot.use(() => undefined).then((m) => {
        if (m && (document.activeElement === from || (inModal && document.activeElement === list))) setTurn(m.takeTurn(list, from, () => setTurn(null)))
      })
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [])
  // On a phone the toasts keep off the field in use (toastFootSlot), code that
  // loads with the first field used. When it can't come (no network), the next
  // field used asks again (V-67): its failure never goes unanswered.
  React.useEffect(() => {
    const vp = own.current!
    let stop: (() => void) | undefined
    let cancelled = false
    const onIn = (e: FocusEvent) => {
      if (!isTypedInto(e.target)) return
      document.removeEventListener("focusin", onIn)
      void footSlot
        .use(() => cancelled || document.addEventListener("focusin", onIn))
        .then((m) => {
          if (m && !cancelled) stop = m.keepOffTheField(vp)
        })
    }
    document.addEventListener("focusin", onIn)
    return () => {
      cancelled = true
      document.removeEventListener("focusin", onIn)
      stop?.()
    }
  }, [])
  const viewport = (
  <ToastPrimitives.Viewport
    ref={own}
    hotkey={[]}
    label="Notifications (Alt+T)"
    // Kept by hideOthers ([aria-live]) so toasts stay reachable inside a modal (V-98); Radix's announcer speaks them.
    aria-live="off"
    className={cn(
      "toast-viewport fixed z-[var(--z-toast)] m-0 list-none p-0 outline-none",
      // Phone: above the tab bar or the composer, centred.
      "bottom-[max(calc(var(--phone-floor)+12px),var(--call-dock-floor,0px))] left-1/2 w-[min(100%-32px,360px)] -translate-x-1/2",
      // sm and up: bottom right, 356px wide, 16px inside the right panel or a
      // call's side column, off their composers (QA DSA-19). 24px with neither.
      "sm:left-auto sm:right-[calc(max(var(--shell-right-inset,8px),var(--call-stage-right,0px))+16px)] sm:translate-x-0 sm:bottom-[max(calc(1.5rem+var(--corner-right-h,0px)),var(--call-dock-floor,0px))] sm:w-[356px]",
      className,
    )}
    {...props}
  />
  )
  return (
    <>
      {viewport}
      {turn}
    </>
  )
})
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

type Tone = "success" | "error" | "warning" | "info" | "agent" | "person" | "loading"

/**
 * The 24px tile that leads a toast and says what kind of news it is: a moss
 * check, a danger alert, an amber alert for work at risk but not lost (a
 * doc's changes waiting offline), a sky "i", the agent's square (so you see an agent
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
  const Glyph = tone === "error" ? AlertTriangle : tone === "warning" ? CircleAlert : tone === "info" ? Info : tone === "loading" ? Loader2 : Check
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
    data-interactive="button"
    className={cn(
      // One 26px action, raised at e1: Undo, Retry, View. It may hold a kbd.
      "toast-action inline-flex h-[26px] shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-[7px]",
      "bg-raised px-2 font-medium text-ink shadow-e1",
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
