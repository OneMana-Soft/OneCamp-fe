import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { SeparatorPill } from "@/components/separator/separatorPill"
import { debounceUtil } from "@/lib/utils/helpers/debounce"
import type { RowMeta, VirtualizedListProps } from "@/types/virtual"
import { Virtualizer } from "virtua"
import { cn } from "@/lib/utils/helpers/cn"
import {Button} from "@/components/ui/button";
import { ArrowDown, Loader2 } from "@/lib/icons";
import { changedAtStart } from "@/components/message/listShift";
import { rowMeta } from "@/components/message/rowMeta";
import { followAfterScroll, READER_INPUT_MS } from "@/components/message/followEnd";

interface MessageRowProps<T> extends RowMeta {
    data: T
    renderItem: (item: T, meta: RowMeta) => React.ReactNode
}

// One message row. It re-renders when its own message changes, or when its
// place does (newest few, newest, continuing the one above), and for nothing
// else. It used to compare its index and the list's length too, so older
// messages loading above, or one arriving below, re-rendered every message in
// the conversation: 120,000 component renders on one scroll through history,
// and 350 ms of main thread on every send.
function MessageRowImpl<T>({ data, priority, isLast, continued, renderItem }: MessageRowProps<T>) {
    return <>{renderItem(data, { priority, isLast, continued })}</>
}
const MemoizedMessageItem = React.memo(MessageRowImpl) as typeof MessageRowImpl


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
                                          clickedScrollToBottom,
                                          hasNewMessage = true,
                                          ref,
                                          initialTopMostItemIndex,
                                          initialScrollOffsetFromTop,
                                          onScroll,
                                          empty,
                                      }: Omit<VirtualizedListProps<T>, 'onScroll'> & {
                                          initialTopMostItemIndex?: number,
                                          initialScrollOffsetFromTop?: number,
                                          onScroll?: (key: string, offset: number) => void,
                                          /** What an empty conversation shows (ConversationEmpty), in its own hue. */
                                          empty?: React.ReactNode,
                                      }) => {
    const scrollerRef = useRef<HTMLDivElement>(null)
    const contentRef = useRef<HTMLDivElement>(null)
    const [visibleDateIndex, setVisibleDateIndex] = useState<number>(-1)
    const [isScrolledToBottom, setIsScrolledToBottom] = useState(true)

    // STAYING AT THE BOTTOM. A reader at the bottom of a conversation stays
    // there as it grows: a new message, their own send, an image or a code
    // block that finishes laying out, a reaction on the last message. A reader
    // who has scrolled up stays exactly where they are, and new messages are
    // counted on the button that takes them back down. It used to be a one-
    // second window after opening with retries at 50 and 150 ms, then nothing:
    // a message that arrived while you watched landed below the fold, and the
    // list faded in over 300 ms to hide its own settling.
    const restoring = initialTopMostItemIndex !== undefined
    const atBottomRef = useRef(!restoring)
    const [unseen, setUnseen] = useState(0)
    // Only the reader leaves the end (components/message/followEnd): when they
    // last scrolled, pressed or touched the list, and how big the content was
    // at the previous scroll, so a scroll the layout made is told apart.
    const readerInputAt = useRef(0)
    const lastScrollSize = useRef(0)
    const repinFrame = useRef(0)

    // Shift only for the render in which the list changed at its start (see
    // listShift). Worked out while rendering, from the previous items, so
    // virtua sees it in the same render as the new rows.
    const [prevItems, setPrevItems] = useState(items)
    const [shift, setShift] = useState(false)
    if (items !== prevItems) {
        setPrevItems(items)
        setShift(changedAtStart(prevItems, items))
    }

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

    const toBottom = useCallback(() => {
        if (!ref.current || items.length === 0) return
        ref.current.scrollToIndex(items.length - 1, { align: "end" })
    }, [ref, items.length])

    const jumpToLatest = useCallback(() => {
        if (!ref.current || items.length === 0) return
        atBottomRef.current = true
        // The press on this button was the reader's; the scroll it starts
        // is the list's, and lands at the end even if rows measure late.
        readerInputAt.current = 0
        setUnseen(0)
        clickedScrollToBottom()
        toBottom()
    }, [ref, items.length, clickedScrollToBottom, toBottom])

    const calculateVisibleDateIndex = useCallback(() => {
        if (!ref.current || dateKeys.length === 0) return -1
        const startIndex = ref.current.findStartIndex()
        // If scrolled to the top, hide the floating date.
        if (startIndex <= 0) return -1
        let low = 0
        let high = separatorItems.length - 1
        let bestIndex = -1
        while (low <= high) {
            const mid = Math.floor((low + high) / 2)
            if (separatorItems[mid].index <= startIndex) {
                bestIndex = mid
                low = mid + 1
            } else {
                high = mid - 1
            }
        }
        return bestIndex
    }, [ref, dateKeys, separatorItems])

    const debouncedUpdateVisibleDateIndex = useMemo(
        () => debounceUtil(() => setVisibleDateIndex(calculateVisibleDateIndex()), 50),
        [calculateVisibleDateIndex],
    )

    // A conversation shorter than the screen loads what is next to it.
    useLayoutEffect(() => {
        if (!ref.current || items.length === 0) return
        if (ref.current.scrollSize <= ref.current.viewportSize) {
            if (hasOldMessage && !olderMessageLoading) fetchOlderMessage()
            if (hasNewMessage && !newMessageLoading) fetchNewMessage()
        }
    }, [items, ref, hasOldMessage, hasNewMessage, olderMessageLoading, newMessageLoading, fetchOlderMessage, fetchNewMessage]);

    // Coming back to a conversation: where the reader left it, once it is there.
    const [hasRestored, setHasRestored] = useState(false)
    useEffect(() => {
        if (!hasRestored && restoring && ref.current && items.length > 0) {
            ref.current.scrollToIndex(initialTopMostItemIndex!, { align: "start", offset: initialScrollOffsetFromTop || 0 })
            setHasRestored(true)
        }
    }, [restoring, initialTopMostItemIndex, initialScrollOffsetFromTop, hasRestored, items.length, ref])

    // Messages added at the end: followed when at the bottom, counted when not.
    const lastKey = items.length ? items[items.length - 1].key : undefined
    const prevLastKey = useRef(lastKey)
    useLayoutEffect(() => {
        const before = prevLastKey.current
        prevLastKey.current = lastKey
        if (!lastKey || lastKey === before) return
        if (atBottomRef.current) {
            toBottom()
            return
        }
        // Scrolled up: how many arrived below, for the button.
        const from = before ? items.findIndex((i) => i.key === before) : -1
        const arrived = items.slice(from + 1).filter((i) => i.type === "item").length
        if (arrived > 0 && from >= 0) setUnseen((n) => n + arrived)
    }, [lastKey, items, toBottom])

    // Anything that grows the conversation while the reader is at the bottom
    // (an image loading, a code block laying out, a reaction) keeps them there.
    useLayoutEffect(() => {
        const content = contentRef.current
        if (!content || typeof ResizeObserver === "undefined") return
        const observer = new ResizeObserver(() => {
            if (atBottomRef.current) toBottom()
        })
        observer.observe(content)
        return () => observer.disconnect()
    }, [toBottom])

    // The reader's own input on the list: a wheel or trackpad, a touch, a key
    // (Page Up, the arrows), a press on the scrollbar or a quoted message.
    useEffect(() => {
        const scroller = scrollerRef.current
        if (!scroller) return
        const mark = () => {
            readerInputAt.current = performance.now()
        }
        const opts = { passive: true } as const
        const kinds = ["wheel", "touchstart", "touchmove", "pointerdown", "keydown"] as const
        kinds.forEach((k) => scroller.addEventListener(k, mark, opts))
        return () => {
            kinds.forEach((k) => scroller.removeEventListener(k, mark))
            cancelAnimationFrame(repinFrame.current)
        }
    }, [])

    return (
        <div
            ref={scrollerRef}
            className={cn(containerClassName, "touch-pan-y w-full min-w-0 flex-1 min-h-0 md:pb-0 pb-[150px]")}
            style={{
                overflowY: "auto", overflowX: "hidden", overflowAnchor: "none", WebkitOverflowScrolling: "touch", touchAction: "pan-y"
            }}
        >
            {/* The floating date takes no room in the list: a sticky row of zero
                height whose pill hangs below it. In the flow it pushed every
                message down 32 px when it appeared and back when it went, the
                jump scrolling showed (and the layout shift the audit measured),
                and virtua's offsets were out by its height. */}
            <div className="pointer-events-none sticky top-0 z-[var(--z-sticky)] h-0 overflow-visible" aria-hidden={visibleDateIndex < 0 || items.length <= 2}>
                <SeparatorPill
                    className={cn(
                        "py-1.5 bg-gradient-to-b from-background via-background/95 to-transparent transition-opacity duration-150",
                        visibleDateIndex > -1 && items.length > 2 ? "opacity-100" : "opacity-0",
                    )}
                    lineClassName="bg-transparent"
                    pillClassName="rounded-md border border-border bg-background px-2 py-0.5 shadow-overlay"
                >
                    {visibleDateIndex > -1 ? getDateHeading(dateKeys[visibleDateIndex]) : " "}
                </SeparatorPill>
            </div>
            {/* Older messages loading: floats over the list rather than being
                inserted into it. Inside the list it pushed every row down 40 px
                and back when it went, a layout shift on every channel open, and
                the virtualiser counted it as an item. */}
            {olderMessageLoading && (
                <div className="pointer-events-none sticky top-2 z-[var(--z-sticky)] flex h-0 justify-center overflow-visible" role="status" aria-label="Loading older messages">
                    <span className="rounded-full bg-background/90 p-1.5 shadow-overlay">
                        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    </span>
                </div>
            )}
            {/* An empty conversation said nothing at all: a blank panel above the
                composer, which reads as still loading. */}
            {items.length === 0 && !olderMessageLoading && !newMessageLoading && (
                empty ?? (
                    <div className="flex h-full flex-col justify-end px-4 pb-4 md:pb-6">
                        <p className="text-sm font-medium text-foreground">No messages yet</p>
                        <p className="text-sm text-muted-foreground">What you write below starts the conversation.</p>
                    </div>
                )
            )}
            <div ref={contentRef}>
            <Virtualizer
                ref={ref}
                scrollRef={scrollerRef}
                shift={shift}
                // Every message stays mounted (overscan counts rows, not
                // pixels): a jump to a quoted message finds it in the page,
                // and a message's own height never has to be guessed.
                overscan={500}
                onScroll={(offset) => {
                    if (onScroll && ref.current) {
                        const index = ref.current.findStartIndex()
                        if (index !== -1 && items[index]) {
                            const itemOffset = ref.current.getItemOffset(index)
                            onScroll(items[index].key, ref.current.scrollOffset - itemOffset)
                        }
                    }
                    if (!ref.current) return
                    const scrollSize = ref.current.scrollSize
                    const fromBottom = scrollSize - ref.current.viewportSize - offset
                    // Within a few pixels of the end is at the end: the list
                    // follows what arrives. Leaving it takes the reader: a
                    // scroll the layout made while it settled (rows measured,
                    // an image in, older messages above) keeps a following
                    // reader at the end (followEnd).
                    const decision = followAfterScroll({
                        fromBottom,
                        wasFollowing: atBottomRef.current,
                        readerInput: performance.now() - readerInputAt.current < READER_INPUT_MS,
                        contentResized: scrollSize !== lastScrollSize.current,
                    })
                    lastScrollSize.current = scrollSize
                    atBottomRef.current = decision.following
                    if (decision.repin) {
                        cancelAnimationFrame(repinFrame.current)
                        repinFrame.current = requestAnimationFrame(toBottom)
                    }
                    // The button shows past a screenful's edge, not for the
                    // last few pixels, and never while the list is following.
                    const nearBottom = decision.following || fromBottom <= 300
                    setIsScrolledToBottom(nearBottom)
                    if (atBottomRef.current) setUnseen(0)

                    if (offset < 20) setVisibleDateIndex(-1)
                    else debouncedUpdateVisibleDateIndex()

                    if (offset < 200 && !olderMessageLoading && hasOldMessage) fetchOlderMessage()
                    if (fromBottom <= 200 && hasNewMessage && !newMessageLoading) fetchNewMessage()
                }}
            >
                {items.map((item, index) => {
                    if (item.type === "separator") {
                        return (
                            <div key={item.key}>
                                <SeparatorPill>{getDateHeading(item.date!)}</SeparatorPill>
                            </div>
                        )
                    }
                    if (item.type === "unread") {
                        return (
                            <div key={item.key}>
                                <UnreadDivider />
                            </div>
                        )
                    }
                    const meta = rowMeta(index, items.length, item.continued)
                    return (
                        <div key={item.key}>
                            <MemoizedMessageItem
                                data={item.data!}
                                priority={meta.priority}
                                isLast={meta.isLast}
                                continued={meta.continued}
                                renderItem={renderItem}
                            />
                        </div>
                    )
                })}
            </Virtualizer>
            </div>

            {!isScrolledToBottom && (
                // Back to the newest message, saying how many arrived meanwhile.
                // A labelled button on the page's own surface: it was an orange
                // disc with only an arrow, as loud as Send.
                <Button
                    variant="outline"
                    onClick={jumpToLatest}
                    className="sticky bottom-3 md:bottom-6 float-right mr-4 md:mr-6 z-[var(--z-sticky)] h-8 gap-1.5 rounded-md bg-background px-3 text-xs font-medium shadow-overlay motion-safe:animate-msg-fade-in"
                >
                    <ArrowDown className="h-3.5 w-3.5" aria-hidden="true" />
                    {unseen > 0 ? `${unseen} new ${unseen === 1 ? "message" : "messages"}` : "Jump to latest"}
                </Button>
            )}
        </div>
    )
}

/**
 * Where the unread messages start, as the conversation was opened: a hairline
 * and "New" in the accent, the one place a conversation spends it on its own.
 */
function UnreadDivider() {
    return (
        <div className="flex items-center gap-2 px-4 py-1.5" role="separator" aria-label="New messages">
            <div className="h-px flex-1 bg-brand/50" />
            <span className="text-2xs font-semibold text-brand-text">New</span>
        </div>
    )
}

MessageListVirtua.displayName = "MessageListVirtua"
