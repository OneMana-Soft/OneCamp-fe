"use client"

import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from "react"
import {VList, VListHandle, type CustomItemComponentProps} from "virtua"
import { cn } from "@/lib/utils/helpers/cn"
import { watchMore } from "@/components/ui/moreMarks"
import { watchListMoving } from "@/lib/ui/scrollState"
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

    /** Every row's height, when they share one (virtua's itemSize): rows are placed before they are measured. */
    itemSize?: number

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

// One function, so a list keyed by index keeps the rows it has made.
const byIndex = (_: unknown, index: number) => index

// A row of one height (itemSize) shows once placed, not after virtua's hidden
// pass, a second style pass in each frame a row entered on a phone (fluid-17).
// virtua's box is hidden, so the row says visible itself (unset, none showed).
function ShownRow({ style, index: _index, ...row }: CustomItemComponentProps) {
    return <div {...row} style={{ ...style, visibility: "visible" }} />
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
                                             keyExtractor = byIndex,
                                             overscan,
                                             itemSize,
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

    useEffect(() => debouncedHandleScroll.cancel, [debouncedHandleScroll])

    // Only the rows virtua draws, each made once until the list or its renderer
    // changes: every render made all N (373 on a phone's long project list) for
    // the dozen shown, and a scroll redrew them (fluid-17).
    const end = !hasMore && !!endMessage && items.length > 0
    const count = items.length + (isLoading ? 1 : 0) + (end ? 1 : 0)
    const rowAt = useMemo(() => {
        const made = new Map<number, React.ReactElement>()
        return (index: number): React.ReactElement => {
            let row = made.get(index)
            if (!row) {
                row =
                    index < items.length ? (
                        <div key={keyExtractor(items[index], index)} className="w-full">
                            {renderItem(items[index], index)}
                        </div>
                    ) : index === items.length && isLoading ? (
                        <div key="vlist:loading" className="flex items-center justify-center py-4">
                            {loadingComponent || (
                                <div className="flex items-center gap-2 text-muted-foreground">
                                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                                    <span>Loading more…</span>
                                </div>
                            )}
                        </div>
                    ) : (
                        <div key="vlist:end" className="flex items-center justify-center py-4">
                            {endMessage}
                        </div>
                    )
                made.set(index, row)
            }
            return row
        }
    }, [items, renderItem, keyExtractor, isLoading, loadingComponent, endMessage])

    // Its scroller (virtua's own box) says when it has more above or below
    // (moreMarks), so a band over the list draws its hairline only while rows
    // run under it (the Inbox's who band, app/hub.css); and while it moves, so
    // the rows it carries under a resting pointer wait for it to settle.
    const marks = useCallback((el: HTMLDivElement | null) => {
        const scroller = el?.firstElementChild instanceof HTMLElement ? el.firstElementChild : null
        const more = watchMore(scroller)
        const moving = watchListMoving(scroller)
        return () => {
            more?.()
            moving?.()
        }
    }, [])

    // Empty state
    if (items.length === 0 && !isLoading && emptyComponent) {
        return (emptyComponent)
    }

    return (
        <div ref={marks} className={cn("relative h-full", className)} >
            <VList
                ref={listRef}
                count={count}
                overscan={overscan}
                itemSize={itemSize}
                item={itemSize ? ShownRow : undefined}
                // The room under the last row: 10rem, or none in a list frame,
                // which keeps the list's end clear of the tab bar itself (app/phone.css F6).
                className="w-full pb-[var(--list-end-room,10rem)] scrollbar-thin no-scrollbar h-full"
                onScroll={debouncedHandleScroll}
            >
                {rowAt}
            </VList>
        </div>
    )
}
