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
      // Design v3 (admin §8 H2): a dim, never a blur. rgba(11,12,14,.32) in
      // light, black at 60% in dark (v3-overlay in styles/admin/feedback.css),
      // fading in over 180ms and out over 150ms. Fixed in both themes rather
      // than a token: inverting would turn the dim into a white veil.
      "v3-overlay fixed inset-0 z-[var(--z-modal-backdrop)]",
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

/** Dialog widths (design v3, admin §8 H2): sm 400, md 520 (the default), lg 680, xl 860. */
const DIALOG_SIZE = {
  sm: "max-w-[400px]",
  md: "max-w-[520px]",
  lg: "max-w-[680px]",
  xl: "max-w-[860px]",
} as const

type DialogSize = keyof typeof DIALOG_SIZE

/**
 * The dialog's surface (design v3, admin §8 H2): --pop, r16, e4, no border,
 * clipped to its corners, 20px padding. It opens with opacity, scale .97 and
 * y 8 over 220ms on the out-curve and closes with opacity and scale .98 over
 * 150ms (v3-dialog in styles/admin/feedback.css; a fade alone under reduced
 * motion). `size` picks a width; a max-w class a caller passes still wins, so
 * the dialogs that set their own width keep it. A long dialog scrolls inside
 * its 85dvh, and its footer stays stuck to the bottom.
 *
 * On a phone it keeps a 16px gutter. The bottom sheet the spec asks for on
 * phones belongs to the mobile wave's sheet primitive, not to this one.
 */
const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & { size?: DialogSize; hideClose?: boolean }
>(({ className, children, onOpenAutoFocus, size = "md", hideClose = false, ...props }, ref) => (
  <DialogPortal>
    <DialogOverlay />
    <DialogPrimitive.Content
      ref={ref}
      data-size={size}
      className={cn(
        "v3-dialog fixed left-[50%] top-[50%] z-[var(--z-modal)] grid w-[calc(100%-2rem)] max-h-[85dvh] overflow-y-auto overscroll-contain translate-x-[-50%] translate-y-[-50%] gap-4 rounded-[16px] bg-pop p-5 shadow-e4",
        DIALOG_SIZE[size],
        className
      )}
      onOpenAutoFocus={(event) => {
        onOpenAutoFocus?.(event)
        if (!event.defaultPrevented) focusFirstField(event)
      }}
      {...props}
    >
      {children}
      {!hideClose && (
        <DialogPrimitive.Close
          className={cn(
            // A 28px ghost icon button 14px from the corner.
            "absolute right-3.5 top-3.5 inline-flex h-7 w-7 items-center justify-center rounded-md",
            "text-faint-foreground hover:text-foreground hover:bg-hover active:bg-press transition-colors",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70",
            "disabled:pointer-events-none",
          )}
        >
          <X className="h-4 w-4" />
          <span className="sr-only">Close</span>
        </DialogPrimitive.Close>
      )}
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
      // Left-aligned at every width, clear of the close button; the
      // description 4px under the title.
      "flex flex-col gap-1 pr-8 text-left",
      className
    )}
    {...props}
  />
)
DialogHeader.displayName = "DialogHeader"

/**
 * The optional 36px r10 tile at the head of a dialog: a neutral sunken
 * square with an ink-3 glyph, or the danger tint for a dialog that destroys.
 */
const DialogTile = ({
  className,
  tone = "neutral",
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { tone?: "neutral" | "danger" }) => (
  <span
    aria-hidden="true"
    data-dialog-tile={tone}
    className={cn(
      "mb-2 inline-flex size-9 shrink-0 items-center justify-center rounded-[10px] [&>svg]:size-[18px]",
      tone === "danger"
        ? "bg-[color-mix(in_oklab,var(--destructive)_10%,transparent)] text-danger-ink"
        : "bg-sunken text-faint-foreground ring-1 ring-inset ring-line",
      className
    )}
    {...props}
  />
)
DialogTile.displayName = "DialogTile"

/**
 * A body that scrolls inside itself once it is taller than 70dvh, with a
 * hairline under the header and over the footer only while there is more
 * to see above or below. Opt-in: a dialog without it scrolls as a whole.
 */
const DialogBody = ({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) => {
  const outer = React.useRef<HTMLDivElement>(null)
  const inner = React.useRef<HTMLDivElement>(null)
  React.useEffect(() => {
    const box = inner.current
    const frame = outer.current
    if (!box || !frame) return
    const measure = () => {
      frame.dataset.above = String(box.scrollTop > 0)
      frame.dataset.below = String(box.scrollTop + box.clientHeight < box.scrollHeight - 1)
    }
    measure()
    box.addEventListener("scroll", measure, { passive: true })
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null
    ro?.observe(box)
    if (box.firstElementChild) ro?.observe(box.firstElementChild)
    return () => {
      box.removeEventListener("scroll", measure)
      ro?.disconnect()
    }
  }, [])
  return (
    <div ref={outer} className="v3-dlg-body" data-above="false" data-below="false">
      <div ref={inner} className={cn("v3-dlg-body-scroll", className)} {...props}>
        <div>{children}</div>
      </div>
    </div>
  )
}
DialogBody.displayName = "DialogBody"

/**
 * The footer: 60px on --sunken with a hairline on top, running edge to edge
 * at the foot of the dialog (v3-dlg-footer). Cancel and the primary sit on
 * the right; `tertiary` (Copy link, Learn more) goes on the left.
 */
const DialogFooter = ({
  className,
  tertiary,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { tertiary?: React.ReactNode }) => (
  <div
    data-dialog-footer=""
    className={cn(
      "v3-dlg-footer flex flex-col-reverse gap-2 sm:flex-row sm:justify-end",
      className
    )}
    {...props}
  >
    {tertiary && <div className="flex items-center gap-2 sm:mr-auto">{tertiary}</div>}
    {children}
  </div>
)
DialogFooter.displayName = "DialogFooter"

/** A title that sets its own size (text-xs … text-title-1) keeps it; otherwise it is title-3. */
const OWN_SIZE = /(?:^|\s)(?:[\w-]+:)*text-(?:3xs|2xs|xs|sm|base|lg|xl|[2-9]xl|body|heading|title-[123]|display|doc-title|\[[\d.]+(?:px|rem)\])(?:\s|$)/

const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    // title-3, 17/24 590. Joined by hand: cn() drops text-title-3 when a
    // caller passes a text colour beside it.
    className={cn("font-semibold text-balance", className) + (OWN_SIZE.test(className ?? "") ? "" : " text-title-3")}
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

export type { DialogSize }

export {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogTrigger,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogBody,
  DialogTile,
  DialogTitle,
  DialogDescription,
}
