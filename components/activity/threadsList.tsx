"use client"

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { VirtualInfiniteScroll } from "@/components/list/virtualInfiniteScroll"
import { ActivityFeedFrame } from "@/components/activity/activityFeedFrame"
import { HubEmpty, HubError } from "@/components/activity/hubEmpty"
import { useInboxDensity } from "@/components/activity/inboxDensity"
import { useInboxListKeys, type InboxPane } from "@/components/activity/useInboxListKeys"
import { HubRow, HubToolButton } from "@/components/ui/hubRow"
import { KindBadge } from "@/components/ui/kindBadge"
import { IdentityMark } from "@/components/ui/graphics/IdentityMark"
import { BotAvatar } from "@/components/ui/graphics/PrincipalAvatar"
import { Button } from "@/components/ui/button"
import { useFetch, useFetchOnlyOnce } from "@/hooks/useFetch"
import { useToast } from "@/hooks/use-toast"
import { useUserAvatar } from "@/hooks/useUserAvatar"
import axiosInstance, { OWN_ERRORS } from "@/lib/axiosInstance"
import { showsTarget, type PanelTarget } from "@/lib/activity/panelTarget"
import { previewParts, type PreviewPart } from "@/lib/activity/notification"
import {
    nameFor,
    newWords,
    placeOf,
    repliesWords,
    threadHref,
    threadsPageKey,
    threadTarget,
    THREADS_UNREAD_KEY,
    withRead,
    type FollowedThread,
    type ThreadsPage,
} from "@/lib/conversation/threads"
import { setThreadRead } from "@/lib/conversation/threadFollow"
import { appMutate } from "@/lib/swrMutate"
import { apiErrorMessage } from "@/lib/utils/apiError"
import { avatarSeed } from "@/lib/utils/getAvatarColor"
import { formatListTimestamp } from "@/lib/utils/date/formatTimeForPostOrComment"
import { cn } from "@/lib/utils/helpers/cn"
import { ArrowUpRight, Bot, Check, CircleDot } from "@/lib/icons"
import { GetEndpointUrl } from "@/services/endPoints"
import type { UserProfileInterface } from "@/types/user"

/** A plain click: a modifier opens the page as a link does, in a new tab or window. */
const plainClick = (e: React.MouseEvent) => e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey

/** One reply's thread, keyed by its root (its row's data-feed-key). */
const rootOf = (t: FollowedThread) => t.root

/**
 * The Inbox's Threads tab (chat P2): the threads you follow, unread first and
 * each newest reply first, in the Inbox's frame and rows. A row opens its
 * thread beside the list where there's room (the reading pane) and reads it;
 * J and K walk the rows as on every tab, U marks one read or unread, and the
 * header's Unread only and Mark all read work here as on the others.
 *
 * The first page is the server's, kept fresh by SWR (a reply anywhere asks for
 * it again, hooks/useMqttMessageHandler); older pages are read as the list
 * scrolls, and a thread the first page has now is shown once, as it says.
 */
