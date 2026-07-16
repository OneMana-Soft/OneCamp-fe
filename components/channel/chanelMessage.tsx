"use client"

import { useCallback } from "react"
import { usePathname } from "next/navigation"
import { useDispatch } from "react-redux"
import { BaseMessageCard, mapPostsResToBaseMessage } from "@/components/message/baseMessageCard"
import { GetEndpointUrl } from "@/services/endPoints"
import { openUI } from "@/store/slice/uiSlice"
import { setChannelReplyTarget } from "@/store/slice/channelSlice"
import { htmlToPreviewText } from "@/lib/utils/htmlToPreviewText"
import type { PostsRes } from "@/types/post"

interface ChannelMessageProps {
  postInfo: PostsRes
  isAdmin?: boolean
  addReaction: (emojiId: string, reactionId: string) => void
  removeReaction: (reactionId: string) => void
  removePost: () => void
  updatePost: (body: string) => void
  priority?: boolean
}

export const ChannelMessage = ({ updatePost, postInfo, addReaction, removeReaction, isAdmin, removePost, priority }: ChannelMessageProps) => {
  const channelId = usePathname().split("/")[3]
  const dispatch = useDispatch()

  const handleUserClick = useCallback(() => {
    dispatch(openUI({ key: "otherUserProfile", data: { userUUID: postInfo.post_by.user_uuid } }))
  }, [dispatch, postInfo.post_by.user_uuid])

  const handleReply = useCallback(() => {
    if (!postInfo.post_uuid) return
    dispatch(
      setChannelReplyTarget({
        channelId,
        uuid: postInfo.post_uuid,
        authorName: postInfo.post_by.user_name,
        text: htmlToPreviewText(postInfo.post_text),
      }),
    )
  }, [dispatch, channelId, postInfo.post_uuid, postInfo.post_by.user_name, postInfo.post_text])

  return (
    <BaseMessageCard
      message={mapPostsResToBaseMessage(postInfo)}
      mediaGetUrl={GetEndpointUrl.GetChannelMedia + "/" + channelId}
      analyzeContext={{ srcKey: "channel", srcRef: channelId }}
      rightPanelConfig={{ channelUUID: channelId, postUUID: postInfo.post_uuid || "", chatMessageUUID: "", chatUUID: "", taskUUID: "", groupUUID: "", docUUID: "" }}
      hoverOptionsConfig={{ channelUUID: channelId, postUUID: postInfo.post_uuid }}
      isAdmin={isAdmin}
      addReaction={addReaction}
      removeReaction={removeReaction}
      removePost={removePost}
      updatePost={updatePost}
      priority={priority}
      onAvatarClick={handleUserClick}
      onReply={handleReply}
    />
  )
}
