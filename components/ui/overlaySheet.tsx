"use client"

import * as React from "react"
import * as DialogPrimitive from "@radix-ui/react-dialog"

import { cn } from "@/lib/utils/helpers/cn"
import type { HandedOn } from "@/lib/keys/escape"
import { sheetEdge, useSheetMark } from "@/components/ui/sheetMark"
import { TitledBy } from "@/components/ui/sheetTitle"

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
 * marked so the one Escape (lib/keys/escape) doesn't count it as a layer
 * over itself, and it hands the press on unused (handOn) rather than only
 * marking it, which read as used.
 *
 * It is a sheet by the sheet primitives' one mark ([data-v3-sheet]) and marks
 * the page while it is open (components/ui/sheetMark): on a phone the task's
 * sheet owns the screen's foot, and the toasts keep off it (app/phone.css C9,
 * components/ui/toastFootSlot).
 *
 * A title its content shows (components/ui/sheetTitle: the task's name)
 * names it; `label` names it while there is none, as while the task loads.
 */
function handOn(event: KeyboardEvent & HandedOn) {
  event.escapeHandedOn = true
  event.preventDefault()
}

export function OverlaySheet({
  open,
  onClose,
  label,
  escape = "close",
  className,
  children,
  onClick,
  ...rest
}: {
  open: boolean
  onClose: () => void
  /** The sheet's name, for a screen reader, while its content shows no OverlaySheetTitle. */
  label: string
  escape?: "close" | "own"
  className?: string
  children: React.ReactNode
} & Omit<React.HTMLAttributes<HTMLDivElement>, "children" | "className">) {
  const sheet = React.useRef<HTMLDivElement>(null)
  const marks = useSheetMark(sheet)
  // What had focus when it opened: Radix gives focus back to a Dialog's
  // Trigger, and these sheets open from anywhere, with none.
  const returnTo = React.useRef<HTMLElement | null>(null)
  const [titledBy, setTitledBy] = React.useState<string | null>(null)
  return (
    <DialogPrimitive.Root open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogPrimitive.Overlay className="shell-scrim" onClick={sheetEdge(onClose)} />
      <DialogPrimitive.Content
        ref={marks}
        onClick={sheetEdge(onClick)}
        aria-describedby={undefined}
        data-v3-sheet=""
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
        onEscapeKeyDown={escape === "own" ? handOn : undefined}
        // A surface takes focus to hold it, and draws no ring for it, as the shared drawer's sheet.
        className={cn("outline-none", className)}
        {...rest}
        // Set only with a title shown: given as undefined, it would take away Radix's own, the label's.
        {...(titledBy ? { "aria-labelledby": titledBy } : {})}
      >
        {!titledBy && <DialogPrimitive.Title className="sr-only">{label}</DialogPrimitive.Title>}
        <TitledBy.Provider value={setTitledBy}>{children}</TitledBy.Provider>
      </DialogPrimitive.Content>
    </DialogPrimitive.Root>
  )
}
