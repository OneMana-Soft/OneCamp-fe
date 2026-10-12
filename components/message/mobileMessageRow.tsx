"use client"

import * as React from "react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { ChannelMessageAvatar } from "@/components/channel/channelMessageAvatar"
import { RelayedAvatar } from "@/components/message/relayedAvatar"
import { BotTag } from "@/components/ui/botTag"
import { PrincipalTag } from "@/components/ui/principalTag"
import { Button } from "@/components/ui/button"
import MinimalTiptapTextInput from "@/components/textInput/textInput"
import { AgentResultCards } from "@/components/message/AgentResultCards"
import { WorkLinkCards } from "@/components/message/WorkLinkCards"
import { MessagePreview } from "@/components/message/MessagePreview"
import { MessageAttachments } from "@/components/message/MessageAttachments"
import { MessageReplyCount } from "@/components/message/messageReplyCount"
import { replyParticipants } from "@/components/message/threadParticipants"
import { BottomMenu } from "@/components/message/bottomMenu"
import { ReplyLine } from "@/components/message/replyLine"
import { AgentProvenance } from "@/components/message/agentProvenance"
import { FailedMark, SendStatus, SendingNote } from "@/components/message/sendStatus"
import { agentIdsOf, mentionsUser, type MentionContext } from "@/components/message/tintMentions"
import type { BaseMessage } from "@/components/message/baseMessageCard"
import { useRelayedAuthor } from "@/hooks/useRelayedAuthor"
import { useBotKind, useBotKindMap } from "@/hooks/useBotKinds"
import { useUserInfoState } from "@/hooks/useUserInfoState"
import { useFetchOnlyOnce } from "@/hooks/useFetch"
import { useInternalLinkRouter } from "@/lib/utils/useInternalLinkRouter"
import { GetEndpointUrl } from "@/services/endPoints"
import { isAIBot } from "@/lib/botCopy"
import { chatClock } from "@/lib/chat/clock"
import { withEditedMark } from "@/lib/chat/editedMark"
import { isEmojiOnly } from "@/lib/chat/emojiOnly"
import { displayNameOf } from "@/lib/personName"
import { messageAuthorName } from "@/lib/utils/userDisplayName"
import { formatFullTimestamp, isoTimestamp } from "@/lib/utils/date/formatTimeForPostOrComment"
import { messageDomId, scrollToMessage } from "@/lib/utils/scrollToMessage"
import { cn } from "@/lib/utils/helpers/cn"
import type { UserProfileInterface } from "@/types/user"
import type { AttachmentMediaReq } from "@/types/attachment"
import type { MessageSheetPreview } from "@/components/drawers/messageActionSheet"

/** How long a touch rests before the row shows it is pressed: a scroll never flashes it. */
export const PRESS_DELAY_MS = 60
/** How long a hold takes to open the action sheet. */
export const LONG_PRESS_MS = 500

export interface MobileMessageRowProps {
    message: BaseMessage
    /** Continues the message above: no avatar, no name, and on a phone no gutter time. */
    continued?: boolean
    /** Arrived while the reader followed the end (C18). */
    arrived?: boolean
    priority?: boolean
    editing: boolean
    onEditSave: (body: string) => void
    onEditCancel: () => void
    /** A tap on the row: its thread. */
    onOpen: (e: React.MouseEvent) => void
    onUserClick: (e: React.MouseEvent) => void
    /** The long-press handlers (hooks/useLongPress), off while pending. */
    longPress: Record<string, unknown>
    addReaction: (emojiId: string, reactionId: string) => void
    removeReaction: (reactionId: string) => void
    onSelectAttachment: (attachment: AttachmentMediaReq) => void
    mediaGetUrl: string
    /** Under the row: a DM's seen line, say. */
    footer?: React.ReactNode
}

