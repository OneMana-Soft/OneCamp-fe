"use client"

import React, { useEffect, useLayoutEffect, useMemo, useRef } from "react"
import {VList, VListHandle} from "virtua"
import { cn } from "@/lib/utils/helpers/cn"
import {debounceUtil} from "@/lib/utils/helpers/debounce";

interface VirtualInfiniteScrollProps<T> {
    /**
     * Array of items to render
     */
    items: T[]

    /**
     * Render function for each item
     */
    renderItem: (item: T, index: number) => React.ReactNode

    /**
     * Callback when user scrolls near the bottom
     */
    onLoadMore: () => void

    /**
     * Whether more items are currently being loaded
     */
    isLoading?: boolean

    /**
     * Whether there are more items to load. A list the server pages by index
     * says it with lib/http/pageCount's hasPageAfter(pageIndex, pageCount).
     */
    hasMore?: boolean

    /**
     * Distance from bottom (in pixels) to trigger load more
     * @default 200
     */
    threshold?: number

    /**
     * Number of items to render outside visible area (buffer)
     * @default 4
     */
    overscan?: number

    /**
     * Height of the scroll container
     * @default '600px'
     */
    height?: string | number

    /**
     * Custom loading component
     */
    loadingComponent?: React.ReactNode

    /**
     * Custom end message component
     */
    endMessage?: React.ReactNode

    /**
     * Custom empty state component
     */
    emptyComponent?: React.ReactNode

    /**
     * Additional className for the container
     */
    className?: string

    /**
     * Unique key extractor for items
     */
    keyExtractor?: (item: T, index: number) => string | number

    /**
     * Shift mode for smoother scrolling
     * @default true
     */
    shift?: boolean
}

export function VirtualInfiniteScroll<T>({
                                             items,
                                             renderItem,
                                            onLoadMore,
                                             isLoading = false,
                                             hasMore = true,
                                             loadingComponent,
                                             endMessage,
                                             emptyComponent,
                                             className,
                                             keyExtractor = (_, index) => index,
                                         }: VirtualInfiniteScrollProps<T>) {



    const listRef = useRef<VListHandle>(null)

    // What the list was last given. The scroll handler reads it as it runs: a
    // handler made for each render ran 100 ms later with that render's props.
    const latest = useRef({ hasMore, isLoading, onLoadMore, count: items.length })
    useLayoutEffect(() => {
        latest.current = { hasMore, isLoading, onLoadMore, count: items.length }
    })

    // One ask for more at a time: the next waits until that load has come in
    // (the items grew) or ended (isLoading went true and back). A caller's
    // page number moves a render before its request does, and for that render
    // it isn't loading: a scroll then asked for the page after next, and the
    // page between never reached the list (a phone's project list lost tasks
    // 21 to 25 of 25 on a slow phone).
    const asked = useRef<{ count: number; started: boolean } | null>(null)
    useEffect(() => {
        const a = asked.current
        if (!a) return
        if (isLoading) a.started = true
        else if (a.started || items.length > a.count) asked.current = null
    }, [isLoading, items.length])

    const debouncedHandleScroll = useMemo(
        () =>
            debounceUtil((offset: number) => {
                const list = listRef.current
                const { hasMore, isLoading, onLoadMore, count } = latest.current
                if (!list || !hasMore || isLoading || asked.current) return
                if (offset - list.scrollSize + list.viewportSize >= -300) {
                    asked.current = { count, started: false }
                    onLoadMore()
                }
            }, 100),
        [],
    )

    // Empty state
    if (items.length === 0 && !isLoading && emptyComponent) {
        return (emptyComponent)
    }

    return (
        <div className={cn("relative h-full", className)} >
            <VList
                ref={listRef}

                className="w-full pb-40 scrollbar-thin no-scrollbar h-full"
                onScroll={debouncedHandleScroll}
            >
                {items.map((item, index) => (
                    <div key={keyExtractor(item, index)} className="w-full">
                        {renderItem(item, index)}
                    </div>
                ))}

                {/* Loading indicator */}
                {isLoading && (
                    <div className="flex items-center justify-center py-4">
                        {loadingComponent || (
                            <div className="flex items-center gap-2 text-muted-foreground">
                                <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                                <span>Loading more…</span>
                            </div>
                        )}
                    </div>
                )}

                {/* End message */}
                {!hasMore && endMessage && items.length > 0 && (
                    <div className="flex items-center justify-center py-4">
                        {endMessage}
                    </div>
                )}
            </VList>
        </div>
    )
}
