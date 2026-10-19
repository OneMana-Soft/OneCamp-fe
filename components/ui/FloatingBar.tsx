"use client"

import * as React from "react"

import { cn } from "@/lib/utils/helpers/cn"
import { escapeTaken, takeEscape } from "@/lib/keys/escapeOwn"

/**
 * A toolbar that floats over content (content.md §1.5): the doc's selection
 * bar, the link bubble, image actions, a board's selection actions and a
 * table's bulk bar. `pop` surface, e3, r10, 3 px padding, 28 px buttons, and
 * the area's `float-in` motion (content.css). Where it sits is the caller's:
 * pass a style with the position, and `follow` when it should slide to a new
 * anchor while open rather than enter again.
 *
 * Arrow keys move along the buttons and Escape hands focus back (onEscape),
 * so the bar is one tab stop with `role="toolbar"` and a name.
 */
export interface FloatingBarProps extends React.HTMLAttributes<HTMLDivElement> {
  /** The accessible name, e.g. "Formatting". */
  label: string
  /** Slide (transform) to a new position instead of re-entering. */
  follow?: boolean
  /** Placed below its anchor: enter from -4 px. */
  below?: boolean
  onEscape?: () => void
}

export const FloatingBar = React.forwardRef<HTMLDivElement, FloatingBarProps>(function FloatingBar(
  { label, follow, below, onEscape, className, onKeyDown, children, ...rest },
  ref,
) {
  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    onKeyDown?.(e)
    if (e.key === "Escape") {
      // One a sheet over the page handed on is the bar's; one its owner used isn't (escapeTaken).
      if (escapeTaken(e.nativeEvent) || !onEscape) return
      takeEscape(e.nativeEvent)
      onEscape()
      return
    }
    if (e.defaultPrevented) return
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft" && e.key !== "Home" && e.key !== "End") return
    const items = Array.from(e.currentTarget.querySelectorAll<HTMLElement>("[data-bar-item]:not([disabled])"))
    if (!items.length) return
    const at = items.indexOf(document.activeElement as HTMLElement)
    let next = at
    if (e.key === "ArrowRight") next = at < 0 ? 0 : (at + 1) % items.length
    else if (e.key === "ArrowLeft") next = at < 0 ? items.length - 1 : (at - 1 + items.length) % items.length
    else if (e.key === "Home") next = 0
    else next = items.length - 1
    e.preventDefault()
    items[next]?.focus()
  }
  return (
    <div
      ref={ref}
      role="toolbar"
      aria-label={label}
      aria-orientation="horizontal"
      data-floating-bar=""
      data-escape-own={!!onEscape ? "" : undefined}
      onKeyDown={handleKeyDown}
      className={cn(
        "content-float z-[var(--z-popover)] inline-flex h-[34px] items-center gap-0.5 rounded-[10px] bg-pop p-[3px] text-ink shadow-e3",
        follow && "content-float-follow",
        below && "float-below",
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  )
})

export interface FloatingBarButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** The accessible name; shown as the tooltip too unless children carry text. */
  label: string
  /** The mark or mode is on. */
  active?: boolean
}

/** A 28 px button in a FloatingBar: ink-2 at rest, hover fill, press fill when active. */
export const FloatingBarButton = React.forwardRef<HTMLButtonElement, FloatingBarButtonProps>(function FloatingBarButton(
  { label, active, className, children, type = "button", ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      title={label}
      aria-pressed={active === undefined ? undefined : active}
      data-bar-item=""
      className={cn(
        "inline-flex h-7 min-w-7 shrink-0 items-center justify-center gap-1.5 rounded-lg px-1.5 text-ui-sm font-medium text-ink-2 outline-none transition-colors duration-[90ms]",
        "hover:bg-hover hover:text-ink active:bg-press",
        "focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand",
        "disabled:pointer-events-none disabled:text-ink-4",
        "[&_svg]:size-4 [&_svg]:shrink-0",
        active && "bg-press text-ink",
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  )
})

/** The 1 × 16 px divider between a FloatingBar's groups. */
export function FloatingBarDivider({ className }: { className?: string }) {
  return <span aria-hidden="true" className={cn("mx-1 h-4 w-px shrink-0 bg-line-2", className)} />
}
