"use client"

import { ChannelMessageAvatar } from "@/components/channel/channelMessageAvatar"
import { MessageDesktopHoverOptionsForMainChatAndChannel } from "@/components/MessageDesktopHover/messageDesktopHoverOptionsForMainChatAndChannel"
import { useBotKind, useBotKindMap } from "@/hooks/useBotKinds"
import { isAIBot } from "@/lib/botCopy"
import { agentIdsOf, mentionsUser } from "@/components/message/tintMentions"
import { AgentProvenance, type AgentAsker } from "@/components/message/agentProvenance"
import { ReplyLine } from "@/components/message/replyLine"
import { scrollToMessage } from "@/lib/utils/scrollToMessage"
import { chatClock } from "@/lib/chat/clock"
import { Button } from "@/components/ui/button"
import { formatFullTimestamp, isoTimestamp } from "@/lib/utils/date/formatTimeForPostOrComment"
import { ContinuedGutter } from "@/components/message/continuedGutter"
import MinimalTiptapTextInput from "@/components/textInput/textInput"
import { MessagePreview } from "@/components/message/MessagePreview"
import { cn } from "@/lib/utils/helpers/cn"
import { PrincipalTag } from "@/components/ui/principalTag"
import { BotTag } from "@/components/ui/botTag"
import {UserProfileDataInterface, UserProfileInterface, UserSelectedOptionInterface} from "@/types/user";
import {ForwardedMessageData} from "@/types/rightPanel";

import {useCallback, useMemo, useState} from "react";
import {GroupedReaction} from "@/types/reaction";
import {BottomMenu} from "@/components/message/bottomMenu";
import { useFetchOnlyOnce} from "@/hooks/useFetch";
import {GetEndpointUrl} from "@/services/endPoints";
import {AttachmentMediaReq} from "@/types/attachment";
import {MessageAttachments} from "@/components/message/MessageAttachments";
import {AgentResultCards} from "@/components/message/AgentResultCards";
import { WorkLinkCards } from "@/components/message/WorkLinkCards"
import {openUI} from "@/store/slice/uiSlice";
import {useDispatch} from "react-redux";
import { useTouchReveal } from "@/hooks/useTouchReveal";
import {useUserInfoState} from "@/hooks/useUserInfoState";
import { useRelayedAuthor } from "@/hooks/useRelayedAuthor";
import { RelayedAvatar } from "@/components/message/relayedAvatar";

interface MessageContentProps {
    userInfo?: UserProfileDataInterface
    createdAt?: string
    content: string
    forwardedMessage?: ForwardedMessageData
    replyMessage?: ForwardedMessageData
    channelUUID?: string
    commentUUID?: string
    postUUID?: string
    chatUUID?: string
    rawReactions?: GroupedReaction[]
    removeReaction: (reactionId: string) => void
    attachments?: AttachmentMediaReq[]
    addReaction: (emojiId:string, reactionId: string) => void
    isAdmin?: boolean;
    updateMessage: (id: string, body: string) => void;
    deleteMessage: (id: string) => void;
    getMediaUrl: string
    /** Continues the reply above it (lib/messageGrouping): no avatar or name. */
    continued?: boolean
    /** The thread's subject: drawn on the sunken surface above the replies (C36). */
    root?: boolean
    /** For an agent's reply: whose ask it answered (C11). */
    asker?: AgentAsker | null
}

