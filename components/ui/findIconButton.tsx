"use client"

// Find's small square buttons (Match case, Whole word, Previous, Next, Replace): a doc's Find (docEditor/FindBar)
// and a board's (board/findPanel) wear the same ones.

import * as React from "react"
import { cn } from "@/lib/utils/helpers/cn"

export function FindIconButton({
  "aria-label": label,
  pressed,
  expanded,
  onClick,
  children,
  disabled,
}: {
  "aria-label": string
  pressed?: boolean
  expanded?: boolean
  onClick(): void
  children: React.ReactNode
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      aria-expanded={expanded}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "grid size-7 shrink-0 place-items-center rounded-md text-ink-3 outline-none transition-colors duration-[140ms] hover:bg-hover hover:text-ink disabled:pointer-events-none disabled:opacity-40 max-sm:size-9",
        "focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand [&_svg]:size-4",
        pressed && "bg-press text-ink",
      )}
    >
      {children}
    </button>
  )
}
