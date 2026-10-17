"use client"

import * as React from "react"
import * as DialogPrimitive from "@radix-ui/react-dialog"

import { cn } from "@/lib/utils/helpers/cn"

/**
 * A SHEET OVER THE PAGE, on the shell's scrim: the tablet's channel list and
 * the right panel over a narrow page. Both were hand-built, a scrim and a
 * sheet, and aria-modal in name only: Tab walked out of them into the page
 * behind (REVIEW-FE-SHELL). This is a modal of the app's own, on Radix
 * Dialog: while it is open focus stays inside it (Tab and Shift+Tab go round
 * it), the page behind is out of reach, a tap on the scrim or Escape closes
 * it, and closing gives focus back to where it was.
 *
 * In place, not in a portal: the shell's CSS places the scrim (.shell-scrim)
 * and the sheet (`className`). Opening focuses the sheet itself, so a
 * keyboard starts in it and a tablet raises no keyboard for a field.
 *
 * `escape="own"` leaves Escape to the sheet's content (the right panel's
 * rules: an editor's popup or a field takes it first); the sheet is then
 * marked so escapeBelongsToLayer (hooks/useEscapeClosesPanel) doesn't count
 * it as a layer over itself.
 */
export function OverlaySheet({
  open,
  onClose,
  label,
  escape = "close",
  className,
  children,
  ...rest
}: {
  open: boolean
  onClose: () => void
  /** The sheet's name, for a screen reader. */
  label: string
  escape?: "close" | "own"
  className?: string
  children: React.ReactNode
} & Omit<React.HTMLAttributes<HTMLDivElement>, "children" | "className">) {
  const sheet = React.useRef<HTMLDivElement>(null)
  // What had focus when it opened: Radix gives focus back to a Dialog's
  // Trigger, and these sheets open from anywhere, with none.
  const returnTo = React.useRef<HTMLElement | null>(null)
  return (
    <DialogPrimitive.Root open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogPrimitive.Overlay className="shell-scrim" onClick={onClose} />
      <DialogPrimitive.Content
        ref={sheet}
        aria-describedby={undefined}
        data-overlay-sheet={escape === "own" ? "own-escape" : ""}
        tabIndex={-1}
        onOpenAutoFocus={(e) => {
          returnTo.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
          e.preventDefault()
          sheet.current?.focus()
        }}
        onCloseAutoFocus={(e) => {
          e.preventDefault()
          if (returnTo.current?.isConnected) returnTo.current.focus()
        }}
        onEscapeKeyDown={escape === "own" ? (e) => e.preventDefault() : undefined}
        // A surface takes focus to hold it, and draws no ring for it, as the shared drawer's sheet.
        className={cn("outline-none", className)}
        {...rest}
      >
        <DialogPrimitive.Title className="sr-only">{label}</DialogPrimitive.Title>
        {children}
      </DialogPrimitive.Content>
    </DialogPrimitive.Root>
  )
}
