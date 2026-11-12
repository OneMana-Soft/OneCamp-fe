import type { ComponentProps } from "react"
import { Lock } from "@/lib/icons"
import { cn } from "@/lib/utils/helpers/cn"

/**
 * A line led by a lock: what the reader may not change or see beyond, said as
 * a status, never an action. The lock sits in a 16 px icon column, in ink-3.
 * An event made private (below) and a calendar read-only in its provider (its
 * menu in the Calendars panel, V-594) say it alike.
 */
export function LockLine({ children, className, ...props }: ComponentProps<"span">) {
  return (
    <span className={cn("inline-flex min-w-0 items-center gap-2.5 text-ui-sm text-ink", className)} {...props}>
      <Lock className="size-4 shrink-0 text-ink-3" aria-hidden="true" />
      {children}
    </span>
  )
}

/**
 * An event made private (V-643, gcal-1a "visibility"; Google's lock with
 * "Private"), one line wherever an event is read: its pop card and its own
 * view (the panel, a phone's page), in the card's 16 px icon column. Nothing
 * for the calendar's default or public. It says only what the reader already
 * reads of the event.
 */
export function VisibilityLine({ visibility, className }: { visibility?: string; className?: string }) {
  if (visibility !== "private") return null
  return (
    <LockLine data-visibility-line="private" className={className}>
      Private
    </LockLine>
  )
}
