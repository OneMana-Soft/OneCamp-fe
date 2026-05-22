"use client"

import React from "react"
import { usePathname } from "next/navigation"
import { BaseMessageCard, mapChatInfoToBaseMessage } from "@/components/message/baseMessageCard"
import { GetEndpointUrl } from "@/services/endPoints"
import type { ChatInfo } from "@/types/chat"

interface ChatMessageProps {
  chatInfo: ChatInfo
  isAdmin?: boolean
  addReaction: (emojiId: string, reactionId: string) => void
  removeReaction: (reactionId: string) => void
  removePost: () => void
  updatePost: (body: string) => void
  priority?: boolean
}

export const ChatMessage = React.memo(({ updatePost, chatInfo, addReaction, removeReaction, isAdmin, removePost, priority }: ChatMessageProps) => {
  const otherUserUUID = usePathname().split("/")[3]

  return (
    <BaseMessageCard
      message={mapChatInfoToBaseMessage(chatInfo)}
      mediaGetUrl={GetEndpointUrl.GetChatMedia + "/" + otherUserUUID}
      rightPanelConfig={{ chatMessageUUID: chatInfo.chat_uuid, chatUUID: otherUserUUID, channelUUID: "", postUUID: "", taskUUID: "", groupUUID: "", docUUID: "" }}
      hoverOptionsConfig={{ chatUUID: otherUserUUID, chatMessageID: chatInfo.chat_uuid }}
      isAdmin={isAdmin}
      addReaction={addReaction}
      removeReaction={removeReaction}
      removePost={removePost}
      updatePost={updatePost}
      priority={priority}
      showErrorBoundary={true}
    />
  )
})

ChatMessage.displayName = "ChatMessage"
