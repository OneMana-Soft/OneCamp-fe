"use client"

/**
 * One notification (hub.md A4), as a feed HubRow:
 *
 *   gutter   a 6px brand dot while unread, and nothing else, so marking it
 *            read moves nothing;
 *   lead     the actor's 32px avatar (an agent's square, a bot's square) with a
 *            kind badge (A5);
 *   line 1   a sentence that names the place: "Jonas Weber mentioned you in
 *            #engineering", actor and place in ink 510, the verb in ink-2;
 *   line 2   the preview, with your own mention as the "@You" chip;
 *   meta     the time, swapped for the hover toolbar (read, open).
 *
 * The row opens where it points (lib/activity/activityHref) through a real
 * link stretched over it, so a modifier click opens a new tab and next/link
 * fetches the destination early, while the toolbar's buttons stay buttons.
 */
import { avatarSeed } from "@/lib/utils/getAvatarColor"
import React, { useMemo } from "react"
import Link from "next/link"

import { displayNameOf } from "@/lib/personName"
import { UnifiedActivityItem } from "@/types/activity"
import { IdentityMark } from "@/components/ui/graphics/IdentityMark"
import { AgentAvatar, BotAvatar } from "@/components/ui/graphics/PrincipalAvatar"
import { ArrowUpRight, Bot, Check, CircleDot } from "@/lib/icons"
import { UserProfileInterface } from "@/types/user"
import { useFetchOnlyOnce } from "@/hooks/useFetch"
import { GetEndpointUrl } from "@/services/endPoints"
import { useUserAvatar } from "@/hooks/useUserAvatar"
import { findEmojiMartEmojiByEmojiID } from "@/lib/utils/reaction/findReaction"
import { useEmojiMartData } from "@/hooks/reactions/useEmojiMartData"
import { activityHref } from "@/lib/activity/activityHref"
import { formatListTimestamp } from "@/lib/utils/date/formatTimeForPostOrComment"
import { HubRow, HubToolButton } from "@/components/ui/hubRow"
import { KindBadge } from "@/components/ui/kindBadge"
import { collapsedVerb, kindOf, othersCount, previewParts, sentenceOf, timeUnderDay, type FeedEntry } from "@/lib/activity/notification"
import { activityKey } from "@/lib/activity/feedPages"
import { SaveForLaterButton, type LaterTarget } from "@/components/later/SaveForLater"
import { removeHtmlTags } from "@/lib/utils/removeHtmlTags"
import { cn } from "@/lib/utils/helpers/cn"

interface ActivityCardProps {
    activity: UnifiedActivityItem
    /** A collapsed row (A6): everyone else in it. */
    entry?: FeedEntry
    /** Undefined draws no dot (a list with no read state). */
    unread?: boolean
    onToggleRead?: (keys: string[], read: boolean) => void
    /** The keyboard cursor is on this row. */
    selected?: boolean
    /** Draw the hairline above the row (inset to the content column): rows in a virtual list are not siblings. */
    separated?: boolean
    /** It sits under a day header, so its time says only what the header has not. */
    underDay?: boolean
    onClick?: () => void
}

