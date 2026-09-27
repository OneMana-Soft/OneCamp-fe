"use client"

import { memo, type ReactNode } from "react"
import {LoadingStateCircle} from "@/components/loading/loadingStateCircle";
import {useProgressiveList, UseProgressiveListOptions} from "@/hooks/useProgressiveList";

export interface ProgressiveListProps<T> extends UseProgressiveListOptions {
    /** Array of items to render */
    items: T[] | undefined
    /** Render function for each item */
    renderItem: (item: T, index: number) => ReactNode
    /** Function to extract unique key from item */
    getItemKey: (item: T, index: number) => string | number
    /** Custom loading indicator */
    loadingIndicator?: ReactNode
    /** Custom empty state */
    emptyState?: ReactNode
    /** Additional className for the container */
    className?: string
    /** Additional className for each item wrapper */
    itemClassName?: string
}

/**
 * A production-ready component for rendering large lists progressively.
 * Automatically loads more items as the user scrolls.
 *
 * @example
 * ```tsx
 * <ProgressiveList
 *   items={activities}
 *   renderItem={(activity) => <ActivityItem activity={activity} />}
 *   getItemKey={(activity) => activity.id}
 *   initialCount={30}
 *   batchSize={30}
 * />
 * ```
 */
function ProgressiveListInner<T>({
                                     items,
                                     renderItem,
                                     getItemKey,
                                     loadingIndicator,
                                     emptyState,
                                     className,
                                     itemClassName,
                                     ...options
                                 }: ProgressiveListProps<T>) {
    const { visibleItems, hasMore, loadMoreRef } = useProgressiveList(items, options)

    // Empty state
    if (!items || items.length === 0) {
        return <>{emptyState ?? null}</>
    }

    return (
        <div className={className}>
            {visibleItems.map((item: T, index: number) => (
                <div key={getItemKey(item, index)} className={itemClassName}>
                    {renderItem(item, index)}
                </div>
            ))}

            {hasMore && (
                <div ref={loadMoreRef} className="flex items-center justify-center py-4" aria-live="polite" aria-busy="true">
                    {loadingIndicator ?? (
                        <div className="flex items-center text-xs text-muted-foreground">
                            <LoadingStateCircle />
                            <span>Loading more…</span>
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}

// Export with memo and proper typing
export const ProgressiveList = memo(ProgressiveListInner) as <T>(props: ProgressiveListProps<T>) => ReactNode
