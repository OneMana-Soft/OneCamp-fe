"use client"

import React, {useCallback, useMemo, useRef} from "react"
import {VList, VListHandle} from "virtua"
import { cn } from "@/lib/utils/helpers/cn"
import {debounceUtil} from "@/lib/utils/helpers/debounce";

export interface VirtualInfiniteScrollProps<T> {
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
     * Whether there are more items to load
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

    const handleScroll = useCallback((offset: number) => {
        const list = listRef.current
        if (!list || !hasMore || isLoading) return

        if (offset - list.scrollSize + list.viewportSize >= -300) {
            onLoadMore()
        }
    }, [hasMore, isLoading, onLoadMore])

    const debouncedHandleScroll = useMemo(
        () => debounceUtil(handleScroll, 100),
        [handleScroll],
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
                                <span>Loading more...</span>
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
