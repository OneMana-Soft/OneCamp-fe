"use client"

import { useEffect, useState, type RefObject } from "react"
import { PopoverAnchor, PopoverContent } from "@/components/ui/popover"
import { anchorTo } from "@/components/ui/anchor"
import { DesktopReactionPicker } from "@/components/reactionPicker/DesktopReactionPicker"
import type { StandardReaction, SyncCustomReaction } from "@/types/reaction"

const COLLISION_PADDING = 16
const SIDE_OFFSET = 4

/**
 * The reaction picker's floating part (components/popover/reactionPickerPopover):
 * a chunk of its own, so the emoji and their search load on first use, not
 * with every chat. It stands by its trigger through the shared anchor
 * (components/ui/anchor): a message's toolbar that hides while the picker is
 * open leaves its button measuring nothing, and the picker went to the corner.
 */
export default function ReactionPickerPanel({
  trigger,
  open,
  showCustomReactions,
  onReactionSelect,
}: {
  trigger: RefObject<HTMLElement | null>
  open: boolean
  showCustomReactions: boolean
  onReactionSelect: (reaction: StandardReaction | SyncCustomReaction) => void
}) {
  const [at] = useState(() => ({ current: anchorTo(() => trigger.current) }))
  const [triggerRect, setTriggerRect] = useState<{ top: number; bottom: number }>({ top: 0, bottom: 0 })

  useEffect(() => {
    if (!open) return
    const rect = at.current.getBoundingClientRect()
    setTriggerRect({
      top: rect.top + COLLISION_PADDING + SIDE_OFFSET + 32,
      bottom: rect.bottom - COLLISION_PADDING - SIDE_OFFSET - 32,
    })
  }, [open, at])

  return (
    <>
      <PopoverAnchor virtualRef={at} />
      {/* The floating material (design v3 chat, C22): 352×380 at e3, r12,
          with the house pop motion rather than a 95% zoom. It starts at
          its button's edge: centred on the composer's smile, 70px from
          the sheet's edge, it hung half over the sidebar. */}
      <PopoverContent align="start" collisionPadding={12} className="pop-surface z-[var(--z-popover)] h-[380px] w-[352px] p-2" style={{ maxHeight: `max(calc(100dvh - ${triggerRect.top}px), calc(${triggerRect.bottom}px))` }}>
        <DesktopReactionPicker showCustomReactions={showCustomReactions} onReactionSelect={onReactionSelect} />
      </PopoverContent>
    </>
  )
}
