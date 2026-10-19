"use client"

import type { ReactNode } from "react"
import { ComposerHost } from "@/components/conversation/ComposerHost"
import { useConversationStream } from "@/lib/realtime/context"
import { dmWith } from "@/lib/conversation/route"
import { useFetchOnlyOnce } from "@/hooks/useFetch"
import { GetEndpointUrl } from "@/services/endPoints"
import type { ConversationRef } from "@/lib/conversation/types"
import type { UserProfileInterface } from "@/types/user"

/**
 * A conversation on screen (chat A1 host, PROGRAM.md §3.6: frozen once A1
 * merges, its slots the integrator's): every page and pane that shows a
 * channel, a DM or a group shows it in one. It streams the conversation while
 * it's shown (lib/realtime, counted per surface) and gives its composer the
 * conversation to write to (ComposerHost).
 *
 * Step 1 (A1): it holds today's per-kind view (ChannelView, ChatView,
 * GroupChatView) as its child; CHAT-A1B moves them in, and the per-kind views
 * go. New conversation behaviour belongs here, not in a per-kind view
 * (app/chatStacks.test.ts refuses new imports of their internals). A DM's
 * conversation is null until who reads it is known: its view shows as it
 * always did meanwhile.
 */
export function ConversationView({ conversation, children }: { conversation: ConversationRef | null; children: ReactNode }) {
    useConversationStream(conversation)
    // Always the host, null target or not: a DM's becoming known never remounts its view.
    return <ComposerHost target={conversation}>{children}</ComposerHost>
}

/** The DM with other for the person signed in, or null until they're known. */
export function useDmConversation(other: string): ConversationRef | null {
    const self = useFetchOnlyOnce<UserProfileInterface>(GetEndpointUrl.SelfProfile).data?.data?.user_uuid
    return dmWith(other, self)
}
