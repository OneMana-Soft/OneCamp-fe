"use client"

import { useEffect, useState } from "react"
import { VirtualInfiniteScroll } from "@/components/list/virtualInfiniteScroll"
import { ActivityCard } from "@/components/activity/activityCard"
import { ReactionActivityPaginationRes, UnifiedActivityItem } from "@/types/activity"
import { ReactionActivity } from "@/types/reaction"
import { GetEndpointUrl } from "@/services/endPoints"
import { useFetch } from "@/hooks/useFetch"
import { EmptyState } from "@/components/ui/empty-state"
import { ErrorState } from "@/components/ui/error-state"
import { ListSkeleton } from "@/components/ui/ListSkeleton"
import { PageContainer } from "@/components/ui/pageContainer"
import { Heart } from "@/lib/icons"

export const ActivityReactionListResult = () => {
    const [pageIndex, setPageIndex] = useState(0)
    const [hasMore, setHasMore] = useState(true)
    const [allReactions, setAllReactions] = useState<ReactionActivity[]>([])
    const pageSize = 20
    const endpoint = `${GetEndpointUrl.GetReactionsActivity}?pageIndex=${pageIndex}&pageSize=${pageSize}`

    const { data: pageData, isLoading, isError, mutate } = useFetch<ReactionActivityPaginationRes>(endpoint)

    useEffect(() => {
        if (pageData?.data) {
            const reactions = pageData.data.reactions ?? []
            if (pageIndex === 0) {
                setAllReactions(reactions)
            } else {
                setAllReactions((prev) => [...prev, ...reactions])
            }
            setHasMore(pageData.data.has_more ?? false)
        }
    }, [pageData, pageIndex])

    const renderItem = (activity: ReactionActivity) => {
        const item: UnifiedActivityItem = {
            activity_type: "REACTION",
            time: activity.reaction_added_at,
            reaction: activity,
        }
        return <ActivityCard activity={item} onClick={() => {}} />
    }

    const onLoadMore = () => {
        if (!isLoading && hasMore) {
            setPageIndex((prev) => prev + 1)
        }
    }

    if (isLoading && allReactions.length === 0) {
        return (
            <PageContainer>
                <ListSkeleton rows={8} />
            </PageContainer>
        )
    }

    // Before the empty guard. A failed fetch also leaves the list empty, and
    // this surface's empty copy tells the user nothing needs them — the one
    // conclusion they must not reach from a request that simply failed.
    if (isError) {
        return (
            <PageContainer className="flex items-center justify-center">
                <ErrorState subject="your reactions" onRetry={() => void mutate()} />
            </PageContainer>
        )
    }
    if (!isLoading && allReactions.length === 0) {
        return (
            <PageContainer className="flex items-center justify-center">
                <EmptyState
                    icon={Heart}
                    title="No reactions yet"
                    description="Reactions on your messages and posts will appear here."
                />
            </PageContainer>
        )
    }

    return (
        <PageContainer className="overflow-y-auto py-2">
            <VirtualInfiniteScroll
                items={allReactions}
                renderItem={renderItem}
                onLoadMore={onLoadMore}
                hasMore={hasMore}
                keyExtractor={(item) => item.uid}
            />
        </PageContainer>
    )
}
