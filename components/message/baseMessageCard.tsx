"use client"

import { ChannelMessageAvatar } from "@/components/channel/channelMessageAvatar"
import { formatTimeForPostOrComment } from "@/lib/utils/date/formatTimeForPostOrComment"
import { cn } from "@/lib/utils/helpers/cn"
import { PrincipalTag } from "@/components/ui/principalTag"
import { Check, X, Languages, Loader2 } from "@/lib/icons";
import MinimalTiptapTextInput from "@/components/textInput/textInput"
import { useTranslateText } from "@/services/aiService"
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
import { AgentResultCards } from "@/components/message/AgentResultCards"
import { openRightPanel } from "@/store/slice/desktopRightPanelSlice"
import { LocalizedErrorBoundary } from "@/components/error/LocalizedErrorBoundary"
import { useInternalLinkRouter } from "@/lib/utils/useInternalLinkRouter"
import { messageDomId, scrollToMessage } from "@/lib/utils/scrollToMessage"

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
  // replyTo is the Discord-style inline reply parent (same shape as a forward
  // preview, reused). One level deep.
  replyTo?: NormalizedForwardMessage
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
    replyTo: chatInfo.chat_reply_to
      ? {
          from: chatInfo.chat_reply_to.chat_from,
          text: chatInfo.chat_reply_to.chat_body_text,
          uuid: chatInfo.chat_reply_to.chat_uuid,
          createdAt: chatInfo.chat_reply_to.chat_created_at,
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
    replyTo: postInfo.post_reply_to
      ? {
          from: postInfo.post_reply_to.post_by,
          text: postInfo.post_reply_to.post_text,
          uuid: postInfo.post_reply_to.post_uuid,
          createdAt: postInfo.post_reply_to.post_created_at,
        }
      : undefined,
  }
}

export interface BaseMessageCardProps {
  message: BaseMessage
  mediaGetUrl: string
  // Optional source context that enables the "Analyze with AI" action in the
  // attachment lightbox. srcRef is the identifier the FE already holds
  // (channel uuid, the other user's uuid for a DM, or the group id); the
  // server resolves it to the real src_value and enforces access. Omitted for
  // surfaces the vision backend doesn't support (task/project/profile).
  analyzeContext?: { srcKey: string; srcRef: string }
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
  // Discord-style inline reply: when provided, a "Reply" action appears in the
  // hover menu and arms the composer to reply to this message. Omitted on
  // surfaces without a composer (e.g. thread/right-panel previews).
  onReply?: () => void
}

export const BaseMessageCard = React.memo(({
  message,
  mediaGetUrl,
  analyzeContext,
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
  onReply,
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

  // Route internal /app deep links (e.g. AI citation footers) through client
  // navigation. Disabled while editing so link clicks edit text as usual.
  const handleInternalLinkClick = useInternalLinkRouter(!isMessageEditEnabled)

  const userInfoState = useUserInfoState(message.from.user_uuid)

  // Inline AI translation (Notion/Slack-style). One click translates the
  // message into the viewer's browser language and shows it beneath the
  // original, with a toggle back to the source text. State is per-card; the
  // translate call is governed server-side (member's model, limits, residency).
  const { translateText, isSubmitting: translating } = useTranslateText()
  const [translation, setTranslation] = useState<string | null>(null)
  const [showTranslation, setShowTranslation] = useState(false)
  const handleTranslate = useCallback(async () => {
    // Toggle if we already have a translation for this message.
    if (translation) {
      setShowTranslation((v) => !v)
      return
    }
    const text = (message.bodyText || "").trim()
    if (!text) return
    const target = typeof navigator !== "undefined" ? navigator.language : "English"
    const res = await translateText(text, target)
    if (res?.translation) {
      setTranslation(res.translation)
      setShowTranslation(true)
    }
  }, [translation, message.bodyText, translateText])

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
            data: { allMedia: message.attachments, media: attachment, mediaGetUrl, analyzeContext },
          }),
        )
      }
    },
    [message.attachments, mediaGetUrl, analyzeContext, dispatch],
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
      id={messageDomId(message.uuid)}
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
              onReply={onReply}
              onTranslate={message.bodyText ? handleTranslate : undefined}
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
              {message.from.is_bot && (
                <PrincipalTag kind="ai" />
              )}
              <span className="text-[11px] tabular-nums text-muted-foreground">
                {formatTimeForPostOrComment(message.createdAt, true)}
              </span>
            </div>
          )}
          {message.replyTo && !isMessageEditEnabled && (
            <button
              type="button"
              onClick={() => scrollToMessage(message.replyTo?.uuid)}
              className="mb-1 block w-full border-l-2 border-primary/40 pl-2 text-left transition-colors hover:border-primary rounded-sm"
              aria-label="Jump to replied message"
            >
              <MessagePreview
                msgBy={message.replyTo.from}
                msgText={message.replyTo.text}
                msgUUID={message.replyTo.uuid}
                msgCreatedAt={message.replyTo.createdAt}
                vewFooter={false}
              />
            </button>
          )}
          <div className="break-words w-full" onClickCapture={handleInternalLinkClick}>
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

          {/* Inline AI translation: shown beneath the original, with a toggle
              back to the source text. Plain text (the model returns prose). */}
          {!isMessageEditEnabled && (translating || (translation && showTranslation)) && (
            <div className="mt-1.5 rounded-md border border-primary/20 bg-primary/5 px-3 py-2">
              <div className="mb-0.5 flex items-center gap-1.5 text-[11px] font-medium text-primary">
                <Languages className="h-3 w-3" />
                {translating ? "Translating…" : "Translated"}
                {translation && !translating && (
                  <button
                    type="button"
                    onClick={() => setShowTranslation(false)}
                    className="ml-1 text-muted-foreground underline-offset-2 hover:underline"
                  >
                    Show original
                  </button>
                )}
              </div>
              {translating && !translation ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
              ) : (
                <p className="whitespace-pre-line text-sm text-foreground">{translation}</p>
              )}
            </div>
          )}
          {!isMessageEditEnabled && translation && !showTranslation && (
            <button
              type="button"
              onClick={() => setShowTranslation(true)}
              className="mt-1 text-[11px] font-medium text-primary underline-offset-2 hover:underline"
            >
              Show translation
            </button>
          )}

          {/* Additive PR/branch result cards for AI-teammate messages — turns a
              raw GitHub link (a code-PR result) into a clean, clickable card
              without touching the rich-text render. No-op for humans and for
              messages with no GitHub result link. */}
          {message.from.is_bot && !isMessageEditEnabled && (
            <AgentResultCards text={message.bodyText} />
          )}

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
