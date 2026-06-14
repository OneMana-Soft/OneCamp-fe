"use client"

import { ChannelMessageAvatar } from "@/components/channel/channelMessageAvatar"
import { formatTimeForPostOrComment } from "@/lib/utils/date/formatTimeForPostOrComment"
import { cn } from "@/lib/utils/helpers/cn"
import { Check, X } from "@/lib/icons";
import MinimalTiptapTextInput from "@/components/textInput/textInput"
import React, { useCallback, useMemo, useRef, useState } from "react"
import { MessagePreview } from "@/components/message/MessagePreview"
import { MessageDesktopHoverOptionsForMainChatAndChannel } from "@/components/MessageDesktopHover/messageDesktopHoverOptionsForMainChatAndChannel"
import type { UserProfileDataInterface, UserProfileInterface, UserSelectedOptionInterface } from "@/types/user"
import { useFetchOnlyOnce } from "@/hooks/useFetch"
import { GetEndpointUrl } from "@/services/endPoints"
import { BottomMenu } from "@/components/message/bottomMenu"
import { MessageAttachments } from "@/components/message/MessageAttachments"
import { useDispatch } from "react-redux"
import { openUI } from "@/store/slice/uiSlice"
import type { AttachmentMediaReq } from "@/types/attachment"
import { MessageReplyCount } from "@/components/message/messageReplyCount"
import { openRightPanel } from "@/store/slice/desktopRightPanelSlice"
import { LocalizedErrorBoundary } from "@/components/error/LocalizedErrorBoundary"

interface RightPanelConfig {
  chatUUID?: string
  channelUUID?: string
  postUUID?: string
  chatMessageUUID?: string
  taskUUID?: string
  groupUUID?: string
  docUUID?: string
  eventUUID?: string
  aiChatOpen?: boolean
  docAiOpen?: boolean
  docAiData?: {
    selectedText: string
    docId: string
    surroundingContext?: string
    initialAction?: string
  }
  viewStartDate?: string
  viewEndDate?: string
}
import { useUserInfoState } from "@/hooks/useUserInfoState"
import type { GroupedReaction } from "@/types/reaction"
import type { CommentInfoInterface } from "@/types/comment"
import type { ChatInfo } from "@/types/chat"
import type { PostsRes } from "@/types/post"

export interface NormalizedForwardMessage {
  from: UserProfileDataInterface
  text: string
  channelName?: string
  channelUUID?: string
  uuid: string
  createdAt: string
}

export interface BaseMessage {
  uuid: string
  bodyText: string
  from: UserProfileDataInterface
  createdAt: string
  reactions?: GroupedReaction[]
  attachments?: AttachmentMediaReq[]
  comments?: CommentInfoInterface[]
  commentCount?: number
  fwdMsgPost?: NormalizedForwardMessage
  fwdMsgChat?: NormalizedForwardMessage
}

export function mapChatInfoToBaseMessage(chatInfo: ChatInfo): BaseMessage {
  return {
    uuid: chatInfo.chat_uuid,
    bodyText: chatInfo.chat_body_text,
    from: chatInfo.chat_from,
    createdAt: chatInfo.chat_created_at,
    reactions: chatInfo.chat_reactions,
    attachments: chatInfo.chat_attachments,
    comments: chatInfo.chat_comments,
    commentCount: chatInfo.chat_comment_count,
    fwdMsgPost: chatInfo.chat_fwd_msg_post
      ? {
          from: chatInfo.chat_fwd_msg_post.post_by,
          text: chatInfo.chat_fwd_msg_post.post_text,
          channelName: chatInfo.chat_fwd_msg_post.post_channel?.ch_name,
          channelUUID: chatInfo.chat_fwd_msg_post.post_channel?.ch_uuid,
          uuid: chatInfo.chat_fwd_msg_post.post_uuid,
          createdAt: chatInfo.chat_fwd_msg_post.post_created_at,
        }
      : undefined,
    fwdMsgChat: chatInfo.chat_fwd_msg_chat
      ? {
          from: chatInfo.chat_fwd_msg_chat.chat_from,
          text: chatInfo.chat_fwd_msg_chat.chat_body_text,
          uuid: chatInfo.chat_fwd_msg_chat.chat_uuid,
          createdAt: chatInfo.chat_fwd_msg_chat.chat_created_at,
        }
      : undefined,
  }
}

