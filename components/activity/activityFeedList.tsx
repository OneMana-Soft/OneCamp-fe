"use client"

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { VirtualInfiniteScroll } from "@/components/list/virtualInfiniteScroll"
import { ActivityCard } from "@/components/activity/activityCard"
import { ActivityFeedFrame } from "@/components/activity/activityFeedFrame"
import { UnifiedActivityItem, UnifiedActivityPaginationRes } from "@/types/activity"
import type { UserProfileInterface } from "@/types/user"
import { GetEndpointUrl } from "@/services/endPoints"
import { useFetch, useFetchOnlyOnce } from "@/hooks/useFetch"
import { Button } from "@/components/ui/button"
import { HubEmpty, HubError } from "@/components/activity/hubEmpty"
import { HubSegmented } from "@/components/activity/hubFrame"
import { actorFilters, matchesActor, parseActorFilter, type ActorFilter } from "@/lib/activity/actor"
import { activityHref } from "@/lib/activity/activityHref"
import { activityKey, collapseEchoes, hasSubject, inboxFeedKey, INBOX_PAGE_SIZE, mergeActivityPages, olderPageCursor } from "@/lib/activity/feedPages"
import { isMention } from "@/lib/activity/notice"
import { aggregate, dayGroupOf, priorityGroupOf, PRIORITY_GROUP_ORDER, type FeedEntry } from "@/lib/activity/notification"
import { panelTargetOf, showsTarget } from "@/lib/activity/panelTarget"
import { useInboxListKeys, type InboxPane } from "@/components/activity/useInboxListKeys"
import { useInboxDensity } from "@/components/activity/inboxDensity"
import { isUnread } from "@/lib/activity/readState"
import { cn } from "@/lib/utils/helpers/cn"

/** Where each viewer's row size is kept (components/activity/inboxDensity). */
export { INBOX_DENSITY_KEY } from "@/components/activity/inboxDensity"

export type { InboxPane } from "@/components/activity/useInboxListKeys"

/** A feed entry's key: its row's data-feed-key. */
const entryKey = (e: FeedEntry) => e.key

/** A row of the feed list: a group header (A7, A8) or an entry. */
type FeedListRow = { kind: "header"; label: string; unread: number } | { kind: "entry"; entry: FeedEntry; first: boolean }

/** The who-filter's identity glyph per segment (A3). */
const WHO_GLYPH: Record<ActorFilter, ReactNode> = {
    everyone: null,
    person: <span aria-hidden className="size-2 rounded-full bg-gradient-to-br from-[var(--camp-berry-a1)] to-[var(--camp-berry-a2)]" />,
    agent: <span aria-hidden className="size-2.5 rounded-[3px] bg-agent" />,
    app: <span aria-hidden className="size-2.5 rounded-[3px] bg-ink-4" />,
}

/** The Activity tabs that are views of one feed. */
export type FeedView = "priority" | "all" | "mentions"

const PAGE_SIZE = INBOX_PAGE_SIZE
/** Pages a filtered view pulls on its own, per ask, before it stops and offers more. */
const MAX_AUTO_PAGES = 5

const inView: Record<FeedView, (a: UnifiedActivityItem) => boolean> = {
    // The server scores each item (mentions that ask something, actionable
    // comments) and demotes what you have already seen.
    priority: (a) => a.priority === "high",
    all: () => true,
    mentions: isMention,
}

/**
 * How many rows a filtered view looks for before it stops pulling older pages
 * on its own. Priority is what needs you now, so one is enough; Mentions and a
 * "who" filter fill a first screen, as All does.
 */
const wantedFor = (view: FeedView) => (view === "priority" ? 1 : PAGE_SIZE)

/**
 * Priority, All and Mentions: one feed, three views of it, in one frame.
 *
 * MENTIONS READS THE SAME FEED. It read /activity/mentions and adapted each
 * mention into a thin item (type, time and the mention), so a mention carried
 * no priority and no actor and could render differently here and in All. It
 * also read `mentions` off a reply that carries them under `data`, so the tab
 * said "No mentions yet" to everybody. Now every tab filters the items the
 * server built, so a mention is the same item, and the same row, wherever it
 * shows.
 *
 * READING BESIDE THE LIST (STEP4 #6). With a pane (any screen wider than a
 * phone), a row that is a thread, a task or an event opens in the right
 * panel and the Inbox stays: the row the panel shows is chosen. J and K (or
 * the arrows) move through the rows, and while the panel shows one of them
 * it follows; Enter opens the row, U marks it read or unread. Compact draws
 * one line a row, chosen per viewer, never on a phone.
 */
