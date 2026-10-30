"use client"

import { ChatRows, type DrawChatMessage } from "@/components/conversation/ChatRows"
import type { ConversationList } from "@/components/conversation/ConversationMessages"
import type { ConversationRowsProps } from "@/components/conversation/ConversationRows"
import { GroupChatMessage } from "@/components/groupChat/groupChatMessage"
import { GroupChatMessageMobile } from "@/components/groupChat/groupChatMessageMobile"
import { GroupChatTypingBar } from "@/components/typingIndicator/typingIndicatorBar"
import type { ChatInfo } from "@/types/chat"

const drawGroup: DrawChatMessage = (chat, act, { priority, continued, arrived }, isMobile, conversation) => isMobile
    ? <GroupChatMessageMobile chatInfo={chat} grpId={conversation.id} addReaction={act.addReaction} removeReaction={act.removeReaction} removeChat={act.remove} updateChat={act.save} priority={priority} continued={continued} arrived={arrived} />
    : <GroupChatMessage chatInfo={chat} grpId={conversation.id} addReaction={act.addReaction} removeReaction={act.removeReaction} removePost={act.remove} updatePost={act.save} priority={priority} continued={continued} arrived={arrived} />

/** A group's rows: a chat's rows (components/conversation/ChatRows) drawing a group's messages. */
function GroupRows(props: ConversationRowsProps<ChatInfo>) {
    return <ChatRows {...props} draw={drawGroup} />
}

/** A group's list (components/conversation/ConversationMessages); a page makes it once per group (useMemo). Pure. */
export function groupList(grpId: string): ConversationList<ChatInfo> {
    return {
        ref: { kind: "group", id: grpId },
        subject: "this conversation",
        Rows: GroupRows,
        typing: <GroupChatTypingBar grpId={grpId} />,
    }
}