export default function ThreadsList({ unreadOnly, onShowAll, pane }: { unreadOnly: boolean; onShowAll: () => void; pane?: InboxPane }) {
    const me = useFetchOnlyOnce<UserProfileInterface>(GetEndpointUrl.SelfProfile).data?.data?.user_uuid
    const { compact, densitySwitch } = useInboxDensity()
    const { toast } = useToast()
    const { data, isLoading, isError, mutate } = useFetch<{ data: ThreadsPage }>(threadsPageKey(0), undefined, undefined, OWN_ERRORS)
    const first = data?.data

    // Older pages, read on scroll: kept here, not in the cache.
    const [older, setOlder] = useState<{ threads: FollowedThread[]; next?: number }>({ threads: [] })
    const [loadingMore, setLoadingMore] = useState(false)
    const next = older.threads.length > 0 ? older.next : first?.next
    const all = useMemo(() => {
        const seen = new Set<string>()
        return [...(first?.threads ?? []), ...older.threads].filter((t) => (seen.has(t.root) ? false : (seen.add(t.root), true)))
    }, [first, older])
    const visible = useMemo(() => (unreadOnly ? all.filter((t) => t.unread) : all), [all, unreadOnly])

    const loadMore = useCallback(async () => {
        if (!next || loadingMore) return
        setLoadingMore(true)
        try {
            const res = await axiosInstance.get<{ data: ThreadsPage }>(threadsPageKey(next), OWN_ERRORS)
            setOlder((prev) => ({ threads: [...prev.threads, ...(res.data.data?.threads ?? [])], next: res.data.data?.next }))
        } catch {
            // The list stays as it is; scrolling asks again.
        } finally {
            setLoadingMore(false)
        }
    }, [next, loadingMore])

    // Read or unread: at once on screen, then the server; put back with a toast when it says no.
    const setRead = useCallback(
        async (t: FollowedThread, read: boolean) => {
            if (t.unread === !read) return
            const patch = (page: ThreadsPage) => withRead(page, t.root, read)
            if (first) void mutate({ data: patch(first) }, { revalidate: false })
            setOlder((prev) => ({ ...prev, threads: patch({ threads: prev.threads, unread: 0 }).threads }))
            try {
                await setThreadRead(t.root, read)
                void appMutate(THREADS_UNREAD_KEY)
            } catch (error) {
                void mutate()
                setOlder((prev) => ({ ...prev, threads: withRead({ threads: prev.threads, unread: 0 }, t.root, !read).threads }))
                toast({ title: read ? "Couldn't mark it read" : "Couldn't mark it unread", description: apiErrorMessage(error, "Try again in a moment."), variant: "destructive" })
            }
        },
        [first, mutate, toast],
    )

    const targetOf = useCallback((t: FollowedThread): PanelTarget | null => (pane ? threadTarget(t, me) : null), [pane, me])
    const box = useRef<HTMLDivElement>(null)
    useInboxListKeys({ box, entries: visible, keyOf: rootOf, pane, targetOf, isUnread: (t) => t.unread, setRead: (t, read) => void setRead(t, read) })

    // The panel shows a thread that has since had replies: it's being read.
    const shownRoot = pane ? visible.find((t) => showsTarget(pane.panel, targetOf(t)) && t.unread)?.root : undefined
    useEffect(() => {
        if (!shownRoot) return
        const t = visible.find((x) => x.root === shownRoot)
        if (t) void setRead(t, true)
    }, [shownRoot, visible, setRead])

    return (
        <ActivityFeedFrame
            actions={densitySwitch}
            loading={!isError && !first && isLoading}
            loadingLabel="Loading threads"
            state={
                isError && !first ? (
                    <HubError text="Your threads aren't loading. Nothing has been lost." onRetry={() => void mutate()} />
                ) : first && visible.length === 0 && unreadOnly && all.length > 0 ? (
                    <HubEmpty
                        spot="check"
                        title="Nothing unread"
                        description="Everything here has been read."
                        action={
                            <Button variant="ghost" size="sm" onClick={onShowAll}>
                                Show all
                            </Button>
                        }
                    />
                ) : first && visible.length === 0 ? (
                    <HubEmpty spot="message" title="No threads you follow" description="Reply in a thread, or follow one from its menu, and it lands here." />
                ) : null
            }
        >
            <div ref={box} data-inbox-list="" data-threads-list="" data-density={compact ? "compact" : "comfortable"} className="h-full">
                <VirtualInfiniteScroll
                    items={visible}
                    renderItem={(t: FollowedThread, i: number) => (
                        <ThreadRow
                            thread={t}
                            me={me}
                            compact={compact}
                            separated={i > 0}
                            open={pane ? showsTarget(pane.panel, targetOf(t)) : false}
                            target={targetOf(t)}
                            onOpenInPanel={pane?.open}
                            onToggleRead={setRead}
                        />
                    )}
                    onLoadMore={() => void loadMore()}
                    isLoading={loadingMore}
                    hasMore={!!next && !unreadOnly}
                    keyExtractor={rootOf}
                />
            </div>
        </ActivityFeedFrame>
    )
}

/**
 * One thread you follow, as a feed HubRow (design: DESIGN-BUILD-2, chat P2):
 *
 *   gutter   the unread dot, while a reply is new to you;
 *   lead     the root's author, 32px, with the reply badge;
 *   line 1   "Jonas Weber in #engineering", then "12 replies" and, while
 *            any are new, "3 new", a quiet tail;
 *   line 2   the root's words, mentions kept as chips;
 *   meta     when the latest reply came, swapped on hover for Mark read and Open.
 *
 * Compact draws one line: "Jonas Weber in #engineering · root… · 3 new".
 */