export function ActivityFeedList({
    view,
    onViewAll,
    unreadOnly = false,
    read,
    onToggleRead,
    onUnreadKeys,
    onShowAll,
    pane,
}: {
    view: FeedView
    onViewAll?: () => void
    /** Show only unread rows (the header's switch). */
    unreadOnly?: boolean
    /** What the reader has marked read (lib/activity/readState); no dots without it. */
    read?: ReadonlySet<string>
    onToggleRead?: (keys: string[], read: boolean) => void
    /** The keys of every unread row in view, for the header's Mark all read and counts. */
    onUnreadKeys?: (keys: string[]) => void
    /** Turn the unread-only switch off. */
    onShowAll?: () => void
    /** The reading pane, where the screen has room for it. */
    pane?: InboxPane
}) {
    const searchParams = useSearchParams()
    const router = useRouter()
    const pathname = usePathname()
    // This edition has no AI, so the filters never offer agents.
    const aiAvailable = false
    const me = useFetchOnlyOnce<UserProfileInterface>(GetEndpointUrl.SelfProfile).data?.data?.user_uuid
    const { compact, densitySwitch } = useInboxDensity()
    // Folds of shares that show their docs.
    const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set())
    const toggleExpanded = useCallback((key: string) => {
        setExpanded((prev) => {
            const next = new Set(prev)
            if (next.has(key)) next.delete(key)
            else next.add(key)
            return next
        })
    }, [])
    // People, agents or apps: kept in the URL so a reload or a shared link
    // shows the same slice of the feed.
    const who: ActorFilter = parseActorFilter(searchParams.get("who"))
    const filtering = view !== "all" || who !== "everyone"

    // Cursor pagination: the feed answers items strictly older than `beforeTime`.
    const [cursor, setCursor] = useState("")
    // Pages already answered, in the order asked for. The page being asked for
    // is read straight from the fetch, so a cached page draws on the first
    // render rather than after an effect has copied it, which drew the empty
    // state for a frame on every tab switch.
    const [pages, setPages] = useState<{ cursor: string; items: UnifiedActivityItem[] }[]>([])
    const [storedHasMore, setStoredHasMore] = useState(true)

    const endpoint = inboxFeedKey(GetEndpointUrl.GetUnifiedActivity, PAGE_SIZE, cursor)
    const { data: pageData, isLoading, isError, mutate } = useFetch<UnifiedActivityPaginationRes>(endpoint)
    const current = pageData?.data?.activities

    useEffect(() => {
        if (!pageData?.data) return
        const items = pageData.data.activities ?? []
        // The newest page answering again starts the list over; an older one appends.
        setPages((prev) => (cursor === "" ? [{ cursor, items }] : [...prev.filter((p) => p.cursor !== cursor), { cursor, items }]))
        setStoredHasMore(pageData.data.has_more ?? false)
    }, [pageData, cursor])

    const loaded = useMemo(
        () =>
            mergeActivityPages([
                ...pages.filter((p) => p.cursor !== cursor).map((p) => p.items),
                current ?? pages.find((p) => p.cursor === cursor)?.items ?? [],
            ]),
        [pages, cursor, current],
    )
    const hasMore = pageData?.data ? (pageData.data.has_more ?? false) : storedHasMore
    // Paging reads every item the server sent (`loaded`); the rows are the ones
    // with something to show.
    // One row per thing said: the server can send one sentence as several
    // records (collapseEchoes says when).
    const inScope = useMemo(
        () => collapseEchoes(loaded.filter((a) => hasSubject(a) && inView[view](a) && matchesActor(a, who))),
        [loaded, view, who],
    )
    const unreadOf = useMemo(() => {
        const set = read ?? new Set<string>()
        return (a: UnifiedActivityItem) => isUnread(a, activityKey(a), set)
    }, [read])
    const visible = useMemo(() => (unreadOnly ? inScope.filter(unreadOf) : inScope), [inScope, unreadOnly, unreadOf])

    // Rows, collapsed (A6) and grouped: by day, or on Priority by what it asks
    // of you (A8). A header says how many in it are unread.
    const rows = useMemo<FeedListRow[]>(() => {
        const entries = aggregate(visible, activityKey)
        const groupOf = (e: FeedEntry) => (view === "priority" ? priorityGroupOf(e.item) : dayGroupOf(e.item.time))
        const order: string[] = view === "priority" ? PRIORITY_GROUP_ORDER : ["Today", "Yesterday", "Earlier this week", "Older"]
        const byGroup = new Map<string, FeedEntry[]>()
        for (const e of entries) {
            const g = groupOf(e)
            byGroup.set(g, [...(byGroup.get(g) ?? []), e])
        }
        const out: FeedListRow[] = []
        for (const g of order) {
            const list = byGroup.get(g)
            if (!list?.length) continue
            out.push({ kind: "header", label: g, unread: read ? list.filter((e) => unreadOf(e.item)).length : 0 })
            list.forEach((entry, i) => out.push({ kind: "entry", entry, first: i === 0 }))
        }
        return out
    }, [visible, view, read, unreadOf])

    const unreadKeys = useMemo(() => inScope.filter(unreadOf).map(activityKey), [inScope, unreadOf])
    const unreadSig = unreadKeys.join(",")
    useEffect(() => {
        onUnreadKeys?.(unreadSig ? unreadSig.split(",") : [])
    }, [unreadSig, onUnreadKeys])

    // The reading pane: where each row opens beside the list (null for a fold
    // or a page the panel can't hold), and which row it shows now.
    const targetOf = useCallback((e: FeedEntry) => (e.collapsed === "shares" ? null : panelTargetOf(activityHref(e.item, me), me)), [me])
    const entries = useMemo(() => rows.flatMap((r) => (r.kind === "entry" ? [r.entry] : [])), [rows])
    const box = useRef<HTMLDivElement>(null)
    // J, K and U (useInboxListKeys): every tab of the Inbox walks its rows alike.
    useInboxListKeys({
        box,
        entries,
        keyOf: entryKey,
        pane,
        targetOf,
        isUnread: (e) => [e.item, ...e.others].some(unreadOf),
        setRead: onToggleRead ? (e, read) => onToggleRead([e.item, ...e.others].map(activityKey), read) : undefined,
    })

    // What this view is looking for, and how many pages it has pulled for it.
    // Held against the view and filter it was asked under, so a new view or
    // filter starts afresh in the same render rather than one effect later.
    const ask = `${view}|${who}`
    const [search, setSearch] = useState({ ask, wanted: wantedFor(view), pulled: 0 })
    const { wanted, pulled } = search.ask === ask ? search : { wanted: wantedFor(view), pulled: 0 }
    const askFor = (n: number) => setSearch({ ask, wanted: n, pulled: 0 })

    const nextCursor = olderPageCursor(loaded[loaded.length - 1]?.time)
    // A filtered view keeps pulling older pages until it has what it wants,
    // the feed ends, or it has pulled MAX_AUTO_PAGES for this ask.
    const capped = pulled >= MAX_AUTO_PAGES
    const searching = filtering && hasMore && !capped && visible.length < wanted && !isError
    useEffect(() => {
        if (!searching || isLoading || loaded.length === 0) return
        if (!nextCursor || nextCursor === cursor) return
        setSearch((s) => ({ ask, wanted: s.ask === ask ? s.wanted : wantedFor(view), pulled: (s.ask === ask ? s.pulled : 0) + 1 }))
        setCursor(nextCursor)
    }, [searching, isLoading, loaded.length, nextCursor, cursor, ask, view])

    const onLoadMore = () => {
        if (isLoading || !hasMore || loaded.length === 0) return
        if (filtering) askFor(visible.length + PAGE_SIZE)
        else if (nextCursor && nextCursor !== cursor) setCursor(nextCursor)
    }
    // Older activity exists that a capped view has not looked through.
    const moreToSearch = filtering && hasMore && capped
    const lookFurther = () => askFor(visible.length + PAGE_SIZE)

    const setWho = (next: ActorFilter) => {
        const params = new URLSearchParams(searchParams.toString())
        if (next === "everyone") params.delete("who")
        else params.set("who", next)
        router.replace(`${pathname}?${params.toString()}`, { scroll: false })
    }

    const whoFilter = (
        <HubSegmented
            label="Show activity from"
            value={who}
            onChange={(v) => setWho(v as ActorFilter)}
            segments={actorFilters(aiAvailable).map((f) => ({ value: f.value, label: f.label, glyph: WHO_GLYPH[f.value] }))}
        />
    )

    return (
        <ActivityFeedFrame
            filter={whoFilter}
            actions={densitySwitch}
            // The first page is on its way, or a filtered view is still looking
            // deeper for its first row: a premature "all caught up" would be a claim.
            loading={!isError && visible.length === 0 && ((isLoading && loaded.length === 0) || searching)}
            // Failure before emptiness: a failed fetch also leaves the list
            // empty, and this surface's empty copy tells the reader nothing
            // needs them, the one conclusion a failed request must not reach.
            state={
                isError && visible.length === 0 ? (
                    // The hub's failed state (A9), where its empty states sit: a
                    // sunken card with Try again, as Later, Search and the agents
                    // record say it, not a centred ring that reads as loading.
                    <HubError text="Your inbox isn't loading. Nothing has been lost." onRetry={() => void mutate()} />
                ) : visible.length === 0 && unreadOnly && inScope.length > 0 ? (
                    <HubEmpty
                        spot="check"
                        title="Nothing unread"
                        description="Everything here has been read."
                        action={
                            onShowAll ? (
                                <Button variant="ghost" size="sm" onClick={onShowAll}>
                                    Show all
                                </Button>
                            ) : undefined
                        }
                    />
                ) : visible.length === 0 ? (
                    <FeedEmpty
                        view={view}
                        who={who}
                        whoLabel={actorFilters(aiAvailable).find((f) => f.value === who)?.label.toLowerCase() ?? ""}
                        moreToSearch={moreToSearch}
                        onShowEveryone={() => setWho("everyone")}
                        onLookFurther={lookFurther}
                        onViewAll={onViewAll}
                    />
                ) : null
            }
        >
            <div ref={box} data-inbox-list="" data-density={compact ? "compact" : "comfortable"} className="h-full">
            <VirtualInfiniteScroll
                items={rows}
                renderItem={(row: FeedListRow) =>
                    row.kind === "header" ? (
                        // The header's name starts where the rows' words do: past a 32px lead, or Compact's 24.
                        <div data-feed-group="" className={cn("flex h-7 items-center pr-4 text-meta font-medium text-ink-3", compact ? "pl-12" : "pl-14")}>
                            <span className="flex-1">{row.label}</span>
                            {row.unread > 0 ? <span className="font-book tabular-nums">{row.unread} unread</span> : null}
                        </div>
                    ) : (
                        <ActivityCard
                            activity={row.entry.item}
                            entry={row.entry}
                            separated={!row.first}
                            underDay={view !== "priority"}
                            unread={read ? [row.entry.item, ...row.entry.others].some(unreadOf) : undefined}
                            onToggleRead={onToggleRead}
                            compact={compact}
                            onOpenInPanel={pane?.open}
                            open={pane ? showsTarget(pane.panel, targetOf(row.entry)) : false}
                            expanded={expanded.has(row.entry.key)}
                            onToggleExpanded={() => toggleExpanded(row.entry.key)}
                        />
                    )
                }
                onLoadMore={onLoadMore}
                isLoading={isLoading && visible.length > 0}
                // A capped filtered view stops asking on scroll and says how to
                // look further, rather than stalling at the end of a short list.
                hasMore={hasMore && !moreToSearch}
                endMessage={
                    moreToSearch ? (
                        <Button variant="ghost" size="sm" onClick={lookFurther}>
                            Look further back
                        </Button>
                    ) : undefined
                }
                keyExtractor={(row: FeedListRow) => (row.kind === "header" ? `h:${row.label}` : row.entry.key)}
            />
            </div>
        </ActivityFeedFrame>
    )
}

