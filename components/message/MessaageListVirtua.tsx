import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { SeparatorPill } from "@/components/separator/separatorPill"
import { debounceUtil } from "@/lib/utils/helpers/debounce"
import type { VirtualizedListProps } from "@/types/virtual"
import { Virtualizer } from "virtua"
import { cn } from "@/lib/utils/helpers/cn"
import {Button} from "@/components/ui/button";
import { ChevronDown, Loader2 } from "@/lib/icons";

// Memoized item component to prevent unnecessary re-renders
const MemoizedMessageItem = React.memo(({ item, index, total, renderItem }: { item: any, index: number, total: number, renderItem: any }) => {
    return renderItem(item.data!, index, total)
}, (prevProps, nextProps) => {
    // Check if data reference is stable (Redux usually keeps it stable)
    // Check if renderItem is stable (we wrapped it in useCallback)
    return prevProps.item.data === nextProps.item.data && 
           prevProps.index === nextProps.index && 
           prevProps.total === nextProps.total &&
           prevProps.renderItem === nextProps.renderItem
})
MemoizedMessageItem.displayName = "MemoizedMessageItem"


export const MessageListVirtua = <T,>({
                                          items,
                                          renderItem,
                                          getDateHeading,
                                          containerClassName = "relative h-full",
                                          fetchOlderMessage,
                                          olderMessageLoading,
                                          hasOldMessage = true,
                                          fetchNewMessage,
                                          newMessageLoading,
                                          virtualShift,
                                            clickedScrollToBottom,
                                          hasNewMessage = true,
                                          ref,
                                          initialTopMostItemIndex,
                                          initialScrollOffsetFromTop,
                                          onScroll
                                      }: Omit<VirtualizedListProps<T>, 'onScroll'> & { initialTopMostItemIndex?: number, initialScrollOffsetFromTop?: number, onScroll?: (key: string, offset: number) => void }) => {
    const initiallyScrolledToBottom = useRef(false)
    const [visibleDateIndex, setVisibleDateIndex] = useState<number>(-1)
    const [isScrolledToBottom, setIsScrolledToBottom] = useState(true) 


    // Optimized: Calculate dateKeys and separatorItems in one pass if possible, or just memoize efficiently
    const { dateKeys, separatorItems } = useMemo(() => {
        const dKeys: string[] = []
        const sItems: { index: number }[] = []
        
        items.forEach((item, index) => {
            if (item.type === "separator") {
                dKeys.push(item.date!)
                sItems.push({ index })
            }
        })
        return { dateKeys: dKeys, separatorItems: sItems }
    }, [items])


    const scrollToBottom = useCallback(() => {
        if (!ref.current || items.length === 0) return

        clickedScrollToBottom()
    }, [ref, items.length])

    const calculateVisibleDateIndex = useCallback(() => {
        if (!ref.current || dateKeys.length === 0) return -1

        const virtualizer = ref.current
        const startIndex = virtualizer.findStartIndex()
        
        // If scrolled to the top, hide the separator pill
        if (startIndex <= 0) return -1

        if (startIndex === -1) return visibleDateIndex

        // Binary search to find the closest separator <= startIndex
        let low = 0
        let high = separatorItems.length - 1
        let bestIndex = -1

        while (low <= high) {
            const mid = Math.floor((low + high) / 2)
            const separatorIndex = separatorItems[mid].index

            if (separatorIndex <= startIndex) {
                bestIndex = mid
                low = mid + 1
            } else {
                high = mid - 1
            }
        }

        return bestIndex
    }, [dateKeys, separatorItems, visibleDateIndex])

    const updateVisibleDateIndex = useCallback(() => {
        const newIndex = calculateVisibleDateIndex()
        setVisibleDateIndex(newIndex)
    }, [calculateVisibleDateIndex])

    // @ts-ignore
    const debouncedUpdateVisibleDateIndex = useMemo(
        () => debounceUtil(updateVisibleDateIndex, 50), // Reduced debounce time for snappier updates
        [updateVisibleDateIndex],
    )

    useLayoutEffect(() => {
        if (!ref.current || items.length === 0) return;
        const virtualizer = ref.current;
        const scrollSize = virtualizer.scrollSize;
        const viewportSize = virtualizer.viewportSize;

        // If content does not overflow, fetch older and/or new messages
        if (scrollSize <= viewportSize) {
            if (hasOldMessage && !olderMessageLoading) {
                fetchOlderMessage();
            }
            if (hasNewMessage && !newMessageLoading) {
                fetchNewMessage();
            }
        }
    }, [items, ref, hasOldMessage, hasNewMessage, olderMessageLoading, newMessageLoading, fetchOlderMessage, fetchNewMessage]);


    // Only lock bottom if we are NOT restoring a previous position
    const shouldLockBottom = useRef(initialTopMostItemIndex === undefined)
    const [isReady, setIsReady] = useState(initialTopMostItemIndex !== undefined || items.length < 10) // Ready immediately if restoring or small list
    const [hasRestored, setHasRestored] = useState(false)


    // Handle delayed restoration (e.g. when items load after mount)
    useEffect(() => {
        if (!hasRestored && initialTopMostItemIndex !== undefined && ref.current && items.length > 0) {

            ref.current.scrollToIndex(initialTopMostItemIndex, { align: "start", offset: initialScrollOffsetFromTop || 0 })
            setHasRestored(true)
            shouldLockBottom.current = false
            setIsReady(true)
        }
    }, [initialTopMostItemIndex, initialScrollOffsetFromTop, hasRestored, items.length])

    useEffect(() => {
        const timer = setTimeout(() => {
            shouldLockBottom.current = false

        }, 1000)
        return () => clearTimeout(timer)
    }, [])

    useLayoutEffect(() => {
        if (!ref.current || items.length === 0) return

        // If we are in the "locked" phase (initial load), force scroll to bottom on every update
        if (shouldLockBottom.current && !hasRestored) {
             const scroll = () => {
                if (ref.current) {
                    ref.current.scrollToIndex(items.length - 1, {
                        align: "end"
                    })
                }
            }
            scroll()
            // Retry to handle layout shifts
            setTimeout(scroll, 50)
            setTimeout(scroll, 150)
        }
        
        // Mark as ready after the first scroll sequence
        if (!isReady && shouldLockBottom.current) {
             setTimeout(() => setIsReady(true), 200)
        }
        
        // We still set this to true to enable onScroll logic
        initiallyScrolledToBottom.current = true
        
    }, [items.length, ref, hasRestored])

    const handleUserInteraction = () => {
        shouldLockBottom.current = false
    }

    return (
        <div
            className={cn(containerClassName, "touch-pan-y w-full min-w-0 flex-1 min-h-0 transition-opacity duration-300 md:pb-0 pb-[150px]", {
                "opacity-0": items.length > 0 && !isReady,
                "opacity-100": items.length === 0 || isReady
            })}
            onPointerDown={handleUserInteraction}
            onWheel={handleUserInteraction}
            style={{
                overflowY: "auto", overflowX: "hidden", overflowAnchor: "auto", WebkitOverflowScrolling: "touch", touchAction: "pan-y"
            }}
        >
            {visibleDateIndex > -1 && items.length > 2 && (
                <SeparatorPill
                    className="sticky top-1 z-[var(--z-sticky)] transition-opacity duration-200"
                    lineClassName="bg-transparent"
                    pillClassName="shadow-overlay"
                >
                    {getDateHeading(dateKeys[visibleDateIndex])}
                </SeparatorPill>
            )}
            <Virtualizer
                ref={ref}
                shift={virtualShift}
                overscan={500} // Render extra content for smoother scrolling
                // @ts-ignore
                initialTopMostItemIndex={initialTopMostItemIndex !== undefined ? initialTopMostItemIndex : (shouldLockBottom.current ? items.length - 1 : undefined)}
                // @ts-ignore
                followOutput={isScrolledToBottom}
                onScroll={(offset) => {
                    if (onScroll && ref.current) {
                        const index = ref.current.findStartIndex()
                        if (index !== -1 && items[index]) {
                            const itemOffset = ref.current.getItemOffset(index)
                            const scrollOffset = ref.current.scrollOffset
                            const relativeOffset = scrollOffset - itemOffset

                            onScroll(items[index].key, relativeOffset)
                        }
                    }

                    if (shouldLockBottom.current) return 

                    if (!initiallyScrolledToBottom.current || !ref.current) return

                    // Check if scrolled to bottom
                    const isAtBottom = offset >= ref.current.scrollSize - ref.current.viewportSize - 300 // Small threshold
                    setIsScrolledToBottom(isAtBottom)

                    // Hide separator pill when scrolled to the top
                    if (offset < 20) {
                        setVisibleDateIndex(-1)
                    } else {
                        debouncedUpdateVisibleDateIndex()
                    }

                    if (offset < 200 && !olderMessageLoading && hasOldMessage) {
                        fetchOlderMessage()
                    }

                    if (
                        offset - ref.current.scrollSize + ref.current.viewportSize >= -200 &&
                        hasNewMessage &&
                        !newMessageLoading
                    ) {
                        fetchNewMessage()
                    }
                }}
            >
                {/* Loading indicator for older messages */}
                {olderMessageLoading && (
                    <div className="flex justify-center py-2.5">
                        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    </div>
                )}

                {items.map((item, index) => {
                    return (
                        <div key={item.key}>
                            {item.type === "separator" ? (
                                <SeparatorPill>{getDateHeading(item.date!)}</SeparatorPill>
                            ) : (
                                <MemoizedMessageItem item={item} index={index} total={items.length} renderItem={renderItem} />
                            )}
                        </div>
                    )
                })}
            </Virtualizer>

            {!isScrolledToBottom && (
                <Button className="sticky bottom-2 md:bottom-8 float-right mr-4 md:mr-8 z-[var(--z-sticky)] rounded-full shadow-overlay" onClick={scrollToBottom} size="icon">
                    <ChevronDown />
                </Button>
            )}
        </div>
    )
}

MessageListVirtua.displayName = "MessageListVirtua"
