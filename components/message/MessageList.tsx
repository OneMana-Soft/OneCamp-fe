"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { useVirtualizer } from "@tanstack/react-virtual"
import { SeparatorPill } from "@/components/separator/separatorPill"
import type { VirtualizedListProps } from "@/types/virtual"
import { debounceUtil } from "@/lib/utils/helpers/debounce"
import { EmptyState } from "@/components/ui/empty-state"
import { MessageCircle, Loader2 } from "@/lib/icons";

const STICKY_HEADER_BUFFER = 0
const OVERSCAN_COUNT = 20
const ESTIMATED_ITEM_SIZE = 50
const SCROLL_THRESHOLD = 400 // Pixels from top/bottom to trigger fetch

export const MessageList = <T,>({
                                    items,
                                    renderItem,
                                    getDateHeading,
                                    containerClassName = "relative overflow-y-auto h-full",
                                    fetchOlderMessage,
                                    olderMessageLoading,
                                    hasOldMessage = true, // Default to true if not provided
                                    fetchNewMessage,
                                    newMessageLoading,
                                    hasNewMessage = true, // Default to true if not provided
                                }: VirtualizedListProps<T>) => {
    const [visibleDateIndex, setVisibleDateIndex] = useState<number>(-1)
    const [isAtBottom, setIsAtBottom] = useState(true)
    const containerRef = useRef<HTMLDivElement>(null)
    const initialScrollAttempted = useRef(false)
    const prevScrollHeight = useRef(0) // To store scrollHeight before prepending items

    const dateKeys = items.filter((item) => item.type === "separator").map((item) => item.date!)

    const virtualizer = useVirtualizer({
        count: items.length,
        getScrollElement: () => containerRef.current,
        estimateSize: useCallback(() => ESTIMATED_ITEM_SIZE, []),
        overscan: OVERSCAN_COUNT,
        initialOffset: items.length > 0 ? Infinity : 0
    })

    const virtualItems = virtualizer.getVirtualItems()

    // Effect for initial scroll and auto-scroll for new messages
    useEffect(() => {
        const scrollElement = containerRef.current
        if (!scrollElement) return

        // If items become empty, reset the scroll flag
        if (items.length === 0) {
            initialScrollAttempted.current = false
            setIsAtBottom(true) // Assume at bottom when empty
            return
        }

        // Initial scroll logic:
        // Only attempt if it hasn't been attempted yet AND there are items AND the virtualizer has a total size.
        // The total size check is crucial to ensure items have been measured.
        if (!initialScrollAttempted.current && items.length > 0 && virtualizer.getTotalSize() > 0) {
            setTimeout(() => {
                virtualizer.scrollToIndex(items.length - 1, { align: "end", behavior: "auto" })
                initialScrollAttempted.current = true
                setIsAtBottom(true) // After initial scroll, we are at the bottom
            }, 50) // Small delay to allow DOM and virtualizer to settle
            return // Exit to prevent subsequent auto-scroll on this same render cycle
        }

        // Auto-scroll for new messages (only if initial scroll has been done and user is at bottom)
        // This runs on subsequent renders where items.length might increase due to new messages
        if (initialScrollAttempted.current && isAtBottom && !olderMessageLoading) {
            // Keep smooth behavior for new messages for a better live chat experience

            // virtualizer.scrollToIndex(items.length, { align: "end", behavior: "smooth" })
        }
    }, [virtualizer, items.length, isAtBottom, olderMessageLoading])

    // Effect to handle scroll detection for infinite loading and update isAtBottom state
    useEffect(() => {
        const scrollElement = containerRef.current
        if (!scrollElement) return

        const handleScroll = debounceUtil(() => {
            const { scrollTop, scrollHeight, clientHeight } = scrollElement
            const atBottom = scrollHeight - scrollTop - clientHeight < 1
            setIsAtBottom(atBottom)

            // Detect scroll to top for older messages
            // Only fetch if there are potentially older messages
            if (scrollTop < SCROLL_THRESHOLD && fetchOlderMessage && !olderMessageLoading && hasOldMessage) {
                fetchOlderMessage()
            }

            // Detect scroll to bottom for new messages (if applicable)
            // Only fetch if there are potentially new messages
            if (
                scrollHeight - scrollTop - clientHeight < SCROLL_THRESHOLD &&
                fetchNewMessage &&
                !newMessageLoading &&
                hasNewMessage
            ) {
                if (!atBottom) {
                    // Only fetch new if not already at the very bottom (to avoid continuous fetching)
                    fetchNewMessage()
                }
            }
        }, 100) // Debounce scroll handling

        scrollElement.addEventListener("scroll", handleScroll)
        handleScroll()

        return () => scrollElement.removeEventListener("scroll", handleScroll)
    }, [fetchOlderMessage, olderMessageLoading, hasOldMessage, fetchNewMessage, newMessageLoading, hasNewMessage])

    // Effect to maintain scroll position when older messages are loaded (items prepended)
    useEffect(() => {

        const scrollElement = containerRef.current
        if (!scrollElement) return

        if (olderMessageLoading) {
            prevScrollHeight.current = scrollElement.scrollHeight
        } else if (prevScrollHeight.current > 0) {
            const newScrollHeight = scrollElement.scrollHeight
            const heightDifference = newScrollHeight - prevScrollHeight.current
            if (heightDifference > 0) {
                scrollElement.scrollTop += heightDifference
            }
            prevScrollHeight.current = 0
        }
    }, [olderMessageLoading, items.length])

    // Existing useEffect for sticky header logic
    useEffect(() => {
        const updateVisibleDateIndex = () => {
            const scrollElement = containerRef.current
            if (!scrollElement) return
            const scrollTop = scrollElement.scrollTop
            const viewportHeight = scrollElement.clientHeight
            const visibleItems = virtualizer.getVirtualItems()
            if (!visibleItems.length) {
                setVisibleDateIndex(-1)
                return
            }
            const firstSeparator = visibleItems.find((vi) => vi.index === 0)
            if (firstSeparator && firstSeparator.start >= scrollTop && firstSeparator.start <= scrollTop + viewportHeight) {
                setVisibleDateIndex(-1)
                return
            }
            let closestSeparatorIndex = -1
            for (let i = 0; i < items.length; i++) {
                if (items[i].type === "separator") {
                    const virtualItem = visibleItems.find((vi) => vi.index === i)
                    const itemPosition = virtualItem ? virtualItem.start : virtualizer.getTotalSize() * (i / items.length)
                    if (itemPosition <= scrollTop + STICKY_HEADER_BUFFER) {
                        closestSeparatorIndex = dateKeys.indexOf(items[i].date!)
                    } else if (itemPosition > scrollTop) {
                        break
                    }
                }
            }
            setVisibleDateIndex(closestSeparatorIndex)
        }

        const scrollElement = containerRef.current
        if (!scrollElement) return
        const debouncedUpdate = debounceUtil(updateVisibleDateIndex, 50)
        scrollElement.addEventListener("scroll", debouncedUpdate)
        updateVisibleDateIndex()
        return () => scrollElement.removeEventListener("scroll", debouncedUpdate)
    }, [virtualizer, items, dateKeys])

    if (!items.length) {
        return (
            <EmptyState
                icon={MessageCircle}
                title="No messages yet"
                description="Start the conversation by sending a message."
                className="h-full"
            />
        )
    }

    return (
        <div
            ref={containerRef}
            className={containerClassName}
            role="log"
            aria-live="polite"
            style={{
                WebkitOverflowScrolling: "touch",
                touchAction: "pan-y",
            }}
        >
            {/* Loading indicator for older messages */}
            {olderMessageLoading && (
                <div className="flex justify-center py-2.5">
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                </div>
            )}

            {visibleDateIndex > -1 && (
                <SeparatorPill
                    className="sticky top-1 z-[var(--z-sticky)] transition-opacity duration-200 "
                    lineClassName="bg-transparent"
                    pillClassName="shadow-overlay"
                >
                    {getDateHeading(dateKeys[visibleDateIndex])}
                </SeparatorPill>
            )}
            <div style={{ height: `${virtualizer.getTotalSize()}px`, position: "relative" }} >
                {virtualItems.map((virtualItem) => {
                    const item = items[virtualItem.index]
                    return (
                        <div
                            key={item.key}
                            data-index={virtualItem.index}
                            ref={virtualizer.measureElement}
                            style={{
                                position: "absolute",
                                top: 0,
                                left: 0,
                                width: "100%",
                                transform: `translateY(${virtualItem.start}px)`,
                            }}
                        >
                            {item.type === "separator" ? (
                                <SeparatorPill>{getDateHeading(item.date!)}</SeparatorPill>
                            ) : (
                                renderItem(item.data!, virtualItem.index, items.length)
                            )}
                        </div>
                    )
                })}
            </div>

            {/* Loading indicator for new messages */}
            {newMessageLoading  && (
                <div className="flex justify-center py-2.5">
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                </div>
            )}
        </div>
    )
}

MessageList.displayName = "MessageList"
