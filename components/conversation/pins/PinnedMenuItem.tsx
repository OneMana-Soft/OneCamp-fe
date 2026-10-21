"use client"

import { DropdownMenuItem, DropdownMenuShortcut } from "@/components/ui/dropdown-menu"
import { usePins } from "@/components/conversation/pins/usePins"
import type { ConversationRef } from "@/lib/conversation/types"
import { Pin } from "@/lib/icons"

/**
 * "Pinned messages" in a conversation header's More menu (chat B25), with
 * how many, when there are any: it opens the conversation's Details, where
 * the pins are listed. The header keeps its three controls (design v3 chat,
 * C01); a tab of its own comes with conversation tabs (B16).
 */
export function PinnedMenuItem({ conversation, onOpen }: { conversation: ConversationRef | null; onOpen: () => void }) {
  const count = usePins(conversation).pins.length
  if (!conversation || count === 0) return null
  return (
    <DropdownMenuItem onClick={onOpen}>
      <Pin className="text-ink-3" aria-hidden="true" /> Pinned messages
      <DropdownMenuShortcut className="tabular-nums">{count}</DropdownMenuShortcut>
    </DropdownMenuItem>
  )
}
