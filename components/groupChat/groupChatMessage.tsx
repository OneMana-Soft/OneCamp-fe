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
  grpId: string
  priority?: boolean
}

export const GroupChatMessage = ({ updatePost, grpId, chatInfo, addReaction, removeReaction, isAdmin, removePost, priority }: ChatMessageProps) => (
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
  />
)
