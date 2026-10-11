"use client"

import { useProfileHover } from "@/hooks/useProfileHover"
import { displayNameOf } from "@/lib/personName"
import { ChannelMessageAvatar } from "@/components/channel/channelMessageAvatar"
import { formatFullTimestamp, isoTimestamp } from "@/lib/utils/date/formatTimeForPostOrComment"
import { cn } from "@/lib/utils/helpers/cn"
import { BotTag } from "@/components/ui/botTag"
import { PrincipalTag } from "@/components/ui/principalTag"
import { useRelayedAuthor } from "@/hooks/useRelayedAuthor"
import { RelayedAvatar } from "@/components/message/relayedAvatar"
import { Languages, Loader2 } from "@/lib/icons";
import { Button } from "@/components/ui/button";
import MinimalTiptapTextInput from "@/components/textInput/textInput"
import { useTranslateText } from "@/services/aiService"
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useTouchReveal } from "@/hooks/useTouchReveal"
import { MessagePreview } from "@/components/message/MessagePreview"
import { MessageDesktopHoverOptionsForMainChatAndChannel } from "@/components/MessageDesktopHover/messageDesktopHoverOptionsForMainChatAndChannel"
import type { UserProfileDataInterface, UserProfileInterface, UserSelectedOptionInterface } from "@/types/user"
import { useFetchOnlyOnce } from "@/hooks/useFetch"
import { GetEndpointUrl } from "@/services/endPoints"
import { BottomMenu } from "@/components/message/bottomMenu"
import { MessageAttachments } from "@/components/message/MessageAttachments"
import { ContinuedGutter } from "@/components/message/continuedGutter"
import { useDispatch, useSelector } from "react-redux"
import { openUI } from "@/store/slice/uiSlice"
import type { AttachmentMediaReq } from "@/types/attachment"
import { MessageReplyCount } from "@/components/message/messageReplyCount"
import { replyParticipants, ThreadParticipants } from "@/components/message/threadParticipants"
import { useBotKind, useBotKindMap } from "@/hooks/useBotKinds"
import { AgentResultCards } from "@/components/message/AgentResultCards"
import { WorkLinkCards } from "@/components/message/WorkLinkCards"
import { openRightPanel } from "@/store/slice/desktopRightPanelSlice"
import { useInternalLinkRouter } from "@/lib/utils/useInternalLinkRouter"
import { messageDomId, scrollToMessage } from "@/lib/utils/scrollToMessage"
import { FailedMark, SendStatus, SendingNote } from "@/components/message/sendStatus"
import { usePrimeActions } from "@/components/message/primeActions"
import type { SendState } from "@/lib/chat/pendingSend"
import { chatClock } from "@/lib/chat/clock"
import { isAIBot } from "@/lib/botCopy"
import { agentIdsOf, mentionsUser, type MentionContext } from "@/components/message/tintMentions"
import { AgentProvenance, type AgentAsker } from "@/components/message/agentProvenance"
import { ReplyLine } from "@/components/message/replyLine"
import { isEmojiOnly } from "@/lib/chat/emojiOnly"
import type { RootState } from "@/store/store"

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
import { messageAuthorName } from "@/lib/utils/userDisplayName"

interface NormalizedForwardMessage {
  from: UserProfileDataInterface
  text: string
  channelName?: string
  channelUUID?: string
  uuid: string
  createdAt: string
}

