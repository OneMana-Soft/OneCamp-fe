"use client"

import { DropdownMenuItem } from "@/components/ui/dropdown-menu"
import { useComposerTarget } from "@/components/conversation/ComposerHost"
import { usePins } from "@/components/conversation/pins/usePins"
import { pinLabel, rowConversation } from "@/lib/conversation/pins"
import { Pin, PinOff } from "@/lib/icons"

/**
 * "Pin to this channel" or "Unpin from this channel" in a message's More menu
 * (chat B25), for those who may pin in the conversation; nothing otherwise,
 * and nothing outside a conversation.
 */
export function PinMenuItem({ messageId }: { messageId?: string }) {
  const conversation = rowConversation(useComposerTarget(), messageId)
  const pins = usePins(conversation)
  if (!conversation || !messageId || !pins.canPin) return null
  const pinned = pins.byMessage.has(messageId)
  const Icon = pinned ? PinOff : Pin
  return (
    <DropdownMenuItem onSelect={() => void pins.setPin(messageId, !pinned)}>
      <Icon className="text-ink-3" aria-hidden="true" /> {pinLabel(conversation, pinned)}
    </DropdownMenuItem>
  )
}
