"use client"

import { usePins } from "@/components/conversation/pins/usePins"
import { pinLabel } from "@/lib/conversation/pins"
import type { ConversationRef } from "@/lib/conversation/types"
import { Pin, PinOff } from "@/lib/icons"

/**
 * "Pin to this channel" in a message's phone sheet (chat B25): a 48px row as
 * the sheet's others, for those who may pin in the conversation; nothing
 * otherwise. The sheet closes as it pins.
 */
export function PinSheetRow({ conversation, messageId, onDone }: { conversation: ConversationRef | null; messageId: string; onDone: () => void }) {
  const pins = usePins(conversation)
  if (!conversation || !messageId || !pins.canPin) return null
  const pinned = pins.byMessage.has(messageId)
  const Icon = pinned ? PinOff : Pin
  return (
    <button
      type="button"
      onClick={() => {
        onDone()
        void pins.setPin(messageId, !pinned)
      }}
      className="flex h-12 w-full items-center gap-3 border-b border-line px-1 text-left text-ui text-ink last:border-b-0 active:bg-hover focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring"
    >
      <Icon className="size-[18px] text-ink-3" aria-hidden="true" />
      {pinLabel(conversation, pinned)}
    </button>
  )
}
