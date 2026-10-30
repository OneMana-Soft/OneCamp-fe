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
 *
 * The reading pane (STEP4 #6): where the screen has room for the right panel,
 * a plain click on a row whose link is a thread, a task or an event opens it
 * beside the Inbox (onOpenInPanel) instead of leaving it; the link still
 * opens the page in a new tab, and Open (↗) the page itself. A fold of one
 * person's shares opens in place and lists its docs. Compact draws one line.
 */
import { avatarSeed } from "@/lib/utils/getAvatarColor"
import React, { useMemo } from "react"
import Link from "next/link"

import { displayNameOf } from "@/lib/personName"
import { UnifiedActivityItem } from "@/types/activity"
import { IdentityMark } from "@/components/ui/graphics/IdentityMark"
import { AgentAvatar, BotAvatar } from "@/components/ui/graphics/PrincipalAvatar"
import { ArrowUpRight, Bot, Check, ChevronDown, CircleDot, FileText } from "@/lib/icons"
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
import { collapsedVerb, kindOf, othersCount, previewParts, sentenceOf, sharedDocs, sharesWords, timeUnderDay, type FeedEntry, type PreviewPart } from "@/lib/activity/notification"
import { activityKey } from "@/lib/activity/feedPages"
import { panelTargetOf, type PanelTarget } from "@/lib/activity/panelTarget"
import { SaveForLaterButton, type LaterTarget } from "@/components/later/SaveForLater"
import { removeHtmlTags } from "@/lib/utils/removeHtmlTags"
import { cn } from "@/lib/utils/helpers/cn"
import { ix } from "@/lib/ui/interactive"

interface ActivityCardProps {
    activity: UnifiedActivityItem
    /** A collapsed row (A6): everyone else in it. */
    entry?: FeedEntry
    /** Undefined draws no dot (a list with no read state). */
    unread?: boolean
    onToggleRead?: (keys: string[], read: boolean) => void
    /** The row is chosen (its tint and bar). */
    selected?: boolean
    /** Draw the hairline above the row (inset to the content column): rows in a virtual list are not siblings. */
    separated?: boolean
    /** It sits under a day header, so its time says only what the header has not. */
    underDay?: boolean
    onClick?: () => void
    /** One line instead of two: the Inbox's Compact (STEP4 #6). */
    compact?: boolean
    /** Opens the row beside the Inbox, where the screen has room for the right panel (the reading pane). */
    onOpenInPanel?: (target: PanelTarget) => void
    /** The panel shows this row now. */
    open?: boolean
    /** The keyboard's place in the list (J and K). */
    cursor?: boolean
    /** A fold of shares shows its docs. */
    expanded?: boolean
    onToggleExpanded?: () => void
}

/** A plain click: a modifier or another button opens the page as a link does, in a new tab or window. */
const plainClick = (e: React.MouseEvent) => e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey

export const ActivityCard: React.FC<ActivityCardProps> = ({
    activity,
    entry,
    unread,
    onToggleRead,
    selected,
    separated,
    underDay,
    onClick,
    compact = false,
    onOpenInPanel,
    open = false,
    cursor = false,
    expanded = false,
    onToggleExpanded,
}) => {
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
    const collapsed = entry?.collapsed
    // One person's shares, folded (STEP4 #6): "shared 6 docs with you", and their names under it.
    const shares = useMemo(() => (collapsed === "shares" && entry ? sharesWords(entry) : null), [collapsed, entry])
    const parts = useMemo<PreviewPart[]>(
        () => (shares ? (shares.preview ? [{ text: shares.preview }] : []) : previewParts(s.preview, currentUserId)),
        [shares, s.preview, currentUserId],
    )
    const href = activityHref(activity, currentUserId)
    const keys = useMemo(() => [activityKey(activity), ...(entry?.others ?? []).map(activityKey)], [activity, entry])
    // Where the row opens beside the Inbox, when the screen has room for the panel.
    const panel = onOpenInPanel && !shares ? panelTargetOf(href, currentUserId) : null

    const people = collapsed === "reactions" && entry ? othersCount(entry) : 0
    const verb = (entry && collapsedVerb(entry)) || s.verb
    const place = shares ? shares.place : s.place
    const tail = shares ? " with you" : ""

    // Compact draws a 24px lead and no badge: its one line says the kind in words.
    const box = compact ? "block size-6" : "block size-8"
    const lead =
        collapsed === "reactions" && people > 0 && entry && !compact ? (
            <ReactionStack entry={entry} />
        ) : activity.actor_kind === "agent" ? (
            <span className={box}>
                <AgentAvatar />
            </span>
        ) : activity.actor_kind === "app" || s.actor?.is_bot ? (
            <span className={box}>
                <BotAvatar>
                    <Bot />
                </BotAvatar>
            </span>
        ) : (
            <IdentityMark variant="avatar" size={compact ? 24 : 32} id={avatarSeed(s.actor)} label={name} src={src} />
        )

    const sentence = (
        <>
            <b className="font-medium text-foreground">{name}</b>
            {people > 0 ? ` and ${people} ${people === 1 ? "other" : "others"}` : null} {verb}
            {place ? (
                <>
                    {" "}
                    <b className="font-medium text-foreground">{place}</b>
                </>
            ) : null}
            {tail}
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

    const label = `${name} ${verb}${place ? ` ${place}` : ""}${tail}`
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
    const stretched = "absolute inset-0 z-[1] rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand"
    const docs = shares && entry && expanded ? sharedDocs(entry, activityKey) : []

    return (
        <HubRow
            data-feed-row=""
            data-feed-key={entry?.key}
            data-collapsed={collapsed}
            data-expanded={docs.length ? "" : undefined}
            // J and K move focus row to row (activityFeedList): a row with nothing to open still takes it.
            tabIndex={href || shares ? undefined : -1}
            density={compact ? "compact" : "feed"}
            unread={unread}
            selected={selected || open}
            cursor={cursor}
            lead={
                <>
                    {lead}
                    {compact ? null : <KindBadge kind={kind} emoji={emoji} />}
                </>
            }
            title={
                compact ? (
                    // One line: the sentence, then the preview in ink-3 after a dot.
                    <span className="text-ink-2">
                        {sentence}
                        {preview ? <span className="text-ink-3"> · {preview}</span> : null}
                    </span>
                ) : (
                    sentence
                )
            }
            second={compact ? undefined : preview}
            meta={time || undefined}
            // Opens through the control stretched over it: a row of the interaction layer (SH-31).
            opens={!!href || !!shares}
            className={cn(
                separated && !compact && "after:pointer-events-none after:absolute after:left-14 after:right-4 after:top-0 after:h-px after:bg-line hover:after:opacity-0",
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
                        {href && !shares ? (
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
            {shares ? (
                // A fold opens in place: its docs, each a link of its own.
                <button
                    type="button"
                    data-row-link=""
                    aria-expanded={expanded}
                    aria-label={`${label}. ${expanded ? "Hide" : "Show"} them`}
                    onClick={() => {
                        if (!expanded) onToggleRead?.(keys, true)
                        onToggleExpanded?.()
                        onClick?.()
                    }}
                    className={stretched}
                />
            ) : href ? (
                <Link
                    href={href}
                    aria-label={label}
                    data-row-link=""
                    onClick={(e) => {
                        onToggleRead?.(keys, true)
                        onClick?.()
                        // Beside the Inbox, where it has room: the page stays, the panel opens.
                        if (panel && onOpenInPanel && plainClick(e)) {
                            e.preventDefault()
                            onOpenInPanel(panel)
                        }
                    }}
                    className={stretched}
                />
            ) : null}
            {shares ? (
                <ChevronDown
                    aria-hidden
                    data-fold-chevron=""
                    className={cn("pointer-events-none absolute right-4 top-[34px] size-3.5 text-ink-3 transition-transform duration-200", expanded && "rotate-180", compact && "hidden")}
                />
            ) : null}
            {docs.length ? (
                <span role="list" aria-label={`Docs ${name} shared with you`} data-shared-docs="" className="relative z-[2] mt-2 block">
                    {docs.map((d) => (
                        <span role="listitem" key={d.key} className="block">
                            {d.href ? (
                                <Link
                                    href={d.href}
                                    {...ix("item")}
                                    className="-mx-2 flex h-8 items-center gap-2 rounded-md px-2 text-ui-sm"
                                >
                                    <FileText aria-hidden className="size-3.5 shrink-0 text-ink-3" />
                                    <span className="min-w-0 flex-1 truncate font-medium text-foreground">{d.title}</span>
                                    <span className="shrink-0 text-meta text-ink-3">{d.level}</span>
                                </Link>
                            ) : (
                                <span className="-mx-2 flex h-8 items-center gap-2 px-2 text-ui-sm text-ink-3">
                                    <FileText aria-hidden className="size-3.5 shrink-0" />
                                    <span className="min-w-0 flex-1 truncate">{d.title}</span>
                                </span>
                            )}
                        </span>
                    ))}
                </span>
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
