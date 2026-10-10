"use client"

import { ChannelMessageAvatar } from "@/components/channel/channelMessageAvatar"
import { quoteBarClass } from "@/components/message/quoteBar"
import { formatFullTimestamp, formatTimeForPostOrComment, isoTimestamp } from "@/lib/utils/date/formatTimeForPostOrComment"
import { ContinuedGutter } from "@/components/message/continuedGutter"
import MinimalTiptapTextInput from "@/components/textInput/textInput"
import { MessagePreview } from "@/components/message/MessagePreview"
import { cn } from "@/lib/utils/helpers/cn"
import { PrincipalTag } from "@/components/ui/principalTag"
import { BotTag } from "@/components/ui/botTag"
import { Check, X } from "@/lib/icons";
import {UserProfileDataInterface, UserProfileInterface, UserSelectedOptionInterface} from "@/types/user";
import {ForwardedMessageData} from "@/types/rightPanel";

import {useCallback, useMemo, useState} from "react";
import {
    MessageDesktopHoverOptionsForRightPanelChatAndChannel
} from "@/components/MessageDesktopHover/MessageDesktopHoverOptionsForRightPanelChatAndChannel";
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
import {useUserInfoState} from "@/hooks/useUserInfoState";
import {SaveToMemoryButton} from "@/components/ai/SaveToMemoryButton";
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
                               }: MessageContentProps) => {

    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    // Whether the actions are wanted: built while the pointer is over the
    // reply or focus is inside it, as on a channel's rows. Built for every
    // reply, hidden, they cost each one a toolbar of tooltips.
    const [actionsWanted, setActionsWanted] = useState(false)

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

    const showActions = !isMessageEditEnabled && !isGuest && (actionsWanted || isDropdownOpen || isEmojiPickerOpen)

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


    return (
        // The same row as the channel's: a 36px avatar, the name and a small
        // time, and a neutral hover. The thread drew a 48px avatar, a lighter
        // name and an orange hover, so a reply looked like a different kind of
        // thing from the message it answered.
        <div
            className={cn("group relative flex gap-3 px-2 transition-colors duration-100 hover:bg-accent/40", continued && !isMessageEditEnabled ? "py-0.5" : "py-1.5", (isDropdownOpen || isEmojiPickerOpen) && "bg-accent/40")}
            onPointerEnter={() => setActionsWanted(true)}
            onPointerLeave={() => setActionsWanted(false)}
            onFocus={() => setActionsWanted(true)}
            onBlur={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setActionsWanted(false)
            }}
        >

            {continued && !isMessageEditEnabled ? (
                <ContinuedGutter createdAt={createdAt || ""} authorName={(asGuest ? guestDisplayName : userInfo?.user_name) || ""} />
            ) : (
            <div className={cn("h-9 w-9 shrink-0 mt-0.5", !asGuest && "cursor-pointer")} onClick={asGuest ? undefined : handleUserClick}>
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
            <div className="flex-1 min-w-0">
                {!(continued && !isMessageEditEnabled) && (
                <div className="flex items-baseline gap-2">
                    {asGuest ? (
                        <span className="text-sm font-semibold text-foreground truncate">{guestDisplayName}</span>
                    ) : (
                        <button
                            type="button"
                            onClick={handleUserClick}
                            className="text-sm font-semibold text-foreground hover:underline truncate rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70"
                        >
                            {userInfo?.user_name}
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
                        className="text-2xs tabular-nums text-muted-foreground"
                    >
                        {formatTimeForPostOrComment(createdAt || '')}
                    </time>
                </div>
                )}

                {replyMessage && !isMessageEditEnabled && (
                    <div className={`mb-1 pl-2 ${quoteBarClass(replyMessage.msgBy)}`}>
                        <MessagePreview
                            msgBy={replyMessage.msgBy}
                            msgText={replyMessage.msgText}
                            msgUUID={replyMessage.msgUUID}
                            msgCreatedAt={replyMessage.msgCreatedAt}
                            vewFooter={false}
                        />
                    </div>
                )}

                <div className="break-words">
                    <MinimalTiptapTextInput
                        throttleDelay={300}
                        isOutputText={true}
                        className={cn("max-w-full rounded-xl h-auto",
                            isMessageEditEnabled ? "p-2" : "border-none"
                        )}
                        editorContentClassName="overflow-auto"
                        output="html"
                        content={body}
                        placeholder="Edit message…"
                        editable={isMessageEditEnabled}

                        editorClassName="focus:outline-none"
                        onChange={(content) => {

                            const s = content as string

                            setUpdatedText(s)
                        }}
                        PrimaryButtonIcon={Check}
                        buttonOnclick={()=>{
                            updateMessage(chatUUID || postUUID || commentUUID || '', updatedText)
                            setIsMessageEditEnabled(false)
                            setIsDropdownOpen(false)

                        }}
                        SecondaryButtonIcon={X}
                        secondaryButtonOnclick={()=>{
                            setIsMessageEditEnabled(false)
                            setIsDropdownOpen(false)
                        }}
                        toggleToolbar={true}
                    />
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


                {!isMessageEditEnabled && !isGuest && <BottomMenu handleEmojiClick={handleEmojiClick} reactions={reactions} selectedEmojiId={userSelectedOption.emojiId}/>}

            </div>
            {/* After the reply in the DOM, so Tab reaches the actions after
                what the reply says. */}
            {showActions && <div
                className={cn(
                    "absolute -top-0.5 right-2 transition-opacity duration-150 z-[var(--z-dropdown)]",
                    (isDropdownOpen || isEmojiPickerOpen) || "opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto focus-within:opacity-100 focus-within:pointer-events-auto",
                )}
            >
                <MessageDesktopHoverOptionsForRightPanelChatAndChannel
                    setIsDropdownOpen={setIsDropdownOpen}
                    channelUUID={channelUUID}
                    postUUID={postUUID}
                    setEmojiPopupState={setIsEmojiPickerOpen}
                    onReactionSelect={handleEmojiClick}
                    editMessage={()=>{setIsMessageEditEnabled(true)}}
                    isOwner={selfProfile.data?.data.user_uuid == userInfo?.user_uuid}
                    isAdmin={isAdmin}
                    deleteMessage={()=>{deleteMessage(chatUUID || postUUID || commentUUID || '')}}
                    captureSlot={
                        commentUUID && channelUUID ? (
                            <SaveToMemoryButton
                                messageText={content}
                                channelUUID={channelUUID}
                                sourceType="comment"
                                sourceUUID={commentUUID}
                            />
                        ) : undefined
                    }
                />
            </div>}
        </div>
    )
}