/** What the long-press sheet lifts above itself (C61). */
export function sheetPreview(message: BaseMessage, name: string): MessageSheetPreview {
    return {
        name,
        profileKey: message.from.user_profile_object_key,
        userUUID: message.from.user_uuid,
        isBot: !!message.from.is_bot,
        html: message.bodyText,
        createdAt: message.createdAt,
    }
}

function editedTitle(createdAt: string, updatedAt?: string): string | undefined {
    if (!updatedAt) return undefined
    const made = new Date(createdAt).getTime()
    const changed = new Date(updatedAt).getTime()
    if (!Number.isFinite(made) || !Number.isFinite(changed) || changed - made <= 1000) return undefined
    return `Edited ${chatClock(updatedAt)} · originally ${chatClock(createdAt)}`
}

/**
 * A message on a phone (design v3 chat, C07 phone): the desktop row's grammar
 * at a 32px avatar with a 10px gap, 16px insets, 8px for a turn's first row
 * and 2px for a continued one, the body at 16/24, and no gutter time (the
 * action sheet shows it). There is no hover: a press shows the press overlay
 * after 60ms, so a scroll never flashes it, and a hold shrinks the row to
 * .985 over the 500ms it takes to open the action sheet. The row that is for
 * you, the agent's provenance, the reply line, cards, reactions and the send
 * states are the desktop row's.
 */