export const ActivityCard: React.FC<ActivityCardProps> = ({ activity, entry, unread, onToggleRead, selected, separated, underDay, onClick }) => {
    const emojiData = useEmojiMartData()
    const { data: selfProfile } = useFetchOnlyOnce<UserProfileInterface>(GetEndpointUrl.SelfProfile)
    const currentUserId = selfProfile?.data?.user_uuid

    const s = useMemo(() => sentenceOf(activity), [activity])
    const kind = kindOf(activity)
    const name = displayNameOf(s.actor) || "Someone"
    const { src } = useUserAvatar(s.actor?.user_profile_object_key)
    const emoji =
        activity.activity_type === "REACTION"
            ? findEmojiMartEmojiByEmojiID(emojiData.data, activity.reaction?.reaction_emoji_id ?? "")?.skins[0].native
            : undefined
    const parts = useMemo(() => previewParts(s.preview, currentUserId), [s.preview, currentUserId])
    const href = activityHref(activity, currentUserId)
    const keys = useMemo(() => [activityKey(activity), ...(entry?.others ?? []).map(activityKey)], [activity, entry])

    const collapsed = entry?.collapsed
    const people = collapsed === "reactions" && entry ? othersCount(entry) : 0
    const verb = (entry && collapsedVerb(entry)) || s.verb

    const lead =
        collapsed === "reactions" && people > 0 && entry ? (
            <ReactionStack entry={entry} />
        ) : activity.actor_kind === "agent" ? (
            <span className="block size-8">
                <AgentAvatar />
            </span>
        ) : activity.actor_kind === "app" || s.actor?.is_bot ? (
            <span className="block size-8">
                <BotAvatar>
                    <Bot />
                </BotAvatar>
            </span>
        ) : (
            <IdentityMark variant="avatar" size={32} id={avatarSeed(s.actor)} label={name} src={src} />
        )

    const sentence = (
        <>
            <b className="font-medium text-foreground">{name}</b>
            {people > 0 ? ` and ${people} ${people === 1 ? "other" : "others"}` : null} {verb}
            {s.place ? (
                <>
                    {" "}
                    <b className="font-medium text-foreground">{s.place}</b>
                </>
            ) : null}
        </>
    )

    const preview = parts.length ? (
        <>
            {parts.map((p, i) =>
                p.mention ? (
                    <span key={i} className={`${p.mention === "me" ? "hub-me" : "hub-mention"} mx-px text-meta leading-[18px]`}>
                        {p.text}
                    </span>
                ) : (
                    <React.Fragment key={i}>{p.text}</React.Fragment>
                ),
            )}
        </>
    ) : null

    const label = `${name} ${verb}${s.place ? ` ${s.place}` : ""}`
    // What Save for later keeps: the message itself, where there is one.
    const saveTarget = useMemo<LaterTarget | null>(() => {
        if (!href) return null
        const post = activity.mention?.mention_post || activity.comment?.comment_post || activity.reaction?.post
        const chat = activity.mention?.mention_chat || activity.reaction?.chat
        const title = removeHtmlTags(s.preview || "").slice(0, 140) || label
        if (post?.post_uuid) return { itemType: "post", itemId: post.post_uuid, link: href, title, context: s.place }
        if (chat?.chat_uuid) return { itemType: "chat", itemId: chat.chat_uuid, link: href, title, context: name }
        return null
    }, [activity, href, s.preview, s.place, name, label])

    const time = s.at ? (underDay ? timeUnderDay(s.at) : formatListTimestamp(s.at)) : ""

    return (
        <HubRow
            data-feed-row=""
            density="feed"
            unread={unread}
            selected={selected}
            lead={
                <>
                    {lead}
                    <KindBadge kind={kind} emoji={emoji} />
                </>
            }
            title={sentence}
            second={preview}
            meta={time || undefined}
            // Opens through the link stretched over it: a row of the interaction layer (SH-31).
            opens={!!href}
            className={cn(
                separated && "before:pointer-events-none before:absolute before:left-14 before:right-4 before:top-0 before:h-px before:bg-line hover:before:opacity-0",
            )}
            tools={
                onToggleRead || href ? (
                    <>
                        {onToggleRead && unread !== undefined ? (
                            <HubToolButton
                                label={unread ? "Mark read" : "Mark unread"}
                                shortcut="U"
                                onClick={(e) => {
                                    e.preventDefault()
                                    onToggleRead(keys, Boolean(unread))
                                }}
                            >
                                {unread ? <Check /> : <CircleDot />}
                            </HubToolButton>
                        ) : null}
                        {saveTarget ? <SaveForLaterButton target={saveTarget} className="size-6 [&_svg]:size-3.5" /> : null}
                        {href ? (
                            <Link
                                href={href}
                                aria-label="Open"
                                title="Open"
                                onClick={() => onToggleRead?.(keys, true)}
                                className="grid size-6 place-items-center rounded-sm text-ink-3 transition-colors hover:bg-hover hover:text-foreground [&_svg]:size-3.5"
                            >
                                <ArrowUpRight />
                            </Link>
                        ) : null}
                    </>
                ) : undefined
            }
        >
            {href ? (
                <Link
                    href={href}
                    aria-label={label}
                    data-row-link=""
                    onClick={() => {
                        onToggleRead?.(keys, true)
                        onClick?.()
                    }}
                    className="absolute inset-0 z-[1] rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand"
                />
            ) : null}
        </HubRow>
    )
}

/** Up to two reactors, 20px, offset diagonally inside the 32px lead (A6). */
function ReactionStack({ entry }: { entry: FeedEntry }) {
    const seen = new Set<string>()
    const people = [entry.item, ...entry.others]
        .map((i) => i.reaction?.reaction_added_by)
        .filter((u): u is NonNullable<typeof u> => {
            if (!u?.user_uuid || seen.has(u.user_uuid)) return false
            seen.add(u.user_uuid)
            return true
        })
        .slice(0, 2)
    return (
        <span className="relative block size-8" data-reaction-stack="">
            {people.map((u, i) => (
                <span key={u.user_uuid} className="absolute rounded-full ring-2 ring-sheet" style={{ left: i * 12, top: i * 12 }}>
                    <IdentityMark variant="avatar" size={20} id={avatarSeed(u)} label={displayNameOf(u) || "?"} />
                </span>
            ))}
        </span>
    )
}
