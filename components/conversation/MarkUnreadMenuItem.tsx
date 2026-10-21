"use client"

import { useDispatch } from "react-redux"
import { DropdownMenuItem } from "@/components/ui/dropdown-menu"
import { useComposerTarget } from "@/components/conversation/ComposerHost"
import { rowConversation } from "@/lib/conversation/pins"
import { useToast } from "@/hooks/use-toast"
import { CircleDot } from "@/lib/icons"

/**
 * "Mark unread" in a message's More menu (chat B27, D-SD3): the message and
 * everything after it that isn't yours are unread again, here and on every
 * other tab and device, and the conversation stays unread until you open it
 * again. In a channel, a DM or a group; a thread's replies keep no marker yet.
 */
export function MarkUnreadMenuItem({ messageId }: { messageId?: string }) {
  const conversation = rowConversation(useComposerTarget(), messageId)
  const dispatch = useDispatch()
  const { toast } = useToast()
  if (!conversation || !messageId) return null
  const mark = async () => {
    const { markUnreadFrom } = await import("@/lib/conversation/readPosition")
    if (!(await markUnreadFrom(dispatch, conversation.kind, conversation.id, messageId))) {
      toast({ title: "Couldn't mark it unread", description: "Check your connection and try again.", variant: "destructive" })
    }
  }
  return (
    <DropdownMenuItem onSelect={() => void mark()}>
      <CircleDot className="text-ink-3" aria-hidden="true" /> Mark unread
    </DropdownMenuItem>
  )
}