export interface BaseMessage {
  uuid: string
  /** Sent from here and not yet confirmed (lib/chat/pendingSend). */
  sendState?: SendState
  /** The id it was sent with, for Try again, Edit and Delete. */
  localId?: string
  bodyText: string
  from: UserProfileDataInterface
  createdAt: string
  /** When it was last edited, if the server or this tab knows. */
  updatedAt?: string
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
    sendState: chatInfo.chat_send_state,
    localId: chatInfo.chat_local_id,
    bodyText: chatInfo.chat_body_text,
    from: chatInfo.chat_from,
    createdAt: chatInfo.chat_created_at,
    updatedAt: chatInfo.chat_updated_at,
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
    sendState: postInfo.post_send_state,
    localId: postInfo.post_local_id,
    bodyText: postInfo.post_text,
    from: postInfo.post_by,
    createdAt: postInfo.post_created_at,
    updatedAt: postInfo.post_updated_at,
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

interface BaseMessageCardProps {
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
  /** @deprecated every row has its own boundary now (RowBoundary, in the list). */
  showErrorBoundary?: boolean
  onAvatarClick?: () => void
  // Discord-style inline reply: when provided, a "Reply" action appears in the
  // menu and arms the composer to reply to this message. Omitted on surfaces
  // without a composer (e.g. thread/right-panel previews).
  onReply?: () => void
  /**
   * Continues the message above it (lib/messageGrouping): no avatar or name,
   * and the time shows in the gutter on hover.
   */
  continued?: boolean
  /**
   * It arrived while the reader was at the end of the conversation
   * (components/message/arrival): it rises into place, once. History never
   * moves, so this is never set for a row drawn from a load.
   */
  arrived?: boolean
}

/** "Edited 10:42 · originally 10:31", for the "(edited)" tooltip (C27). */
function editedTitle(createdAt: string, updatedAt?: string): string | undefined {
  if (!updatedAt) return undefined
  const made = new Date(createdAt).getTime()
  const changed = new Date(updatedAt).getTime()
  if (!Number.isFinite(made) || !Number.isFinite(changed) || changed - made <= 1000) return undefined
  return `Edited ${chatClock(updatedAt)} · originally ${chatClock(createdAt)}`
}

/** The delay before a hovered row offers its actions: intent, not a pass-through. */
const HOVER_INTENT_MS = 60

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
  onAvatarClick,
  onReply,
  continued = false,
  arrived = false,
}: BaseMessageCardProps) => {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false)
  // On a tablet, which cannot hover, a tap on the message shows its toolbar.
  const touchReveal = useTouchReveal()
  const [isEmojiPickerOpen, setIsEmojiPickerOpen] = useState(false)
  // The pointer has rested on this message, or focus is inside it.
  const [actionsWanted, setActionsWanted] = useState(false)
  const intent = useRef(0)
  useEffect(() => () => window.clearTimeout(intent.current), [])
  const [isMessageEditEnabled, setIsMessageEditEnabled] = useState(false)
  // Mirror the edited text into a ref so the synchronous flush triggered when
  // the user clicks Save / presses Enter (which updates state via the
  // editor's onChange) is observable inside the same tick by the
  // handleEditComplete callback below.
  const updatedTextRef = useRef<string>(message.bodyText || "")
  // The reaction the reader just made as their first on this message.
  const [burstEmojiId, setBurstEmojiId] = useState<string | undefined>(undefined)

  const selfProfile = useFetchOnlyOnce<UserProfileInterface>(GetEndpointUrl.SelfProfile)
  const selfId = selfProfile.data?.data.user_uuid
  const dispatch = useDispatch()

  // Route internal /app deep links (e.g. AI citation footers) through client
  // navigation. Disabled while editing so link clicks edit text as usual.
  const handleInternalLinkClick = useInternalLinkRouter(!isMessageEditEnabled)

  const userInfoState = useUserInfoState(message.from.user_uuid)
  // A channel guest's or Slack person's message is drawn as theirs: their name,
  // a Guest or Slack tag, and only what they wrote (see lib/relayedAuthor).
  const relayed = useRelayedAuthor(message.from, message.bodyText)
  // Bots' kinds: a reply avatar is the guest or Slack person, not their bot;
  // an agent's mention chip is the agent's.
  const botKinds = useBotKindMap()
  const authorKind = useBotKind(message.from.user_uuid, !!message.from.is_bot)
  const isAgent = !relayed && !!message.from.is_bot && isAIBot(authorKind)
  const authorName = relayed ? relayed.name : messageAuthorName(message.from, userInfoState?.userName)
  const bodyText = relayed ? relayed.body : message.bodyText

  // A mention of the reader: the accent ground, a bar on the edge and the
  // time in the accent's ink (C14). Anyone else's mention stays neutral.
  const forMe = useMemo(() => mentionsUser(message.bodyText, selfId), [message.bodyText, selfId])
  const mentionContext = useMemo<MentionContext>(() => ({ me: selfId, agentIds: agentIdsOf(botKinds) }), [selfId, botKinds])
  const emojiOnly = useMemo(() => isEmojiOnly(bodyText), [bodyText])
  const edited = editedTitle(message.createdAt, message.updatedAt)
  const checkin = !relayed && !!message.from.is_bot && authorKind === "checkin" && !isMessageEditEnabled
  const replyFaces = useMemo(
    () => (checkin && message.comments ? replyParticipants(message.comments.slice().reverse(), botKinds) : []),
    [checkin, message.comments, botKinds],
  )

  // This message's thread is the one open in the panel (C35, its open state).
  const threadOpen = useSelector((s: RootState) => {
    const d = s.rightPanel.rightPanelState
    if (!d.isOpen || !message.uuid) return false
    return d.data.postUUID === message.uuid || d.data.chatMessageUUID === message.uuid
  })

  // Inline AI translation (Notion/Slack-style). One click translates the
  // message into the viewer's browser language and shows it beneath the
  // original, with a toggle back to the source text.
  const { translateText, isSubmitting: translating } = useTranslateText()
  const [translation, setTranslation] = useState<string | null>(null)
  const [showTranslation, setShowTranslation] = useState(false)
  const handleTranslate = useCallback(async () => {
    if (translation) {
      setShowTranslation((v) => !v)
      return
    }
    const text = (bodyText || "").trim()
    if (!text) return
    const target = typeof navigator !== "undefined" ? navigator.language : "English"
    const res = await translateText(text, target)
    if (res?.translation) {
      setTranslation(res.translation)
      setShowTranslation(true)
    }
  }, [translation, bodyText, translateText])

  const reactions = useMemo(() => {
    const r: { [key: string]: string[] } = {}
    if (message.reactions) {
      message.reactions.forEach((reaction) => {
        // A reaction the server answered oddly (no emoji) is skipped, never drawn.
        if (!reaction?.reaction_emoji_id) return
        if (!r[reaction.reaction_emoji_id]) {
          r[reaction.reaction_emoji_id] = []
        }
        const name = displayNameOf(reaction.reaction_added_by)
        if (name) r[reaction.reaction_emoji_id].push(name)
      })
    }
    return r
  }, [message.reactions])

  const userSelectedOption = useMemo(() => {
    if (!selfId || !message.reactions) return {} as UserSelectedOptionInterface
    const reaction = message.reactions.find((r) => r?.reaction_added_by?.user_uuid === selfId)
    if (reaction) {
      return {
        reactionId: reaction.uid,
        emojiId: reaction.reaction_emoji_id,
      }
    }
    return {} as UserSelectedOptionInterface
  }, [message.reactions, selfId])

  const handleEmojiClick = useCallback(
    (emojiId: string) => {
      if (userSelectedOption.emojiId === emojiId) {
        removeReaction(userSelectedOption.reactionId)
        return
      }
      // The reader's first reaction on this message: three small sparks leave
      // its pill (ReactionPill, throttled), and only then.
      if (!userSelectedOption.emojiId) setBurstEmojiId(emojiId)
      addReaction(emojiId, userSelectedOption.reactionId)
    },
    [userSelectedOption, addReaction, removeReaction],
  )

  // The profile card on a rest over the face or the name (hub.md P1).
  const authorHover = useProfileHover(relayed ? undefined : message.from.user_uuid)
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
      // Editing hands every keystroke over at once, so Save never misses the last one.
      throttleDelay={isMessageEditEnabled ? 0 : 300}
      isOutputText={!isMessageEditEnabled}
      className={cn("max-w-full h-auto", isMessageEditEnabled && "focus-halo rounded-[10px] bg-raised px-2.5 py-2")}
      editorContentClassName="overflow-auto"
      output="html"
      content={bodyText}
      placeholder="Edit message…"
      editable={isMessageEditEnabled}
      // Enter saves (the editor's submit); Save and Cancel are the words
      // under it (C29), not two icons.
      buttonOnclick={handleEditComplete}
      // Editing folds its formatting behind one button, as the message box
      // does: thirteen icons opened under the line being corrected.
      toggleToolbar={isMessageEditEnabled}
      noBorder={isMessageEditEnabled}
      editorClassName="focus:outline-none "
      mentionContext={mentionContext}
      editedTitle={edited}
      onChange={(content) => {
        updatedTextRef.current = content as string
      }}
    />
  )

  // The actions exist only for the message under the pointer or holding focus
  // (or whose menu is open). Every row used to mount its own toolbar, hidden:
  // about 600 components a message, and two dozen invisible tab stops. A
  // message the server has not confirmed has no id to react to yet.
  const showActions = !isMessageEditEnabled && !message.sendState && (actionsWanted || isDropdownOpen || isEmojiPickerOpen || touchReveal.revealed)
  // The first row on the page builds the toolbar once, hidden, when the
  // browser is idle, so the first hover is not its first run (primeActions).
  const primingActions = usePrimeActions()
  const failed = message.sendState === "failed"
  const sending = message.sendState === "sending"
  const busy = isDropdownOpen || isEmojiPickerOpen || touchReveal.revealed

  return (
    <div
      id={messageDomId(message.uuid)}
      data-message-row=""
      data-for-me={forMe || undefined}
      data-failed={failed || undefined}
      onPointerEnter={() => {
        window.clearTimeout(intent.current)
        intent.current = window.setTimeout(() => setActionsWanted(true), HOVER_INTENT_MS)
      }}
      onPointerLeave={() => {
        window.clearTimeout(intent.current)
        setActionsWanted(false)
      }}
      onFocus={() => setActionsWanted(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setActionsWanted(false)
      }}
      // A touch or a pen has no hover: a tap on the message shows its
      // actions (hooks/useTouchReveal), as the pointer does.
      onPointerUp={touchReveal.onPointerUp}
      className={cn(
        // The row grid (design v3 chat, §2.1): a 36px avatar column and the
        // text, 12px apart, 20px in from the left and 24px from the right.
        // The first row of a turn breathes 6px; a continued one sits 1px
        // from its neighbours.
        "group/row group relative isolate grid grid-cols-[36px_minmax(0,1fr)] gap-x-3 pl-5 pr-6",
        continued && !isMessageEditEnabled ? "py-px" : "py-1.5",
        "transition-colors duration-[140ms] ease-out",
        // Hover is the ink overlay, colour only: a row never moves under the
        // pointer. Keyboard focus inside adds the 2px accent bar.
        !forMe && !isMessageEditEnabled && "hover:bg-hover has-[:focus-visible]:bg-hover",
        !forMe && (busy || touchReveal.revealed) && "bg-hover",
        // For you: the accent's soft ground at 70% and a 2px bar on the edge.
        forMe && "bg-brand-muted/70 dark:bg-[color-mix(in_oklab,var(--brand)_10%,transparent)]",
        isMessageEditEnabled && "bg-brand-muted/40",
        (forMe || failed) && "before:absolute before:bottom-1.5 before:left-0 before:top-1.5 before:w-0.5 before:rounded-full",
        forMe && !failed && "before:bg-brand",
        failed && "before:bg-destructive",
        // Arrived while the reader watched: it rises into place, once. Your
        // own from the composer's side, bottom-left (C18).
        arrived && (sending ? "origin-bottom-left animate-msg-in-own" : "animate-msg-in"),
      )}
    >
        {/* A live mention of you lands warm, then settles to the 70% ground. */}
        {arrived && forMe && <span aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 bg-brand-muted animate-glow-settle" />}
        {continued && !isMessageEditEnabled ? (
          <ContinuedGutter createdAt={message.createdAt} authorName={authorName} sending={sending} failed={failed} />
        ) : (
          // A second, mouse-only way to the profile the name already opens:
          // the name is the control, so the picture stays out of the tab order.
          <div
            data-row-avatar=""
            className={cn("size-9 shrink-0 self-start", !relayed && onAvatarClick && "cursor-pointer")}
            onClick={relayed ? undefined : onAvatarClick}
            {...authorHover}
          >
            {relayed ? (
              <RelayedAvatar name={relayed.name} />
            ) : (
              <ChannelMessageAvatar
                userName={authorName}
                userProfileKey={userInfoState?.profileKey ?? message.from.user_profile_object_key}
                isBot={!!message.from.is_bot}
                userUUID={message.from.user_uuid}
              />
            )}
          </div>
        )}
        <div className="min-w-0">
          {!isMessageEditEnabled && !continued && (
            <div data-name-line="" className="flex h-5 min-w-0 items-center gap-2">
              {relayed ? (
                // A guest or Slack person has no profile to open: the name is only a name.
                <span className="truncate text-ui font-semibold text-ink">{authorName}</span>
              ) : (
                <button
                  type="button"
                  onClick={handleUserClick}
                  {...authorHover}
                  className="truncate rounded-[4px] text-ui font-semibold text-ink hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                >
                  {authorName}
                </button>
              )}
              {relayed ? (
                <>
                  <PrincipalTag kind={relayed.kind} />
                  {relayed.kind === "bridge" && <span className="shrink-0 text-meta text-ink-3">via Slack</span>}
                </>
              ) : message.from.is_bot && (
                <BotTag userUUID={message.from.user_uuid} />
              )}
              {failed ? (
                <FailedMark />
              ) : (
                <time
                  dateTime={isoTimestamp(message.createdAt)}
                  title={formatFullTimestamp(message.createdAt)}
                  className={cn("shrink-0 text-meta tabular-nums", forMe ? "text-brand-text" : "text-ink-3")}
                >
                  {chatClock(message.createdAt)}
                </time>
              )}
              {sending && <SendingNote />}
            </div>
          )}
          {message.replyTo && !isMessageEditEnabled && (
            <ReplyLine by={message.replyTo.from} text={message.replyTo.text} onJump={() => scrollToMessage(message.replyTo?.uuid)} />
          )}
          <div
            data-emoji-only={emojiOnly && !isMessageEditEnabled ? "" : undefined}
            data-checkin-card={checkin || undefined}
            className={cn(
              "chat-body w-full max-w-[760px] break-words",
              isMessageEditEnabled && "mt-0.5",
              // A Check-in's question is a prompt card (C13): the sunken
              // surface, its question first at 590, who answered under it.
              checkin && "mt-1 max-w-[560px] rounded-xl bg-sunken px-3.5 py-3 [&_.ProseMirror_p:first-child]:font-semibold",
            )}
            onClickCapture={handleInternalLinkClick}
            // Escape leaves an edit unchanged, as in every chat app; a popover
            // inside the editor (mentions, emoji) takes it first.
            onKeyDown={(e) => {
              if (isMessageEditEnabled && e.key === "Escape" && !e.defaultPrevented) {
                e.preventDefault()
                e.stopPropagation()
                handleEditCancel()
              }
            }}
          >
            {editor}
            {checkin && (
              <div className="mt-3 flex items-center gap-2.5 border-t border-line pt-2.5">
                {replyFaces.length > 0 && <ThreadParticipants participants={replyFaces} />}
                <span className="text-meta tabular-nums text-ink-3">
                  {(message.commentCount ?? 0) > 0 ? `${message.commentCount} answered` : "Nobody has answered yet"}
                </span>
                <Button type="button" size="sm" className="ml-auto" onClick={handleOpenThread}>Answer</Button>
              </div>
            )}
            {isMessageEditEnabled && (
              // Under the box (C29): how it ends, in kbd chips, then Cancel and Save.
              <div className="mb-1 mt-1.5 flex h-6 items-center gap-1.5 text-meta text-ink-3">
                <kbd className="kbd">esc</kbd> cancel · <kbd className="kbd">⏎</kbd> save
                <span className="ml-auto flex items-center gap-1.5">
                  <Button type="button" size="xs" variant="ghost" onClick={handleEditCancel}>Cancel</Button>
                  <Button type="button" size="xs" onClick={handleEditComplete}>Save</Button>
                </span>
              </div>
            )}
          </div>

          {/* Inline AI translation (C33): a sunken card beneath the original,
              with the way back to it. Plain text (the model returns prose). */}
          {!isMessageEditEnabled && (translating || (translation && showTranslation)) && (
            <div className="mt-2 max-w-[760px] rounded-[10px] bg-sunken px-3 py-2 animate-fade-in">
              <div className="mb-0.5 flex items-center gap-1.5 text-meta font-medium text-ink-3">
                <Languages className="size-3" aria-hidden="true" />
                {translating ? "Translating…" : "Translated"}
                {translation && !translating && (
                  <>
                    <span aria-hidden="true">·</span>
                    <button type="button" onClick={() => setShowTranslation(false)} className="text-ink-3 underline-offset-2 hover:text-ink hover:underline">
                      Show original
                    </button>
                  </>
                )}
              </div>
              {translating && !translation ? (
                <Loader2 className="size-3.5 animate-spin text-ink-3" />
              ) : (
                <p className="whitespace-pre-line text-body text-ink">{translation}</p>
              )}
            </div>
          )}
          {!isMessageEditEnabled && translation && !showTranslation && (
            <button
              type="button"
              onClick={() => setShowTranslation(true)}
              className="mt-1 text-meta font-medium text-brand-text underline-offset-2 hover:underline"
            >
              Show translation
            </button>
          )}

          {/* Under the body, in order (C07): link cards, attachments, the
              agent's provenance, the thread, reactions, then send status. */}
          {message.from.is_bot && !isMessageEditEnabled && <AgentResultCards text={message.bodyText} />}
          {!isMessageEditEnabled && <WorkLinkCards text={message.bodyText} />}

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

          {/* On whose behalf an agent acted (C11): the asker is the person it
              replied to; a message that doesn't say, says so in general. */}
          {isAgent && !isMessageEditEnabled && (
            <AgentProvenance
              asker={message.replyTo && !message.replyTo.from?.is_bot ? { name: displayNameOf(message.replyTo.from), userUUID: message.replyTo.from?.user_uuid } as AgentAsker : null}
            />
          )}

          {/* Both conditions must be booleans: `comments && commentCount` rendered a
              literal "0" under a message whose first reply had not arrived yet. */}
          {!checkin && (message.comments?.length ?? 0) > 0 && (message.commentCount ?? 0) > 0 && (
            <MessageReplyCount
              openDesktopThread={handleOpenThread}
              replyCount={message.commentCount}
              lastCommentCreatedAt={message.comments![message.comments!.length - 1].comment_created_at}
              participants={replyParticipants(message.comments!.slice().reverse(), botKinds)}
              open={threadOpen}
            />
          )}

          {!isMessageEditEnabled && !message.sendState && (
            <BottomMenu
              handleEmojiClick={handleEmojiClick}
              reactions={reactions}
              selectedEmojiId={userSelectedOption.emojiId}
              selfName={displayNameOf(selfProfile.data?.data)}
              burstEmojiId={burstEmojiId}
            />
          )}
          <SendStatus state={message.sendState} localId={message.localId} />
        </div>
        {/* After the message in the DOM, so Tab from the author's name reaches
            the message's own links first, then its actions. It overlaps the
            row's top edge, 24px in from the right (C19). */}
        {(showActions || primingActions) && (
          <div className="absolute -top-3.5 right-6 z-10" hidden={!showActions} aria-hidden={!showActions || undefined}>
            <MessageDesktopHoverOptionsForMainChatAndChannel
              editMessage={() => setIsMessageEditEnabled(true)}
              deleteMessage={removePost}
              isOwner={message.from.user_uuid === selfId}
              isAdmin={isAdmin}
              setEmojiPopupState={setIsEmojiPickerOpen}
              onReactionSelect={handleEmojiClick}
              setIsDropdownOpen={setIsDropdownOpen}
              messageText={bodyText}
              authorName={authorName}
              onReply={onReply}
              onTranslate={bodyText ? handleTranslate : undefined}
              {...hoverOptionsConfig}
            />
          </div>
        )}
    </div>
  )
})

BaseMessageCard.displayName = "BaseMessageCard"