export function ThreadRow({
    thread,
    me,
    compact,
    separated,
    open,
    target,
    onOpenInPanel,
    onToggleRead,
}: {
    thread: FollowedThread
    me: string | undefined
    compact: boolean
    separated: boolean
    open: boolean
    /** Where it opens beside the Inbox; null where it opens as its page. */
    target: PanelTarget | null
    onOpenInPanel?: (target: PanelTarget) => void
    onToggleRead: (t: FollowedThread, read: boolean) => void
}) {
    const by = thread.message.by
    const name = nameFor(by, me)
    const place = placeOf(thread, me)
    const href = threadHref(thread, me)
    const { src } = useUserAvatar(by?.user_profile_object_key)
    const parts = useMemo<PreviewPart[]>(() => previewParts(thread.message.html || "", me), [thread.message.html, me])
    const fresh = newWords(thread)
    const time = thread.last_reply_at ? formatListTimestamp(thread.last_reply_at) : ""
    const label = `${name} in ${place}. ${repliesWords(thread.replies)}${fresh ? `, ${fresh}` : ""}`

    const box = compact ? "block size-6" : "block size-8"
    const lead = by?.is_bot ? (
        <span className={box}>
            <BotAvatar>
                <Bot />
            </BotAvatar>
        </span>
    ) : (
        <IdentityMark variant="avatar" size={compact ? 24 : 32} id={avatarSeed(by)} label={name} src={src} />
    )

    const sentence = (
        <>
            <b className="font-medium text-foreground">{name}</b> in <b className="font-medium text-foreground">{place}</b>
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
    ) : thread.message.files ? (
        <span className="text-ink-3">{thread.message.files === 1 ? "A file" : `${thread.message.files} files`}</span>
    ) : null
    // On a phone the sentence wraps to its two lines, and the count of replies
    // gives way to what's new, which is the row's news.
    const tail = (
        <>
            <span data-thread-replies="" className={cn("ml-1.5 text-meta text-ink-3", fresh && "max-sm:hidden")}>
                {repliesWords(thread.replies)}
            </span>
            {fresh ? (
                <span data-thread-new="" className="ml-1.5 text-meta font-semibold text-brand-text">
                    {fresh}
                </span>
            ) : null}
        </>
    )
    const stretched = "absolute inset-0 z-[1] rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand"

    return (
        <HubRow
            data-feed-row=""
            data-feed-key={thread.root}
            data-thread-row=""
            // J and K move focus row to row: a row with nothing to open still takes it.
            tabIndex={href ? undefined : -1}
            density={compact ? "compact" : "feed"}
            unread={thread.unread}
            selected={open}
            lead={
                <>
                    {lead}
                    {compact ? null : <KindBadge kind="reply" />}
                </>
            }
            title={
                compact ? (
                    <span className="text-ink-2">
                        {sentence}
                        {preview ? <span className="text-ink-3"> · {preview}</span> : null}
                        {fresh ? <span className="font-semibold text-brand-text"> · {fresh}</span> : null}
                    </span>
                ) : (
                    <span className="text-ink-2">
                        {sentence}
                        {tail}
                    </span>
                )
            }
            second={compact ? undefined : preview}
            meta={time || undefined}
            opens={!!href}
            className={cn(
                separated && !compact && "before:pointer-events-none before:absolute before:left-14 before:right-4 before:top-0 before:h-px before:bg-line hover:before:opacity-0",
            )}
            tools={
                <>
                    <HubToolButton
                        label={thread.unread ? "Mark read" : "Mark unread"}
                        shortcut="U"
                        onClick={(e) => {
                            e.preventDefault()
                            onToggleRead(thread, thread.unread)
                        }}
                    >
                        {thread.unread ? <Check /> : <CircleDot />}
                    </HubToolButton>
                    {href ? (
                        <Link
                            href={href}
                            aria-label="Open"
                            title="Open"
                            onClick={() => onToggleRead(thread, true)}
                            className="grid size-6 place-items-center rounded-sm text-ink-3 transition-colors hover:bg-hover hover:text-foreground [&_svg]:size-3.5"
                        >
                            <ArrowUpRight />
                        </Link>
                    ) : null}
                </>
            }
        >
            {href ? (
                <Link
                    href={href}
                    aria-label={label}
                    data-row-link=""
                    onClick={(e) => {
                        onToggleRead(thread, true)
                        // Beside the Inbox, where it has room: the page stays, the panel opens.
                        if (target && onOpenInPanel && plainClick(e)) {
                            e.preventDefault()
                            onOpenInPanel(target)
                        }
                    }}
                    className={stretched}
                />
            ) : null}
        </HubRow>
    )
}
