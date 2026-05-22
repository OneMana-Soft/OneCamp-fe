"use client"

import { useEffect, useState } from "react"
import { VirtualInfiniteScroll } from "@/components/list/virtualInfiniteScroll"
import { ActivityCard } from "@/components/activity/activityCard"
import { UnifiedActivityItem, UnifiedActivityPaginationRes } from "@/types/activity"
import { GetEndpointUrl } from "@/services/endPoints"
import { useFetch } from "@/hooks/useFetch"
import { EmptyState } from "@/components/ui/empty-state"
import { ListSkeleton } from "@/components/ui/ListSkeleton"
import { PageContainer } from "@/components/ui/pageContainer"
import { Bell } from "@/lib/icons"

export const ActivityAllListResult = () => {
    const [pageIndex, setPageIndex] = useState(0)
    const [hasMore, setHasMore] = useState(true)
    const [allActivities, setAllActivities] = useState<UnifiedActivityItem[]>([])
    const pageSize = 20
    const endpoint = `${GetEndpointUrl.GetUnifiedActivity}?pageIndex=${pageIndex}&pageSize=${pageSize}`

    const { data: pageData, isLoading } = useFetch<UnifiedActivityPaginationRes>(endpoint)

    useEffect(() => {
        if (pageData?.data) {
            const activities = pageData.data.activities ?? []
            if (pageIndex === 0) {
                setAllActivities(activities)
            } else {
                setAllActivities((prev) => [...prev, ...activities])
            }
            setHasMore(pageData.data.has_more ?? false)
        }
    }, [pageData, pageIndex])

    const renderItem = (activity: UnifiedActivityItem) => (
        <ActivityCard activity={activity} onClick={() => {}} />
    )

    const onLoadMore = () => {
        if (!isLoading && hasMore) {
            setPageIndex((prev) => prev + 1)
        }
    }

    if (isLoading && allActivities.length === 0) {
        return (
            <PageContainer>
                <ListSkeleton rows={8} />
            </PageContainer>
        )
    }

    if (!isLoading && allActivities.length === 0) {
        return (
            <PageContainer className="flex items-center justify-center">
                <EmptyState
                    icon={Bell}
                    title="No activity yet"
                    description="Mentions, comments, and reactions will appear here."
                />
            </PageContainer>
        )
    }

    return (
        <PageContainer className="overflow-y-auto py-2">
            <VirtualInfiniteScroll
                items={allActivities}
                renderItem={renderItem}
                onLoadMore={onLoadMore}
                hasMore={hasMore}
                keyExtractor={(item, i) => `${item.activity_type}-${item.time}-${i}`}
            />
        </PageContainer>
    )
}
