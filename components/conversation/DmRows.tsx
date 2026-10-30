"use client"

import { useMemo } from "react"
import { ChatMessage } from "@/components/chat/chatMessage"
import { ChatMessageMobile } from "@/components/chat/chatMessageMobile"
import { ChatRows, type DrawChatMessage } from "@/components/conversation/ChatRows"
import type { ConversationList } from "@/components/conversation/ConversationMessages"
import type { ConversationRowsProps } from "@/components/conversation/ConversationRows"
import { ChatTypingBar } from "@/components/typingIndicator/typingIndicatorBar"
import { useFetchOnlyOnce } from "@/hooks/useFetch"
import { dmWith } from "@/lib/conversation/route"
import type { ConversationRef } from "@/lib/conversation/types"
import { GetEndpointUrl } from "@/services/endPoints"
import type { ChatInfo } from "@/types/chat"
import type { UserProfileInterface } from "@/types/user"

const drawDm: DrawChatMessage = (chat, act, { priority, continued, arrived }, isMobile) => isMobile
    ? <ChatMessageMobile chatInfo={chat} addReaction={act.addReaction} removeReaction={act.removeReaction} removeChat={act.remove} updateChat={act.save} priority={priority} continued={continued} arrived={arrived} />
    : <ChatMessage chatInfo={chat} addReaction={act.addReaction} removeReaction={act.removeReaction} removePost={act.remove} updatePost={act.save} priority={priority} continued={continued} arrived={arrived} />

/** A DM's rows: a chat's rows (components/conversation/ChatRows) drawing a DM's messages. */
function DmRows(props: ConversationRowsProps<ChatInfo>) {
    return <ChatRows {...props} draw={drawDm} />
}

/** A DM's list (components/conversation/ConversationMessages), for its ref (lib/conversation/route dmWith). Pure. */
export function dmList(ref: Extract<ConversationRef, { kind: "dm" }>): ConversationList<ChatInfo> {
    return {
        ref,
        subject: "this conversation",
        Rows: DmRows,
        typing: <ChatTypingBar chatId={ref.other} />,
    }
}

/** The list of the DM with other for the person signed in, made once per DM; null until they're known. */
export function useDmList(other: string): ConversationList<ChatInfo> | null {
    const self = useFetchOnlyOnce<UserProfileInterface>(GetEndpointUrl.SelfProfile).data?.data?.user_uuid
    return useMemo(() => {
        const ref = dmWith(other, self)
        return ref && dmList(ref)
    }, [other, self])
}
