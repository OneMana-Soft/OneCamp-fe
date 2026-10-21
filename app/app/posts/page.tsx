"use client"

import { useState, useEffect, useCallback } from "react";
import { VirtualInfiniteScroll } from "@/components/list/virtualInfiniteScroll";
import { PostCard } from "@/components/posts/PostCard";
import { PostsRes, CreatePostPaginationResRaw } from "@/types/post";
import { useFetch } from "@/hooks/useFetch";
import { ChatGet } from "@/services/endpoints/chat";
import { HubEmpty, HubError } from "@/components/activity/hubEmpty";
import { PageHeader } from "@/components/ui/pageHeader";
import { PageContainer } from "@/components/ui/pageContainer";
import { SkeletonRows } from "@/components/ui/skeletonRows";
import { ConditionalWrap } from "@/components/conditionalWrap/conditionalWrap";
import { useMedia } from "@/context/MediaQueryContext";
import TouchableDiv from "@/components/animation/touchRippleAnimation";
import { useRouter } from "next/navigation";
import { Separator } from "@/components/ui/separator";

/**
 * Your posts: what you've posted in channels, newest first. The shape of the
 * other list pages (Recordings): a header across the sheet, the rows in the
 * start-aligned 880px column, and the hub's empty and failed states where the
 * rows begin (QA F-28). It had a header of its own, "Your Posts" in title case
 * on a computer and "Your posts" on a phone, a centred 760px list, and states
 * in the middle of the screen.
 */
const PostsPage = () => {
    const [pageIndex, setPageIndex] = useState(0);
    const [allPosts, setAllPosts] = useState<PostsRes[]>([]);
    const [hasMore, setHasMore] = useState(true);
    const pageSize = 20;
    const router = useRouter();
    const { isMobile, isDesktop } = useMedia();

    const endpoint = `${ChatGet.GetUserPosts}?pageIndex=${pageIndex}&pageSize=${pageSize}`;
    const { data: pageData, isLoading, isError, mutate } = useFetch<CreatePostPaginationResRaw>(endpoint);

    useEffect(() => {
        if (pageData?.data) {
            // Defensive default — Go encodes empty slices as null and
            // an undefined here causes crashes downstream when we try
            // to spread / dedupe.
            const incomingPosts = pageData.data.posts ?? []
            setAllPosts((prev) => {
                const combined = pageIndex === 0 ? incomingPosts : [...prev, ...incomingPosts];
                const unique = Array.from(new Map(combined.map(item => [item.post_uuid, item])).values());
                return unique;
            });
            setHasMore(pageData.data.has_more ?? false);
        }
    }, [pageData, pageIndex]);

    const onLoadMore = useCallback(() => {
        if (!isLoading && hasMore) {
            setPageIndex((prev) => prev + 1);
        }
    }, [isLoading, hasMore]);

    const handleClick = (post: PostsRes) => {
        if (post.post_channel?.ch_uuid) {
            router.push(`/app/channel/${post.post_channel.ch_uuid}/${post.post_uuid}`);
        }
    };

    const renderItem = (post: PostsRes, i: number) => (
        <ConditionalWrap key={post.post_uuid} condition={isMobile} wrap={
            (c) => (
                <TouchableDiv rippleBrightness={0.8} rippleDuration={800} onClick={() => handleClick(post)}>
                    {c}
                </TouchableDiv>
            )
        }>
            {i != 0 && <Separator orientation="horizontal" className="mx-6 w-[calc(100%-3rem)]" />}
            <PostCard post={post} onClick={isMobile ? undefined : () => handleClick(post)} />
        </ConditionalWrap>
    );

    return (
        <div data-posts-view="" className="flex h-full min-h-0 flex-col bg-background">
            {/* On a phone the top bar names the page, as on Recordings. */}
            {isDesktop ? (
                <PageContainer bounded={false} className="h-auto shrink-0 px-4 pb-3 pt-4 md:px-6 md:pb-4 md:pt-6">
                    <PageHeader title="Your posts" />
                </PageContainer>
            ) : null}

            <PageContainer className="flex min-h-0 flex-1 flex-col">
                {allPosts.length > 0 ? (
                    <VirtualInfiniteScroll
                        items={allPosts}
                        renderItem={renderItem}
                        onLoadMore={onLoadMore}
                        hasMore={hasMore}
                        isLoading={isLoading}
                        className="no-scrollbar min-h-0 flex-1"
                        keyExtractor={(item: PostsRes) => item.post_uuid}
                    />
                ) : isLoading && !isError ? (
                    /* role + aria-label is the whole announcement; the skeleton
                       itself stays aria-hidden, so the text is not read twice. */
                    <div role="status" aria-label="Loading your posts">
                        <SkeletonRows rows={5} />
                    </div>
                ) : (
                    <div data-posts-state="" className="flex justify-start pt-4 md:pt-12">
                        {isError ? (
                            // Ahead of the empty answer: a failed fetch leaves the
                            // list empty too, and "You haven't posted yet" is a
                            // distressing thing to tell someone whose posts exist.
                            <HubError text="Your posts aren't loading. Nothing has been lost." onRetry={() => void mutate()} />
                        ) : (
                            <HubEmpty spot="message" title="You haven't posted yet" description="Posts you write in channels gather here, newest first." />
                        )}
                    </div>
                )}
            </PageContainer>
        </div>
    );
};

export default PostsPage;