export function mapPostsResToBaseMessage(postInfo: PostsRes): BaseMessage {
  return {
    uuid: postInfo.post_uuid,
    bodyText: postInfo.post_text,
    from: postInfo.post_by,
    createdAt: postInfo.post_created_at,
    reactions: postInfo.post_reactions,
    attachments: postInfo.post_attachments,
    comments: postInfo.post_comments,
    commentCount: postInfo.post_comment_count,
    fwdMsgPost: postInfo.post_fwd_msg_post
      ? {
          from: postInfo.post_fwd_msg_post.post_by,
          text: postInfo.post_fwd_msg_post.post_text,
          channelName: postInfo.post_fwd_msg_post.post_channel?.ch_name,
          channelUUID: postInfo.post_fwd_msg_post.post_channel?.ch_uuid,
          uuid: postInfo.post_fwd_msg_post.post_uuid,
          createdAt: postInfo.post_fwd_msg_post.post_created_at,
        }
      : undefined,
    fwdMsgChat: postInfo.post_fwd_msg_chat
      ? {
          from: postInfo.post_fwd_msg_chat.chat_from,
          text: postInfo.post_fwd_msg_chat.chat_body_text,
          uuid: postInfo.post_fwd_msg_chat.chat_uuid,
          createdAt: postInfo.post_fwd_msg_chat.chat_created_at,
        }
      : undefined,
  }
}

export interface BaseMessageCardProps {
  message: BaseMessage
  mediaGetUrl: string
  rightPanelConfig: RightPanelConfig
  hoverOptionsConfig: {
    chatUUID?: string
    groupUUID?: string
    chatGrpID?: string
    chatMessageID?: string
    channelUUID?: string
    postUUID?: string
  }
  isAdmin?: boolean
  addReaction: (emojiId: string, reactionId: string) => void
  removeReaction: (reactionId: string) => void
  removePost: () => void
  updatePost: (body: string) => void
  priority?: boolean
  showErrorBoundary?: boolean
  onAvatarClick?: () => void
}

