"use client"

import { HeldNotificationsBar } from "@/components/messages/heldNotificationsBar"
import { listIdOf } from "@/store/conversations"
import type { ConversationRef } from "@/lib/conversation/types"

/**
 * What sits on a DM's message box, on a computer and a phone: a teammate
 * holding their notifications.
 */
export function DmComposerExtras({ conversation, peerName, isBot }: {
    conversation: ConversationRef
    send: (html: string) => void
    peerName?: string
    isBot: boolean
}) {
    const other = listIdOf(conversation)
    return <HeldNotificationsBar userUUID={other} name={peerName} isBot={isBot} />
}
