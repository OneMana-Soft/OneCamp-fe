"use client"

import { useEffect, useState } from "react"
import { VirtualInfiniteScroll } from "@/components/list/virtualInfiniteScroll"
import { ActivityCard } from "@/components/activity/activityCard"
import { MentionActivityPagination, UnifiedActivityItem } from "@/types/activity"
import { MentionInfoInterface } from "@/types/mention"
import { GetEndpointUrl } from "@/services/endPoints"
import { useFetch } from "@/hooks/useFetch"
import { EmptyState } from "@/components/ui/empty-state"
import { ListSkeleton } from "@/components/ui/ListSkeleton"
import { PageContainer } from "@/components/ui/pageContainer"
import { AtSign } from "@/lib/icons"

export const ActivityMentionListResult = () => {
    const [pageIndex, setPageIndex] = useState(0)
    const [hasMore, setHasMore] = useState(true)
    const [allMentions, setAllMentions] = useState<MentionInfoInterface[]>([])
    const pageSize = 20
    const endpoint = `${GetEndpointUrl.GetMentionActivity}?pageIndex=${pageIndex}&pageSize=${pageSize}`

    const { data: pageData, isLoading } = useFetch<MentionActivityPagination>(endpoint)

    useEffect(() => {
        if (pageData) {
            const mentions = pageData.mentions ?? []
            if (pageIndex === 0) {
                setAllMentions(mentions)
            } else {
                setAllMentions((prev) => [...prev, ...mentions])
            }
            setHasMore(pageData.has_more ?? false)
        }
    }, [pageData, pageIndex])

    const renderItem = (activity: MentionInfoInterface) => {
        const item: UnifiedActivityItem = {
            activity_type: "MENTION",
            time: activity.mention_created_at,
            mention: activity,
        }
        return <ActivityCard activity={item} onClick={() => {}} />
    }

    const onLoadMore = () => {
        if (!isLoading && hasMore) {
            setPageIndex((prev) => prev + 1)
        }
    }

    if (isLoading && allMentions.length === 0) {
        return (
            <PageContainer>
                <ListSkeleton rows={8} />
            </PageContainer>
        )
    }

    if (!isLoading && allMentions.length === 0) {
        return (
            <PageContainer className="flex items-center justify-center">
                <EmptyState
                    icon={AtSign}
                    title="No mentions yet"
                    description="When someone @mentions you, it'll show up here."
                />
            </PageContainer>
        )
    }

    return (
        <PageContainer className="overflow-y-auto py-2">
            <VirtualInfiniteScroll
                items={allMentions}
                renderItem={renderItem}
                onLoadMore={onLoadMore}
                hasMore={hasMore}
                keyExtractor={(item) => item.uid}
            />
        </PageContainer>
    )
}