export const MobileMessageRow = React.memo(function MobileMessageRow({
    message,
    continued = false,
    arrived = false,
    priority,
    editing,
    onEditSave,
    onEditCancel,
    onOpen,
    onUserClick,
    longPress,
    addReaction,
    removeReaction,
    onSelectAttachment,
    mediaGetUrl,
    footer,
}: MobileMessageRowProps) {
    const selfProfile = useFetchOnlyOnce<UserProfileInterface>(GetEndpointUrl.SelfProfile)
    const selfId = selfProfile.data?.data?.user_uuid
    const userInfoState = useUserInfoState(message.from.user_uuid)
    const relayed = useRelayedAuthor(message.from, message.bodyText)
    const botKinds = useBotKindMap()
    const kind = useBotKind(message.from.user_uuid, !!message.from.is_bot)
    const isAgent = !relayed && !!message.from.is_bot && isAIBot(kind)
    const authorName = relayed ? relayed.name : messageAuthorName(message.from, userInfoState?.userName)
    const body = relayed ? relayed.body : message.bodyText
    const forMe = useMemo(() => mentionsUser(message.bodyText, selfId), [message.bodyText, selfId])
    const mentionContext = useMemo<MentionContext>(() => ({ me: selfId, agentIds: agentIdsOf(botKinds) }), [selfId, botKinds])
    const emojiOnly = useMemo(() => isEmojiOnly(body), [body])
    const edited = editedTitle(message.createdAt, message.updatedAt)
    const handleInternalLinkClick = useInternalLinkRouter(!editing)
    const sending = message.sendState === "sending"
    const failed = message.sendState === "failed"
    const pending = !!message.sendState
    const draft = useRef(message.bodyText || "")

    // Pressed: the overlay after 60ms; held, the row shrinks toward the sheet.
    const [pressed, setPressed] = useState(false)
    const pressTimer = useRef(0)
    useEffect(() => () => window.clearTimeout(pressTimer.current), [])
    const pressStart = useCallback(() => {
        window.clearTimeout(pressTimer.current)
        pressTimer.current = window.setTimeout(() => setPressed(true), PRESS_DELAY_MS)
    }, [])
    const pressEnd = useCallback(() => {
        window.clearTimeout(pressTimer.current)
        setPressed(false)
    }, [])

    const reactions = useMemo(() => {
        const r: { [key: string]: string[] } = {}
        for (const reaction of message.reactions ?? []) {
            if (!reaction?.reaction_emoji_id) continue
            ;(r[reaction.reaction_emoji_id] ??= [])
            const name = displayNameOf(reaction.reaction_added_by)
            if (name) r[reaction.reaction_emoji_id].push(name)
        }
        return r
    }, [message.reactions])
    const mine = useMemo(() => (message.reactions ?? []).find((r) => r?.reaction_added_by?.user_uuid === selfId), [message.reactions, selfId])
    const [burstEmojiId, setBurstEmojiId] = useState<string | undefined>(undefined)
    const handleEmojiClick = useCallback(
        (emojiId: string) => {
            if (mine?.reaction_emoji_id === emojiId) {
                removeReaction(mine.uid)
                return
            }
            if (!mine) setBurstEmojiId(emojiId)
            addReaction(emojiId, mine?.uid ?? "")
        },
        [mine, addReaction, removeReaction],
    )

    const lp = pending || editing ? {} : longPress
    // The hold's own listeners (hooks/useLongPress) ride on its ref; the press
    // overlay listens alongside them.
    const handlers = {
        ...lp,
        onTouchStart: pressStart,
        onTouchEnd: pressEnd,
        onTouchMove: pressEnd,
        onTouchCancel: pressEnd,
    }

    return (
        <div onClick={editing ? undefined : onOpen} className={editing ? undefined : "block cursor-pointer"}>
            <div
                id={messageDomId(message.uuid)}
                data-message-row=""
                data-phone-row=""
                data-for-me={forMe || undefined}
                data-failed={failed || undefined}
                {...handlers}
                className={cn(
                    "relative isolate grid select-none grid-cols-[32px_minmax(0,1fr)] gap-x-2.5 px-4",
                    continued && !editing ? "py-0.5" : "py-2",
                    "transition-[background-color,scale] duration-[140ms] ease-out",
                    pressed && !editing && "scale-[0.985] bg-press duration-[500ms]",
                    forMe && !pressed && "bg-brand-muted/70 dark:bg-[color-mix(in_oklab,var(--brand)_10%,transparent)]",
                    editing && "bg-brand-muted/40",
                    (forMe || failed) && "before:absolute before:bottom-1.5 before:left-0 before:top-1.5 before:w-0.5 before:rounded-full",
                    forMe && !failed && "before:bg-brand",
                    failed && "before:bg-destructive",
                    arrived && (sending ? "origin-bottom-left animate-msg-in-own" : "animate-msg-in"),
                )}
            >
                {arrived && forMe && <span aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 bg-brand-muted animate-glow-settle" />}
                {continued && !editing ? (
                    // No gutter time on a phone: the sheet's lifted copy says when.
                    // A message on its way still shows its clock, a failed one its alert.
                    <span data-phone-gutter="" className="flex h-5 w-8 items-center justify-end">
                        {failed ? <FailedMark /> : sending ? <SendingNote compact /> : null}
                    </span>
                ) : (
                    <div data-row-avatar="" className="size-8 shrink-0 self-start" onClick={relayed ? undefined : onUserClick}>
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
                    {continued && !editing ? (
                        <span className="sr-only">{authorName}, {formatFullTimestamp(message.createdAt)}</span>
                    ) : (
                        <div data-name-line="" className="flex h-5 min-w-0 items-center gap-2">
                            <span className="truncate text-ui font-semibold text-ink" onClick={relayed ? undefined : onUserClick}>{authorName}</span>
                            {relayed ? (
                                <>
                                    <PrincipalTag kind={relayed.kind} />
                                    {relayed.kind === "bridge" && <span className="shrink-0 text-meta text-ink-3">via Slack</span>}
                                </>
                            ) : (
                                message.from.is_bot && <BotTag userUUID={message.from.user_uuid} />
                            )}
                            {failed ? (
                                <FailedMark />
                            ) : (
                                <time dateTime={isoTimestamp(message.createdAt)} className={cn("shrink-0 text-meta tabular-nums", forMe ? "text-brand-text" : "text-ink-3")}>
                                    {chatClock(message.createdAt)}
                                </time>
                            )}
                            {sending && <SendingNote />}
                        </div>
                    )}
                    {message.replyTo && !editing && (
                        <div className="interactive" onClick={(e) => e.stopPropagation()}>
                            <ReplyLine by={message.replyTo.from} text={message.replyTo.text} onJump={() => scrollToMessage(message.replyTo?.uuid)} />
                        </div>
                    )}
                    <div
                        data-emoji-only={emojiOnly && !editing ? "" : undefined}
                        className="chat-body chat-body-phone break-words"
                        onClickCapture={handleInternalLinkClick}
                        onClick={editing ? (e) => e.stopPropagation() : undefined}
                    >
                        <MinimalTiptapTextInput
                            throttleDelay={editing ? 0 : 300}
                            isOutputText={!editing}
                            className={cn("max-w-full h-auto", editing && "focus-halo rounded-[10px] bg-raised px-2.5 py-2")}
                            editorContentClassName="overflow-auto"
                            output="html"
                            content={body}
                            placeholder="Edit message…"
                            editable={editing}
                            noBorder={editing}
                            mentionContext={mentionContext}
                            editedTitle={edited}
                            buttonOnclick={() => onEditSave(draft.current)}
                            editorClassName="focus:outline-none"
                            onChange={(content) => {
                                draft.current = content as string
                            }}
                        />
                        {editing && (
                            <div className="mb-1 mt-2 flex items-center justify-end gap-2">
                                <Button type="button" size="sm" variant="ghost" onClick={onEditCancel}>Cancel</Button>
                                <Button type="button" size="sm" onClick={() => onEditSave(draft.current)}>Save</Button>
                            </div>
                        )}
                    </div>

                    {message.from.is_bot && !editing && <AgentResultCards text={message.bodyText} />}
                    {!editing && <WorkLinkCards text={message.bodyText} />}

                    {(message.fwdMsgPost || message.fwdMsgChat) && !editing && (
                        <MessagePreview
                            msgBy={message.fwdMsgPost?.from || message.fwdMsgChat?.from}
                            msgText={message.fwdMsgPost?.text || message.fwdMsgChat?.text || ""}
                            msgChannelName={message.fwdMsgPost?.channelName}
                            msgChannelUUID={message.fwdMsgPost?.channelUUID}
                            msgUUID={message.fwdMsgPost?.uuid || message.fwdMsgChat?.uuid}
                            msgCreatedAt={message.fwdMsgPost?.createdAt || message.fwdMsgChat?.createdAt}
                            deleted={(message.fwdMsgPost ?? message.fwdMsgChat)?.deleted}
                            vewFooter={true}
                        />
                    )}

                    {!editing && message.attachments && message.attachments.length > 0 && (
                        <MessageAttachments priority={priority} attachmentSelected={onSelectAttachment} attachments={message.attachments} mediaGetUrl={mediaGetUrl} />
                    )}

                    {isAgent && !editing && (
                        <AgentProvenance asker={message.replyTo && !message.replyTo.from?.is_bot ? { name: displayNameOf(message.replyTo.from), userUUID: message.replyTo.from?.user_uuid } : null} />
                    )}

                    {(message.comments?.length ?? 0) > 0 && (message.commentCount ?? 0) > 0 && (
                        <MessageReplyCount
                            replyCount={message.commentCount}
                            lastCommentCreatedAt={message.comments![message.comments!.length - 1].comment_created_at}
                            participants={replyParticipants(message.comments!.slice().reverse(), botKinds)}
                        />
                    )}

                    <SendStatus state={message.sendState} localId={message.localId} />

                    {!editing && !pending && (
                        <div className="interactive" onClick={(e) => e.stopPropagation()}>
                            <BottomMenu
                                handleEmojiClick={handleEmojiClick}
                                reactions={reactions}
                                selectedEmojiId={mine?.reaction_emoji_id ?? ""}
                                selfName={displayNameOf(selfProfile.data?.data)}
                                burstEmojiId={burstEmojiId}
                            />
                        </div>
                    )}
                </div>
            </div>
            {footer}
        </div>
    )
})
