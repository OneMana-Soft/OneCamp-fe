"use client"

import * as React from "react"
import { createPortal } from "react-dom"
import { Skeleton } from "@/components/ui/skeleton"

/**
 * A phone sheet while its chunk is on its way: the scrim, the sheet on the pop
 * surface with its grabber and title, and a busy body. ResponsiveDialog's
 * sheet is loaded with the first one opened on a phone, and until it landed
 * the phone showed nothing, so a tap seemed to do nothing on a slow line.
 * Drawn without vaul or Radix, so it costs the page next to nothing. It takes
 * focus (and gives it back), and Escape or the scrim closes it, as the sheet would. Exported for
 * any lazily loaded sheet (TABLES' long-text sheet).
 */
/** The sheet's footer row and its line under the title: one spelling for the sheet (responsive-sheet) and its frame, so they can't drift. */
export const SHEET_FOOTER_ROW = "flex flex-col-reverse gap-2 sm:flex-row [&>*]:h-11 sm:[&>*]:flex-1"
export const SHEET_LINE = "mt-0.5 text-meta text-ink-3"

export function SheetFrame({
  title,
  description,
  footer,
  onShown,
  onClose,
}: {
  title: string
  /** The sheet's line under its title, drawn here too, so the title doesn't move when the sheet lands. */
  description?: string
  /** The sheet's footer, drawn inert while it loads, for the same reason (DESIGN-BUILD-15: an 83px jump). */
  footer?: React.ReactNode
  /** Called once it is on screen, so what replaces it knows to take its place without rising again. */
  onShown?(): void
  onClose(): void
}) {
  const titleId = React.useId()
  const focus = React.useCallback((node: HTMLElement | null) => node?.focus({ preventScroll: true }), [])
  // Focus goes back to its opener as the frame goes, before the sheet's focus
  // scope mounts (a layout cleanup runs first), so the sheet returns it there
  // on close; closed from the frame, it lands there too (CR-32).
  // Read as it first draws: by its layout effects the frame has taken focus.
  const [opener] = React.useState(() => (typeof document === "undefined" ? null : (document.activeElement as HTMLElement | null)))
  React.useLayoutEffect(() => () => opener?.focus({ preventScroll: true }), [opener])
  React.useLayoutEffect(() => onShown?.(), [onShown])
  if (typeof document === "undefined") return null
  return createPortal(
    <>
      <div
        aria-hidden="true"
        data-sheet-frame-scrim=""
        onClick={onClose}
        className="fixed inset-0 z-[var(--z-modal)] bg-[rgb(10_11_14/0.32)] dark:bg-[rgb(0_0_0/0.55)]"
      />
      <section
        ref={focus}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-busy="true"
        tabIndex={-1}
        data-overlay="sheet"
        data-sheet-frame=""
        // As a drawer given a footer says (components/ui/drawer): on a phone its footer is its foot (app/overlay.css 8b).
        data-overlay-holds-footer={footer ? "" : undefined}
        // Its own Escape closes it; the one Escape (lib/keys/escape) leaves it the press.
        data-escape-own=""
        // aria-modal: Tab stays on the frame while it loads.
        onKeyDown={(e) => (e.key === "Escape" ? (e.stopPropagation(), onClose()) : e.key === "Tab" && e.preventDefault())}
        className="fixed inset-x-0 bottom-0 z-[var(--z-modal)] flex flex-col rounded-t-[var(--r-sheet)] bg-pop pb-[env(safe-area-inset-bottom)] shadow-e4 outline-none"
      >
        <div aria-hidden="true" data-v3-grabber="" className="mx-auto mt-1.5 mb-1 shrink-0" />
        <div className="flex min-h-13 shrink-0 flex-col items-center justify-center px-4 text-center">
          <h2 id={titleId} className="text-title-3 text-ink">
            {title}
          </h2>
          {description ? <p className={SHEET_LINE}>{description}</p> : null}
        </div>
        <div aria-hidden="true" className="flex flex-col gap-3 px-4 pt-2 pb-2">
          <Skeleton className="h-11 w-full" />
          <Skeleton className="h-11 w-2/3" />
        </div>
        {footer ? (
          // As ResponsiveSheet lays its footer out (DrawerContent's, the sheet's footer on the one foot,
          // app/overlay.css 8b), and inert: nothing in it answers until the sheet is here.
          <div aria-hidden="true" inert data-sheet-footer="" className="relative shrink-0 px-4 pb-4 pt-3">
            <div className={SHEET_FOOTER_ROW}>{footer}</div>
          </div>
        ) : null}
      </section>
    </>,
    document.body,
  )
}
