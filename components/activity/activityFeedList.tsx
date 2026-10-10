"use client"

import { useEffect, useMemo, useState } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { VirtualInfiniteScroll } from "@/components/list/virtualInfiniteScroll"
import { ActivityCard } from "@/components/activity/activityCard"
import { ActivityFeedFrame } from "@/components/activity/activityFeedFrame"
import { UnifiedActivityItem, UnifiedActivityPaginationRes } from "@/types/activity"
import { GetEndpointUrl } from "@/services/endPoints"
import { useFetch } from "@/hooks/useFetch"
import { EmptyState } from "@/components/ui/empty-state"
import { ErrorState } from "@/components/ui/error-state"
import { Button } from "@/components/ui/button"
import { AtSign, Bell, CheckCircle2, Users } from "@/lib/icons"
import { SpotSearch, SpotTasks, SpotWelcome } from "@/components/ui/graphics"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { actorFilters, matchesActor, parseActorFilter, type ActorFilter } from "@/lib/activity/actor"
import { activityKey, hasSubject, mergeActivityPages, olderPageCursor } from "@/lib/activity/feedPages"

/** The Activity tabs that are views of one feed. */
export type FeedView = "priority" | "all" | "mentions"

const PAGE_SIZE = 20
/** Pages a filtered view pulls on its own, per ask, before it stops and offers more. */
const MAX_AUTO_PAGES = 5

const inView: Record<FeedView, (a: UnifiedActivityItem) => boolean> = {
    // The server scores each item (mentions that ask something, actionable
    // comments) and demotes what you have already seen.
    priority: (a) => a.priority === "high",
    all: () => true,
    mentions: (a) => a.activity_type === "MENTION",
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
 */
export function ActivityFeedList({ view, onViewAll }: { view: FeedView; onViewAll?: () => void }) {
    const searchParams = useSearchParams()
    const router = useRouter()
    const pathname = usePathname()
    // This edition has no AI, so the filters never offer agents.
    const aiAvailable = false
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

    const endpoint = `${GetEndpointUrl.GetUnifiedActivity}?limit=${PAGE_SIZE}${cursor ? `&beforeTime=${encodeURIComponent(cursor)}` : ""}`
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
    const visible = useMemo(() => loaded.filter((a) => hasSubject(a) && inView[view](a) && matchesActor(a, who)), [loaded, view, who])

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
        <ToggleGroup
            type="single"
            value={who}
            onValueChange={(v) => v && setWho(v as ActorFilter)}
            aria-label="Show activity from"
            className="justify-start"
        >
            {actorFilters(aiAvailable).map((f) => (
                <ToggleGroupItem key={f.value} value={f.value} size="sm" className="extend-touch-target h-7 rounded-md px-2.5 text-xs">
                    {f.label}
                </ToggleGroupItem>
            ))}
        </ToggleGroup>
    )

    return (
        <ActivityFeedFrame
            filter={whoFilter}
            // The first page is on its way, or a filtered view is still looking
            // deeper for its first row: a premature "all caught up" would be a claim.
            loading={!isError && visible.length === 0 && ((isLoading && loaded.length === 0) || searching)}
            // Failure before emptiness: a failed fetch also leaves the list
            // empty, and this surface's empty copy tells the reader nothing
            // needs them, the one conclusion a failed request must not reach.
            state={
                isError && visible.length === 0 ? (
                    <ErrorState subject={view === "mentions" ? "your mentions" : "your activity"} onRetry={() => void mutate()} />
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
            <VirtualInfiniteScroll
                items={visible}
                renderItem={(activity: UnifiedActivityItem) => <ActivityCard activity={activity} />}
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
                keyExtractor={(item) => activityKey(item)}
            />
        </ActivityFeedFrame>
    )
}

/** What a view says when it has nothing to show. Each one carries its spot. */
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
            <EmptyState
                icon={Users}
                illustration={<SpotSearch />}
                title={`Nothing from ${whoLabel} lately`}
                description="Only your recent activity is searched."
                action={
                    <Button variant="outline" size="sm" onClick={onShowEveryone}>
                        Show everyone
                    </Button>
                }
            />
        )
    }
    if (view === "priority") {
        return (
            <EmptyState
                icon={CheckCircle2}
                illustration={<SpotTasks />}
                title="You're all caught up"
                description="Mentions that ask a question or request action show up here. Nothing needs you right now."
                action={
                    onViewAll ? (
                        <Button variant="outline" size="sm" onClick={onViewAll}>
                            View all activity
                        </Button>
                    ) : undefined
                }
            />
        )
    }
    if (view === "mentions") {
        return (
            <EmptyState
                icon={AtSign}
                illustration={<SpotWelcome hue="dusk" />}
                title={moreToSearch ? "No recent mentions" : "No mentions yet"}
                description={moreToSearch ? "Nobody has mentioned you in your recent activity." : "When someone @mentions you, it'll show up here."}
                action={
                    moreToSearch ? (
                        <Button variant="outline" size="sm" onClick={onLookFurther}>
                            Look further back
                        </Button>
                    ) : undefined
                }
            />
        )
    }
    return <EmptyState icon={Bell} illustration={<SpotWelcome />} title="No activity yet" description="Mentions, comments, and reactions will appear here." />
}