/** What a view says when it has nothing to show (A9), start-aligned in the column. */
function FeedEmpty({
    view,
    who,
    whoLabel,
    moreToSearch,
    onShowEveryone,
    onLookFurther,
    onViewAll,
}: {
    view: FeedView
    who: ActorFilter
    whoLabel: string
    moreToSearch: boolean
    onShowEveryone: () => void
    onLookFurther: () => void
    onViewAll?: () => void
}) {
    if (who !== "everyone") {
        return (
            <HubEmpty
                spot="search"
                title={`Nothing from ${whoLabel} lately`}
                description="Only your recent activity is searched."
                action={
                    <Button variant="secondary" size="sm" onClick={onShowEveryone}>
                        Show everyone
                    </Button>
                }
            />
        )
    }
    if (view === "priority") {
        return (
            <HubEmpty
                spot="check"
                title="You're all caught up"
                description="Mentions that ask something of you, and requests waiting on you, land here."
                action={
                    onViewAll ? (
                        <Button variant="secondary" size="sm" onClick={onViewAll}>
                            View all activity
                        </Button>
                    ) : undefined
                }
            />
        )
    }
    if (view === "mentions") {
        return (
            <HubEmpty
                spot="bell"
                title={moreToSearch ? "No recent mentions" : "No mentions yet"}
                description={moreToSearch ? "Nobody has mentioned you in your recent activity." : "When someone @mentions you, it lands here."}
                action={
                    moreToSearch ? (
                        <Button variant="secondary" size="sm" onClick={onLookFurther}>
                            Look further back
                        </Button>
                    ) : undefined
                }
            />
        )
    }
    return <HubEmpty spot="bell" title="You're all caught up" description="Mentions, replies and assignments land here." />
}
