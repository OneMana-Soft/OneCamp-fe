import type { ReactNode } from "react"

import { MenuCheck } from "@/components/ui/menuCheck"
import { Plus } from "@/lib/icons"
import { ix } from "@/lib/ui/interactive"
import { cn } from "@/lib/utils/helpers/cn"

/**
 * A chip that turns something on (ST-36): a tool an agent may use, a channel
 * it reads. Its check has a place whether or not it is on, so choosing it
 * never widens it and re-wraps the row under the pointer. A chip of the
 * interaction layer: on is the accent's tint with a ring (aria-pressed), and
 * a finger gets 44px to tap. tone "neutral" is a pick rather than a switch
 * (people, fields, what a status requires): on, the press tint with an ink
 * check, as a chosen segment reads, since orange is for actions. offMark
 * "plus" offers a quiet "+" while it's off.
 */
export function ToggleChip({
  pressed,
  onPressedChange,
  children,
  title,
  className,
  tone,
  offMark,
}: {
  pressed: boolean
  onPressedChange: (pressed: boolean) => void
  children: ReactNode
  title?: string
  className?: string
  tone?: "neutral"
  offMark?: "plus"
}) {
  const neutral = tone === "neutral"
  return (
    <button
      type="button"
      aria-pressed={pressed}
      title={title}
      onClick={() => onPressedChange(!pressed)}
      data-touch-target=""
      {...(neutral ? ix("toggle", { tone: "neutral" }) : ix("chip"))}
      className={cn("chip h-[26px] gap-1 px-2 text-xs", neutral && "transition-colors duration-150", pressed ? (neutral ? "bg-press text-ink" : "text-ink") : "text-ink-2", className)}
    >
      {offMark === "plus" && !pressed ? (
        <Plus aria-hidden="true" data-chip-mark="plus" className="size-3 text-ink-3" />
      ) : (
        // The one check (MenuCheck): its slot is kept when off, so turning it on moves nothing.
        <MenuCheck checked={pressed} className={cn("size-3 [&>svg]:size-3", neutral ? "text-ink" : "text-brand-text")} />
      )}
      {children}
    </button>
  )
}