export const MessageContent = ({
                                   userInfo,
                                   createdAt,
                                   content,
                                   forwardedMessage,
    replyMessage,
    getMediaUrl,
    attachments,
    commentUUID,
    deleteMessage,
    isAdmin,
   updateMessage,
    removeReaction,
    addReaction,
    rawReactions,
    channelUUID,
    postUUID,
    chatUUID,
    continued = false,
    root = false,
    asker,
                               }: MessageContentProps) => {

    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    // Whether the actions are wanted: built while the pointer is over the
    // reply or focus is inside it, as on a channel's rows. Built for every
    // reply, hidden, they cost each one a toolbar of tooltips.
    const [actionsWanted, setActionsWanted] = useState(false)
    // On a tablet, which cannot hover, a tap on the reply shows its toolbar.
    const touchReveal = useTouchReveal();

    const selfProfile = useFetchOnlyOnce<UserProfileInterface>(GetEndpointUrl.SelfProfile)
    const [isEmojiPickerOpen, setIsEmojiPickerOpen] = useState(false);

    const[isMessageEditEnabled, setIsMessageEditEnabled] = useState(false);

    const [updatedText, setUpdatedText] = useState<string>(content||'');

    const userStatusState = useUserInfoState(userInfo?.user_uuid)

    const dispatch = useDispatch()

    // Guest-authored comments carry a reserved "guest-" uuid (never a member).
    // They are read-only for members: the member comment mutation endpoints
    // (edit / delete / react) target the core comment store, not the isolated
    // guest_comments table, so we suppress those affordances and the profile
    // open, and badge the author instead of exposing a member profile surface.
    const isGuest = !!userInfo?.user_uuid?.startsWith("guest-")
    // A channel guest's or Slack person's message or reply, posted by the
    // Guests or Slack bot: drawn as theirs (see lib/relayedAuthor). Unlike a
    // doc guest's comment it lives in the ordinary store, so members still
    // react to it and admins delete it.
    const relayed = useRelayedAuthor(isGuest ? undefined : userInfo, content)
    const guestDisplayName = relayed
        ? relayed.name
        : (userInfo?.user_name || "").replace(/^Guest:\s*/i, "").trim() || "Guest"
    const asGuest = isGuest || !!relayed
    const tagKind = relayed ? relayed.kind : "guest"
    const body = relayed ? relayed.body : content

    const showActions = !isMessageEditEnabled && !isGuest && (actionsWanted || isDropdownOpen || isEmojiPickerOpen || touchReveal.revealed)

    const handleEmojiClick = (emojiId: string) => {
        if(userSelectedOption.emojiId == emojiId) {
            removeReaction(userSelectedOption.reactionId)
            return
        }

        addReaction(emojiId, userSelectedOption.reactionId)
    }

    // Derived from the reactions, not copied into state by an effect: the
    // effect drew every reply twice as it mounted (once bare, once with its
    // reactions) and twice more whenever they changed.
    const selfUserUuid = selfProfile.data?.data?.user_uuid
    const { userSelectedOption, reactions } = useMemo(() => {
        const mine = {} as UserSelectedOptionInterface
        const byEmoji: { [key: string]: string[] } = {}
        if (rawReactions && selfUserUuid) {
            for (const reaction of rawReactions) {
                if (reaction.reaction_added_by.user_uuid == selfUserUuid) {
                    mine.reactionId = reaction.uid
                    mine.emojiId = reaction.reaction_emoji_id
                }
                ;(byEmoji[reaction.reaction_emoji_id] ??= []).push(reaction.reaction_added_by.user_name)
            }
        }
        return { userSelectedOption: mine, reactions: byEmoji }
    }, [rawReactions, selfUserUuid])

    const handleSelectAttachment = (attachment: AttachmentMediaReq) => {

        if(attachments) {
            dispatch(openUI({
                key: 'attachmentLightbox',
                data: {allMedia:  attachments, media: attachment, mediaGetUrl: getMediaUrl}
            }))

        }

    }

    const handleUserClick = useCallback(()=>{

        dispatch(openUI({ key: 'otherUserProfile', data: {userUUID: userInfo?.user_uuid} }))

    },[userInfo?.user_uuid])


    const botKinds = useBotKindMap()
    const authorKind = useBotKind(userInfo?.user_uuid, !!userInfo?.is_bot)
    const isAgent = !asGuest && !!userInfo?.is_bot && isAIBot(authorKind)
    const forMe = useMemo(() => mentionsUser(content, selfUserUuid), [content, selfUserUuid])
    const mentionContext = useMemo(() => ({ me: selfUserUuid, agentIds: agentIdsOf(botKinds) }), [selfUserUuid, botKinds])
    const busy = isDropdownOpen || isEmojiPickerOpen || touchReveal.revealed
    const authorName = (asGuest ? guestDisplayName : userStatusState?.userName || userInfo?.user_name) || ''

    return (
        // The thread's rows are the conversation's (design v3 chat, C07, C36):
        // the same grid at the panel's 16px insets, the same name line, body,
        // cards and reactions, and the same toolbar. The root sits on the
        // sunken surface as the thread's subject.
        <div
            data-message-row=""
            data-thread-root={root || undefined}
            data-for-me={forMe || undefined}
            // A tap shows the actions on a touch screen (hooks/useTouchReveal).
            onPointerUp={touchReveal.onPointerUp}
            className={cn(
                "group/row group relative isolate grid grid-cols-[36px_minmax(0,1fr)] gap-x-3 px-4 transition-colors duration-[140ms] ease-out",
                continued && !isMessageEditEnabled ? "py-px" : "py-1.5",
                root ? "mx-3 rounded-xl bg-sunken px-3 py-3" : !forMe && "hover:bg-hover has-[:focus-visible]:bg-hover",
                !root && !forMe && (busy || touchReveal.revealed) && "bg-hover",
                forMe && !root && "bg-brand-muted/70 before:absolute before:bottom-1.5 before:left-0 before:top-1.5 before:w-0.5 before:rounded-full before:bg-brand dark:bg-[color-mix(in_oklab,var(--brand)_10%,transparent)]",
                isMessageEditEnabled && "bg-brand-muted/40",
            )}
            onPointerEnter={() => setActionsWanted(true)}
            onPointerLeave={() => setActionsWanted(false)}
            onFocus={() => setActionsWanted(true)}
            onBlur={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setActionsWanted(false)
            }}
        >

            {continued && !isMessageEditEnabled ? (
                <ContinuedGutter createdAt={createdAt || ""} authorName={authorName} />
            ) : (
            <div data-row-avatar="" className={cn("size-9 shrink-0 self-start", !asGuest && "cursor-pointer")} onClick={asGuest ? undefined : handleUserClick}>
                {asGuest ? (
                    <RelayedAvatar name={guestDisplayName} />
                ) : (
                    <ChannelMessageAvatar
                        userName={userStatusState?.userName || userInfo?.user_name || ''}
                        userProfileKey={userStatusState?.userName ? userStatusState?.profileKey : userInfo?.user_profile_object_key}
                        isBot={!!userInfo?.is_bot}
                        userUUID={userInfo?.user_uuid}
                    />
                )}
            </div>
            )}
            <div className="min-w-0">
                {!(continued && !isMessageEditEnabled) && (
                <div data-name-line="" className="flex h-5 items-center gap-2">
                    {asGuest ? (
                        <span className="truncate text-ui font-semibold text-ink">{guestDisplayName}</span>
                    ) : (
                        <button
                            type="button"
                            onClick={handleUserClick}
                            className="truncate rounded-[4px] text-ui font-semibold text-ink hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                        >
                            {authorName}
                        </button>
                    )}
                    {asGuest && (
                        <PrincipalTag kind={tagKind} />
                    )}
                    {!asGuest && userInfo?.is_bot && (
                        <BotTag userUUID={userInfo?.user_uuid} />
                    )}
                    <time
                        dateTime={isoTimestamp(createdAt || '')}
                        title={formatFullTimestamp(createdAt || '')}
                        className={cn("shrink-0 text-meta tabular-nums", forMe && !root ? "text-brand-text" : "text-ink-3")}
                    >
                        {chatClock(createdAt || '')}
                    </time>
                </div>
                )}

                {replyMessage && !isMessageEditEnabled && (
                    <ReplyLine by={replyMessage.msgBy} text={replyMessage.msgText} onJump={() => scrollToMessage(replyMessage.msgUUID)} />
                )}

                <div className={cn("chat-body max-w-[760px] break-words", root && "[&_.ProseMirror]:font-normal")}>
                    <MinimalTiptapTextInput
                        throttleDelay={isMessageEditEnabled ? 0 : 300}
                        isOutputText={!isMessageEditEnabled}
                        className={cn("max-w-full h-auto", isMessageEditEnabled && "focus-halo rounded-[10px] bg-raised px-2.5 py-2")}
                        editorContentClassName="overflow-auto"
                        output="html"
                        content={body}
                        placeholder="Edit message…"
                        editable={isMessageEditEnabled}
                        noBorder={isMessageEditEnabled}
                        mentionContext={mentionContext}
                        editorClassName="focus:outline-none"
                        onChange={(content) => {
                            setUpdatedText(content as string)
                        }}
                        buttonOnclick={()=>{
                            updateMessage(chatUUID || postUUID || commentUUID || '', updatedText)
                            setIsMessageEditEnabled(false)
                            setIsDropdownOpen(false)
                        }}
                        toggleToolbar={true}
                    />
                    {isMessageEditEnabled && (
                        <div className="mb-1 mt-1.5 flex h-6 items-center gap-1.5 text-meta text-ink-3">
                            <kbd className="kbd">esc</kbd> cancel · <kbd className="kbd">⏎</kbd> save
                            <span className="ml-auto flex items-center gap-1.5">
                                <Button type="button" size="xs" variant="ghost" onClick={() => { setIsMessageEditEnabled(false); setIsDropdownOpen(false) }}>Cancel</Button>
                                <Button type="button" size="xs" onClick={() => { updateMessage(chatUUID || postUUID || commentUUID || '', updatedText); setIsMessageEditEnabled(false); setIsDropdownOpen(false) }}>Save</Button>
                            </span>
                        </div>
                    )}
                </div>

                {/* Additive GitHub result cards for AI-teammate messages (a PR,
                    an open-PR link, or a pushed branch) — rendered below the
                    body, never replacing it. No-op for humans / non-GitHub text. */}
                {userInfo?.is_bot && !isMessageEditEnabled && (
                    <AgentResultCards text={content} />
                )}
                {/* Live cards for this workspace's tasks, docs and projects, for everyone. */}
                {!isMessageEditEnabled && <WorkLinkCards text={content} />}

                {forwardedMessage && !isMessageEditEnabled && (
                    <MessagePreview
                        msgBy={forwardedMessage.msgBy}
                        msgText={forwardedMessage.msgText}
                        msgChannelName={forwardedMessage.msgChannelName}
                        msgChannelUUID={forwardedMessage.msgChannelUUID}
                        msgUUID={forwardedMessage.msgUUID}
                        msgCreatedAt={forwardedMessage.msgCreatedAt}
                        vewFooter={true}
                    />
                )}

                {
                    !isMessageEditEnabled && attachments && attachments.length  > 0 &&
                    <MessageAttachments attachmentSelected={handleSelectAttachment} attachments={attachments} mediaGetUrl={getMediaUrl}/>
                }

                {isAgent && !isMessageEditEnabled && <AgentProvenance asker={asker} />}

                {!isMessageEditEnabled && !isGuest && <BottomMenu handleEmojiClick={handleEmojiClick} reactions={reactions} selectedEmojiId={userSelectedOption.emojiId} selfName={selfProfile.data?.data?.user_name}/>}

            </div>
            {/* After the reply in the DOM, so Tab reaches the actions after
                what the reply says. The conversation's own toolbar (C19), 12px
                in from the panel's edge. */}
            {showActions && (
                <div className="absolute -top-3.5 right-3 z-[var(--z-dropdown)]" data-touch-revealed={touchReveal.revealed || undefined}>
                    <MessageDesktopHoverOptionsForMainChatAndChannel
                        setIsDropdownOpen={setIsDropdownOpen}
                        channelUUID={channelUUID}
                        postUUID={root ? postUUID : undefined}
                        chatUUID={root ? chatUUID : undefined}
                        commentUUID={commentUUID}
                        messageText={content}
                        authorName={authorName}
                        setEmojiPopupState={setIsEmojiPickerOpen}
                        onReactionSelect={handleEmojiClick}
                        editMessage={()=>{setIsMessageEditEnabled(true)}}
                        isOwner={selfProfile.data?.data.user_uuid == userInfo?.user_uuid}
                        isAdmin={isAdmin}
                        deleteMessage={()=>{deleteMessage(chatUUID || postUUID || commentUUID || '')}}
                        inThread
                    />
                </div>
            )}
        </div>
    )
}
