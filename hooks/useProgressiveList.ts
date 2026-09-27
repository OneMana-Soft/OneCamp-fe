"use client"

import type React from "react"

import { useEffect, useRef, useState, useCallback } from "react"

export interface UseProgressiveListOptions {
    /**
     * Initial number of items to render
     * @default 50
     */
    initialCount?: number
    /**
     * Number of items to load per batch
     * @default 50
     */
    batchSize?: number
    /**
     * Root margin for intersection observer (triggers loading before reaching the end)
     * @default "200px"
     */
    rootMargin?: string
    /**
     * Enable/disable progressive loading
     * @default true
     */
    enabled?: boolean
}

interface UseProgressiveListReturn<T> {
    /** Currently visible items */
    visibleItems: T[]
    /** Whether there are more items to load */
    hasMore: boolean
    /** Total number of items */
    totalCount: number
    /** Number of currently visible items */
    visibleCount: number
    /** Ref to attach to the load more trigger element */
    loadMoreRef: React.RefObject<HTMLDivElement | null>
    /** Manually load more items */
    loadMore: () => void
    /** Reset to initial state */
    reset: () => void
}

/**
 * A production-ready hook for progressive/lazy loading of large lists.
 * Renders items in batches as the user scrolls, improving initial render performance.
 *
 * @example
 * \`\`\`tsx
 * const { visibleItems, hasMore, loadMoreRef } = useProgressiveList(activities, {
 *   initialCount: 30,
 *   batchSize: 30,
 * })
 *
 * return (
 *   <div>
 *     {visibleItems.map(item => <Item key={item.id} data={item} />)}
 *     {hasMore && <div ref={loadMoreRef}>Loading...</div>}
 *   </div>
 * )
 * \`\`\`
 */
export function useProgressiveList<T>(
    items: T[] | undefined,
    options: UseProgressiveListOptions = {},
): UseProgressiveListReturn<T> {
    const { initialCount = 50, batchSize = 50, rootMargin = "200px", enabled = true } = options

    const [visibleCount, setVisibleCount] = useState(initialCount)
    const loadMoreRef = useRef<HTMLDivElement | null>(null)
    const observerRef = useRef<IntersectionObserver | null>(null)

    const totalCount = items?.length ?? 0
    const hasMore = enabled && visibleCount < totalCount

    const loadMore = useCallback(() => {
        if (!enabled || !items) return
        setVisibleCount((prev) => Math.min(prev + batchSize, items.length))
    }, [enabled, items, batchSize])

    const reset = useCallback(() => {
        setVisibleCount(initialCount)
    }, [initialCount])

    // Set up intersection observer for automatic loading
    useEffect(() => {
        if (!enabled || !items || items.length <= visibleCount) {
            return
        }

        // Clean up existing observer
        if (observerRef.current) {
            observerRef.current.disconnect()
        }

        // Create new observer
        observerRef.current = new IntersectionObserver(
            (entries) => {
                if (entries[0]?.isIntersecting) {
                    loadMore()
                }
            },
            { rootMargin },
        )

        // Observe the load more trigger
        if (loadMoreRef.current) {
            observerRef.current.observe(loadMoreRef.current)
        }

        return () => {
            if (observerRef.current) {
                observerRef.current.disconnect()
            }
        }
    }, [enabled, items, visibleCount, loadMore, rootMargin])

    // Reset when items change
    useEffect(() => {
        reset()
    }, [items, reset])

    const visibleItems = items?.slice(0, visibleCount) ?? []

    return {
        visibleItems,
        hasMore,
        totalCount,
        visibleCount,
        loadMoreRef,
        loadMore,
        reset,
    }
}
