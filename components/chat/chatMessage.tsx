"use client"

import React, { useCallback } from "react"
import { usePathname } from "next/navigation"
import { useDispatch } from "react-redux"
import { BaseMessageCard, mapChatInfoToBaseMessage } from "@/components/message/baseMessageCard"
import { GetEndpointUrl } from "@/services/endPoints"
import { getGroupingId } from "@/lib/utils/getGroupingId"
import { useFetchOnlyOnce } from "@/hooks/useFetch"
import { setChatReplyTarget } from "@/store/slice/chatSlice"
import { htmlToPreviewText } from "@/lib/utils/htmlToPreviewText"
import type { UserProfileInterface } from "@/types/user"
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
  const dispatch = useDispatch()
  const selfProfile = useFetchOnlyOnce<UserProfileInterface>(GetEndpointUrl.SelfProfile)
  const selfUUID = selfProfile?.data?.data?.user_uuid || ""
  // DM memory scope is the grouping id (sorted pair of user uuids), matching
  // how DM content is scoped server-side.
  const chatGrpID = selfUUID && otherUserUUID ? getGroupingId(otherUserUUID, selfUUID) : ""

  const handleReply = useCallback(() => {
    if (!chatInfo.chat_uuid) return
    dispatch(
      setChatReplyTarget({
        chatUUID: otherUserUUID,
        uuid: chatInfo.chat_uuid,
        authorName: chatInfo.chat_from?.user_name || "",
        text: htmlToPreviewText(chatInfo.chat_body_text),
      }),
    )
  }, [dispatch, otherUserUUID, chatInfo.chat_uuid, chatInfo.chat_from?.user_name, chatInfo.chat_body_text])

  return (
    <BaseMessageCard
      message={mapChatInfoToBaseMessage(chatInfo)}
      mediaGetUrl={GetEndpointUrl.GetChatMedia + "/" + otherUserUUID}
      analyzeContext={{ srcKey: "chat", srcRef: otherUserUUID }}
      rightPanelConfig={{ chatMessageUUID: chatInfo.chat_uuid, chatUUID: otherUserUUID, channelUUID: "", postUUID: "", taskUUID: "", groupUUID: "", docUUID: "" }}
      hoverOptionsConfig={{ chatUUID: otherUserUUID, chatMessageID: chatInfo.chat_uuid, chatGrpID }}
      isAdmin={isAdmin}
      addReaction={addReaction}
      removeReaction={removeReaction}
      removePost={removePost}
      updatePost={updatePost}
      priority={priority}
      showErrorBoundary={true}
      onReply={handleReply}
    />
  )
})

ChatMessage.displayName = "ChatMessage"
