"use client"

// The board's floating clusters and their buttons (components/board/boardChrome
// B03), in a module of their own: a piece that draws a cluster (the guest
// board's comments, components/guest/guestBoardComments) takes these alone,
// not the board's title cluster with its icons, which the app's shell holds:
// reaching those from a new lazy group gave the /app layout's shell modules a
// chunk group more, and Turbopack re-cut the layout on every /app route
// (WZ39K trace, 16 Nov).

import * as React from "react"
import { cn } from "@/lib/utils/helpers/cn"

/** One floating cluster: 40 px, pop, e3, r12, 4 px padding. */
export function ChromeCluster({
  label,
  className,
  children,
}: {
  label: string
  className?: string
  children: React.ReactNode
}) {
  return (
    <div
      role="toolbar"
      aria-label={label}
      data-board-chrome=""
      className={cn(
        "content-float pointer-events-auto flex h-10 items-center gap-0.5 rounded-xl bg-pop p-1 text-ink shadow-e3 [animation-delay:120ms]",
        className,
      )}
    >
      {children}
    </div>
  )
}

/** A 32 px icon button in a cluster: ink-3 at rest, ink on hover. */
export const ClusterButton = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement> & { label: string; active?: boolean }
>(function ClusterButton({ label, active, className, children, type = "button", ...rest }, ref) {
  return (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      title={label}
      aria-pressed={active === undefined ? undefined : active}
      className={cn(
        "inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-ink-3 outline-none transition-colors",
        "hover:bg-hover hover:text-ink active:bg-press focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand",
        "[&_svg]:size-4",
        active && "bg-brand-muted text-brand-text hover:bg-brand-muted hover:text-brand-text",
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  )
})

/** The divider between a cluster's groups. */
export function ClusterDivider() {
  return <span aria-hidden="true" className="mx-1 h-4 w-px shrink-0 bg-line-2" />
}
