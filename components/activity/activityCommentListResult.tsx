"use client"

import { useEffect, useState } from "react"
import { VirtualInfiniteScroll } from "@/components/list/virtualInfiniteScroll"
import { ActivityCard } from "@/components/activity/activityCard"
import { CommentActivityPaginationRes, UnifiedActivityItem } from "@/types/activity"
import { CommentInfoInterface } from "@/types/comment"
import { GetEndpointUrl } from "@/services/endPoints"
import { useFetch } from "@/hooks/useFetch"
import { EmptyState } from "@/components/ui/empty-state"
import { ListSkeleton } from "@/components/ui/ListSkeleton"
import { PageContainer } from "@/components/ui/pageContainer"
import { MessageSquare } from "@/lib/icons"

export const ActivityCommentListResult = () => {
    const [pageIndex, setPageIndex] = useState(0)
    const [hasMore, setHasMore] = useState(true)
    const [allComments, setAllComments] = useState<CommentInfoInterface[]>([])
    const pageSize = 20
    const endpoint = `${GetEndpointUrl.GetCommentActivity}?pageIndex=${pageIndex}&pageSize=${pageSize}`

    const { data: pageData, isLoading } = useFetch<CommentActivityPaginationRes>(endpoint)

    useEffect(() => {
        if (pageData?.data) {
            // Backend may return null for empty arrays (Go encodes nil
            // slices as null). Default to [] so prev/spread + .length
            // never blow up.
            const comments = pageData.data.comments ?? []
            if (pageIndex === 0) {
                setAllComments(comments)
            } else {
                setAllComments((prev) => [...prev, ...comments])
            }
            setHasMore(pageData.data.has_more ?? false)
        }
    }, [pageData, pageIndex])

    const renderItem = (activity: CommentInfoInterface) => {
        const item: UnifiedActivityItem = {
            activity_type: "COMMENT",
            time: activity.comment_created_at,
            comment: activity,
        }
        return <ActivityCard activity={item} onClick={() => {}} />
    }

    const onLoadMore = () => {
        if (!isLoading && hasMore) {
            setPageIndex((prev) => prev + 1)
        }
    }

    if (isLoading && allComments.length === 0) {
        return (
            <PageContainer>
                <ListSkeleton rows={8} />
            </PageContainer>
        )
    }

    if (!isLoading && allComments.length === 0) {
        return (
            <PageContainer className="flex items-center justify-center">
                <EmptyState
                    icon={MessageSquare}
                    title="No comments yet"
                    description="Comments on your posts and docs will show up here."
                />
            </PageContainer>
        )
    }

    return (
        <PageContainer className="overflow-y-auto py-2">
            <VirtualInfiniteScroll
                items={allComments}
                renderItem={renderItem}
                onLoadMore={onLoadMore}
                hasMore={hasMore}
                keyExtractor={(item) => item.comment_uuid}
            />
        </PageContainer>
    )
}