export const BaseMessageCard = React.memo(({
  message,
  mediaGetUrl,
  rightPanelConfig,
  hoverOptionsConfig,
  isAdmin,
  addReaction,
  removeReaction,
  removePost,
  updatePost,
  priority,
  showErrorBoundary = false,
  onAvatarClick,
}: BaseMessageCardProps) => {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false)
  const [isEmojiPickerOpen, setIsEmojiPickerOpen] = useState(false)
  const [isMessageEditEnabled, setIsMessageEditEnabled] = useState(false)
  const [updatedText, setUpdatedText] = useState<string>(message.bodyText || "")
  // Mirror updatedText into a ref so the synchronous flush triggered when
  // the user clicks Save / presses Enter (which updates state via the
  // editor's onChange) is observable inside the same tick by the
  // handleEditComplete callback below. Without this, fast Save clicks
  // could persist the previous keystroke instead of the latest one.
  const updatedTextRef = useRef<string>(message.bodyText || "")

  const selfProfile = useFetchOnlyOnce<UserProfileInterface>(GetEndpointUrl.SelfProfile)
  const dispatch = useDispatch()

  const userInfoState = useUserInfoState(message.from.user_uuid)

  const reactions = useMemo(() => {
    const r: { [key: string]: string[] } = {}
    if (message.reactions) {
      message.reactions.forEach((reaction) => {
        if (!r[reaction.reaction_emoji_id]) {
          r[reaction.reaction_emoji_id] = []
        }
        if (reaction.reaction_added_by?.user_name) {
          r[reaction.reaction_emoji_id].push(reaction.reaction_added_by.user_name)
        }
      })
    }
    return r
  }, [message.reactions])

  const userSelectedOption = useMemo(() => {
    if (!selfProfile.data?.data || !message.reactions) return {} as UserSelectedOptionInterface

    const reaction = message.reactions.find(
      (r) => r.reaction_added_by?.user_uuid === selfProfile.data?.data.user_uuid,
    )
    if (reaction) {
      return {
        reactionId: reaction.uid,
        emojiId: reaction.reaction_emoji_id,
      }
    }
    return {} as UserSelectedOptionInterface
  }, [message.reactions, selfProfile.data?.data])

  const handleEmojiClick = useCallback(
    (emojiId: string) => {
      if (userSelectedOption.emojiId === emojiId) {
        removeReaction(userSelectedOption.reactionId)
        return
      }
      addReaction(emojiId, userSelectedOption.reactionId)
    },
    [userSelectedOption, addReaction, removeReaction],
  )

  const handleUserClick = useCallback(() => {
    dispatch(openUI({ key: "otherUserProfile", data: { userUUID: message.from.user_uuid } }))
  }, [dispatch, message.from.user_uuid])

  const handleSelectAttachment = useCallback(
    (attachment: AttachmentMediaReq) => {
      if (message.attachments) {
        dispatch(
          openUI({
            key: "attachmentLightbox",
            data: { allMedia: message.attachments, media: attachment, mediaGetUrl },
          }),
        )
      }
    },
    [message.attachments, mediaGetUrl, dispatch],
  )

  const handleOpenThread = useCallback(() => {
    dispatch(openRightPanel(rightPanelConfig))
  }, [dispatch, rightPanelConfig])

  const handleEditComplete = useCallback(() => {
    // Read from the ref so we capture any synchronous flush that happened
    // when the user clicked Save (the editor's flushPendingChange runs
    // setUpdatedText, which is queued; the ref is set inline).
    updatePost(updatedTextRef.current)
    setIsMessageEditEnabled(false)
    setIsDropdownOpen(false)
  }, [updatePost])

  const handleEditCancel = useCallback(() => {
    setIsMessageEditEnabled(false)
    setIsDropdownOpen(false)
  }, [])

  const editor = (
    <MinimalTiptapTextInput
      throttleDelay={300}
      isOutputText={!isMessageEditEnabled}
      className={cn("max-w-full h-auto", isMessageEditEnabled && "mt-1 mb-2")}
      editorContentClassName="overflow-auto mb-2"
      output="html"
      content={message.bodyText}
      placeholder="Edit message..."
      editable={isMessageEditEnabled}
      PrimaryButtonIcon={Check}
      buttonOnclick={handleEditComplete}
      SecondaryButtonIcon={X}
      secondaryButtonOnclick={handleEditCancel}
      editorClassName="focus:outline-none "
      onChange={(content) => {
        const s = content as string
        updatedTextRef.current = s
        setUpdatedText(s)
      }}
    />
  )

  return (
    <div
      className={cn(
        "group relative flex gap-3 px-4 py-2.5",
        "transition-colors duration-100",
        "hover:bg-accent/40",
        (isDropdownOpen || isEmojiPickerOpen) && "bg-accent/40",
      )}
    >
        {!isMessageEditEnabled && (
          <div
            className={cn(
              "absolute right-3 top-1.5 z-10 transition-opacity duration-150",
              isDropdownOpen || isEmojiPickerOpen
                ? "opacity-100"
                : "opacity-0 group-hover:opacity-100 focus-within:opacity-100",
            )}
          >
            <MessageDesktopHoverOptionsForMainChatAndChannel
              editMessage={() => setIsMessageEditEnabled(true)}
              deleteMessage={removePost}
              isOwner={message.from.user_uuid === selfProfile.data?.data.user_uuid}
              isAdmin={isAdmin}
              setEmojiPopupState={setIsEmojiPickerOpen}
              onReactionSelect={handleEmojiClick}
              setIsDropdownOpen={setIsDropdownOpen}
              messageText={message.bodyText}
              {...hoverOptionsConfig}
            />
          </div>
        )}
        <div className="h-9 w-9 shrink-0 mt-0.5" onClick={onAvatarClick}>
          <ChannelMessageAvatar
            userName={userInfoState?.userName || message.from.user_name}
            userProfileKey={userInfoState?.profileKey ?? message.from.user_profile_object_key}
          />
        </div>
        <div className="flex-1 min-w-0">
          {!isMessageEditEnabled && (
            <div className="flex items-baseline gap-2">
              <button
                type="button"
                onClick={handleUserClick}
                className="text-sm font-semibold text-foreground hover:underline truncate focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 rounded"
              >
                {userInfoState?.userName || message.from.user_name}
              </button>
              <span className="text-[11px] tabular-nums text-muted-foreground">
                {formatTimeForPostOrComment(message.createdAt, true)}
              </span>
            </div>
          )}
          <div className="break-words w-full">
            {showErrorBoundary ? (
              <LocalizedErrorBoundary
                fallbackTitle="Editor Error"
                fallbackDescription="The rich text editor encountered an issue."
              >
                {editor}
              </LocalizedErrorBoundary>
            ) : (
              editor
            )}
          </div>

          {(message.fwdMsgPost || message.fwdMsgChat) && !isMessageEditEnabled && (
            <MessagePreview
              msgBy={message.fwdMsgPost?.from || message.fwdMsgChat?.from}
              msgText={message.fwdMsgPost?.text || message.fwdMsgChat?.text || ""}
              msgChannelName={message.fwdMsgPost?.channelName}
              msgChannelUUID={message.fwdMsgPost?.channelUUID}
              msgUUID={message.fwdMsgPost?.uuid || message.fwdMsgChat?.uuid}
              msgCreatedAt={message.fwdMsgPost?.createdAt || message.fwdMsgChat?.createdAt}
              vewFooter={true}
            />
          )}

          {!isMessageEditEnabled && message.attachments && message.attachments.length > 0 && (
            <MessageAttachments
              priority={priority}
              attachmentSelected={handleSelectAttachment}
              attachments={message.attachments}
              mediaGetUrl={mediaGetUrl}
            />
          )}

          {message.comments && message.commentCount && (
            <div className="mt-1.5">
              <MessageReplyCount
                openDesktopThread={handleOpenThread}
                replyCount={message.commentCount}
                lastCommentCreatedAt={message.comments[message.comments.length - 1].comment_created_at}
                participants={message.comments
                  .slice()
                  .reverse()
                  .map((c) => ({
                    uuid: c.comment_by?.user_uuid || "",
                    name: c.comment_by?.user_name || "",
                    profileKey: c.comment_by?.user_profile_object_key,
                  }))}
              />
            </div>
          )}

          {!isMessageEditEnabled && (
            <BottomMenu
              handleEmojiClick={handleEmojiClick}
              reactions={reactions}
              selectedEmojiId={userSelectedOption.emojiId}
            />
          )}
        </div>
    </div>
  )
})

BaseMessageCard.displayName = "BaseMessageCard"
