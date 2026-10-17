import type { ReactNode } from "react"

import { MenuCheck } from "@/components/ui/menuCheck"
import { ix } from "@/lib/ui/interactive"
import { cn } from "@/lib/utils/helpers/cn"

/**
 * A chip that turns something on (ST-36): a tool an agent may use, a channel
 * it reads. Its check has a place whether or not it is on, so choosing it
 * never widens it and re-wraps the row under the pointer. A chip of the
 * interaction layer: on is the accent's tint with a ring (aria-pressed), and
 * a finger gets 44px to tap.
 */
export function ToggleChip({
  pressed,
  onPressedChange,
  children,
  title,
  className,
}: {
  pressed: boolean
  onPressedChange: (pressed: boolean) => void
  children: ReactNode
  title?: string
  className?: string
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      title={title}
      onClick={() => onPressedChange(!pressed)}
      data-touch-target=""
      {...ix("chip")}
      className={cn("chip h-[26px] gap-1 px-2 text-xs", pressed ? "text-ink" : "text-ink-2", className)}
    >
      {/* The one check (MenuCheck): its slot is kept when off, so turning it on moves nothing. */}
      <MenuCheck checked={pressed} className="size-3 text-brand-text [&>svg]:size-3" />
      {children}
    </button>
  )
}
