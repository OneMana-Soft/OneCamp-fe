"use client"

import { useCallback } from "react"
import { useDispatch } from "react-redux"
import { BaseMessageCard, mapChatInfoToBaseMessage } from "@/components/message/baseMessageCard"
import { GetEndpointUrl } from "@/services/endPoints"
import { setGroupChatReplyTarget } from "@/store/slice/groupChatSlice"
import { htmlToPreviewText } from "@/lib/utils/htmlToPreviewText"
import type { ChatInfo } from "@/types/chat"

interface ChatMessageProps {
  chatInfo: ChatInfo
  isAdmin?: boolean
  addReaction: (emojiId: string, reactionId: string) => void
  removeReaction: (reactionId: string) => void
  removePost: () => void
  updatePost: (body: string) => void
  grpId: string
  priority?: boolean
}

export const GroupChatMessage = ({ updatePost, grpId, chatInfo, addReaction, removeReaction, isAdmin, removePost, priority }: ChatMessageProps) => {
  const dispatch = useDispatch()

  const handleReply = useCallback(() => {
    if (!chatInfo.chat_uuid) return
    dispatch(
      setGroupChatReplyTarget({
        grpId,
        uuid: chatInfo.chat_uuid,
        authorName: chatInfo.chat_from?.user_name || "",
        text: htmlToPreviewText(chatInfo.chat_body_text),
      }),
    )
  }, [dispatch, grpId, chatInfo.chat_uuid, chatInfo.chat_from?.user_name, chatInfo.chat_body_text])

  return (
    <BaseMessageCard
      message={mapChatInfoToBaseMessage(chatInfo)}
      mediaGetUrl={GetEndpointUrl.GetGroupChatMedia + "/" + grpId}
      analyzeContext={{ srcKey: "grpChat", srcRef: grpId }}
      rightPanelConfig={{ chatMessageUUID: chatInfo.chat_uuid, groupUUID: grpId, chatUUID: "", channelUUID: "", postUUID: "", taskUUID: "", docUUID: "" }}
      hoverOptionsConfig={{ groupUUID: grpId, chatMessageID: chatInfo.chat_uuid }}
      isAdmin={isAdmin}
      addReaction={addReaction}
      removeReaction={removeReaction}
      removePost={removePost}
      updatePost={updatePost}
      priority={priority}
      onReply={handleReply}
    />
  )
}
