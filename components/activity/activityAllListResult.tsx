"use client"

import { useEffect, useMemo, useState } from "react"
import { VirtualInfiniteScroll } from "@/components/list/virtualInfiniteScroll"
import { ActivityCard } from "@/components/activity/activityCard"
import { UnifiedActivityItem, UnifiedActivityPaginationRes } from "@/types/activity"
import { GetEndpointUrl } from "@/services/endPoints"
import { useFetch } from "@/hooks/useFetch"
import { EmptyState } from "@/components/ui/empty-state"
import { ErrorState } from "@/components/ui/error-state"
import { ListSkeleton } from "@/components/ui/ListSkeleton"
import { PageContainer } from "@/components/ui/pageContainer"
import { Button } from "@/components/ui/button"
import { Bell, CheckCircle2 } from "@/lib/icons"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { actorFilters, matchesActor, parseActorFilter, type ActorFilter } from "@/lib/activity/actor"

export const ActivityAllListResult = ({
    priorityOnly = false,
    onViewAll,
}: {
    priorityOnly?: boolean
    /** Shown as a CTA in the empty Priority view to jump to the full feed. */
    onViewAll?: () => void
}) => {
    const pageSize = 20
    // Cursor pagination: the unified endpoint pages by `beforeTime` (it
    // returns items strictly older than the cursor), NOT pageIndex. We track
    // the cursor (the oldest loaded item's time) and the accumulated list.
    const [cursor, setCursor] = useState<string>("")
    const [hasMore, setHasMore] = useState(true)
    const [allActivities, setAllActivities] = useState<UnifiedActivityItem[]>([])
    // Bounds how many pages the Priority view will auto-pull while searching
    // for the first high-priority item, so a user with none doesn't page the
    // whole feed. Beyond this we show the calm "all caught up" state.
    const [autoPages, setAutoPages] = useState(0)
    const maxPriorityAutoPages = 5

    // People, agents or apps: kept in the URL so a reload or a shared link
    // shows the same slice of the feed.
    const searchParams = useSearchParams()
    const router = useRouter()
    const pathname = usePathname()
    // This edition has no AI, so there are no agents to filter by.
    const aiAvailable = false
    const who: ActorFilter = parseActorFilter(searchParams.get("who"))
    const setWho = (next: ActorFilter) => {
        const params = new URLSearchParams(searchParams.toString())
        if (next === "everyone") params.delete("who")
        else params.set("who", next)
        setAutoPages(0)
        router.replace(`${pathname}?${params.toString()}`, { scroll: false })
    }
    const filtering = priorityOnly || who !== "everyone"

    const endpoint = `${GetEndpointUrl.GetUnifiedActivity}?limit=${pageSize}${
        cursor ? `&beforeTime=${encodeURIComponent(cursor)}` : ""
    }`

    const { data: pageData, isLoading, isError, mutate } = useFetch<UnifiedActivityPaginationRes>(endpoint)

    useEffect(() => {
        if (!pageData?.data) return
        const incoming = pageData.data.activities ?? []
        setAllActivities((prev) => {
            // First page (no cursor) replaces; subsequent pages append.
            // Dedupe by a stable key so a re-fetch or boundary overlap can't
            // introduce duplicate rows.
            const base = cursor === "" ? [] : prev
            const seen = new Set(base.map((a) => `${a.activity_type}-${a.time}`))
            const merged = [...base]
            for (const item of incoming) {
                const key = `${item.activity_type}-${item.time}`
                if (!seen.has(key)) {
                    seen.add(key)
                    merged.push(item)
                }
            }
            return merged
        })
        setHasMore(pageData.data.has_more ?? false)
    }, [pageData, cursor])

    // Priority view filters client-side to high-priority items (mentions
    // that ask/request something, actionable comments). The server scores
    // each item, so this is an instant, spinner-free filter over what we've
    // already loaded — no separate request.
    const visibleActivities = useMemo(
        () => allActivities.filter((a) => (!priorityOnly || a.priority === "high") && matchesActor(a, who)),
        [allActivities, priorityOnly, who],
    )

    const renderItem = (activity: UnifiedActivityItem) => (
        <ActivityCard activity={activity} />
    )

    // Advance the cursor to the oldest loaded item's time to fetch the next
    // page. Guarded so we never re-issue while a fetch is in flight.
    const onLoadMore = () => {
        if (isLoading || !hasMore || allActivities.length === 0) return
        const oldest = allActivities[allActivities.length - 1]
        if (oldest?.time && oldest.time !== cursor) {
            setCursor(oldest.time)
        }
    }

    // Priority view: the high-priority items can sit deeper than the first
    // page, so keep pulling pages while NONE are visible yet and more exist.
    // Bounded by hasMore (end of feed), the in-flight guard, AND a small page
    // cap so a user with no high-priority items doesn't page the whole feed.
    useEffect(() => {
        if (
            filtering &&
            !isLoading &&
            hasMore &&
            visibleActivities.length === 0 &&
            allActivities.length > 0 &&
            autoPages < maxPriorityAutoPages
        ) {
            setAutoPages((n) => n + 1)
            onLoadMore()
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [filtering, isLoading, hasMore, visibleActivities.length, allActivities.length, autoPages])

    if (isLoading && allActivities.length === 0) {
        return (
            <PageContainer>
                <ListSkeleton rows={8} />
            </PageContainer>
        )
    }

    // While the Priority view is still auto-pulling deeper pages looking for
    // the first high-priority item (within the page cap), show the skeleton
    // rather than a premature "all caught up".
    if (filtering && visibleActivities.length === 0 && hasMore && autoPages < maxPriorityAutoPages) {
        return (
            <PageContainer>
                <ListSkeleton rows={6} />
            </PageContainer>
        )
    }

    // Before the empty guard. A failed fetch also leaves the list empty, and
    // this surface's empty copy tells the user nothing needs them — the one
    // conclusion they must not reach from a request that simply failed.
    if (isError) {
        return (
            <PageContainer align="center" className="flex items-center justify-center">
                <ErrorState subject="your activity" onRetry={() => void mutate()} />
            </PageContainer>
        )
    }
    const whoFilter = (
        <ToggleGroup
            type="single"
            value={who}
            onValueChange={(v) => v && setWho(v as ActorFilter)}
            aria-label="Show activity from"
            className="justify-start px-1 pb-2"
        >
            {actorFilters(aiAvailable).map((f) => (
                <ToggleGroupItem key={f.value} value={f.value} size="sm" className="h-7 rounded-md px-2.5 text-xs">
                    {f.label}
                </ToggleGroupItem>
            ))}
        </ToggleGroup>
    )

    if (!isLoading && visibleActivities.length === 0 && who !== "everyone") {
        return (
            <PageContainer className="flex flex-col py-2">
                {whoFilter}
                <div className="flex flex-1 items-center justify-center">
                    <EmptyState
                        icon={Bell}
                        title={`Nothing from ${actorFilters(aiAvailable).find((f) => f.value === who)?.label.toLowerCase()} lately`}
                        description="Only your recent activity is searched."
                        action={<Button variant="outline" size="sm" onClick={() => setWho("everyone")}>Show everyone</Button>}
                    />
                </div>
            </PageContainer>
        )
    }

    if (!isLoading && visibleActivities.length === 0) {
        return (
            <PageContainer align="center" className="flex items-center justify-center">
                <EmptyState
                    icon={priorityOnly ? CheckCircle2 : Bell}
                    title={priorityOnly ? "You're all caught up" : "No activity yet"}
                    description={
                        priorityOnly
                            ? "Mentions that ask a question or request action show up here. Nothing needs you right now."
                            : "Mentions, comments, and reactions will appear here."
                    }
                    action={
                        priorityOnly && onViewAll ? (
                            <Button variant="outline" size="sm" onClick={onViewAll}>
                                View all activity
                            </Button>
                        ) : undefined
                    }
                />
            </PageContainer>
        )
    }

    return (
        <PageContainer className="overflow-y-auto py-2">
            {whoFilter}
            <VirtualInfiniteScroll
                items={visibleActivities}
                renderItem={renderItem}
                onLoadMore={onLoadMore}
                hasMore={hasMore}
                keyExtractor={(item, i) => `${item.activity_type}-${item.time}-${i}`}
            />
        </PageContainer>
    )
}
