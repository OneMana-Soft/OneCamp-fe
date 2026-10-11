import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { SeparatorPill } from "@/components/separator/separatorPill"
import { debounceUtil } from "@/lib/utils/helpers/debounce"
import type { RowMeta, VirtualizedListProps } from "@/types/virtual"
import { Virtualizer } from "virtua"
import { cn } from "@/lib/utils/helpers/cn"
import { ArrowDown, Loader2 } from "@/lib/icons";
import { arrivedKeys } from "@/components/message/arrival";
import { RowBoundary } from "@/components/message/rowBoundary";
import { RollingCount } from "@/components/message/rollingCount";
import { changedAtStart } from "@/components/message/listShift";
import { rowMeta } from "@/components/message/rowMeta";
import { followAfterScroll, READER_INPUT_MS } from "@/components/message/followEnd";
import { prefersReducedMotion } from "@/lib/celebrate";

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
function MessageRowImpl<T>({ data, priority, isLast, continued, arrived, renderItem, raw }: MessageRowProps<T> & { raw?: string }) {
    // Each row has its own boundary (design v3 chat, C34): one message that
    // can't be drawn becomes a quiet row, and the conversation stays.
    return <RowBoundary raw={raw}>{renderItem(data, { priority, isLast, continued, arrived })}</RowBoundary>
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
                                          rawText,
                                          isForMe,
                                      }: Omit<VirtualizedListProps<T>, 'onScroll'> & {
                                          initialTopMostItemIndex?: number,
                                          initialScrollOffsetFromTop?: number,
                                          onScroll?: (key: string, offset: number) => void,
                                          /** What an empty conversation shows (ConversationEmpty). */
                                          empty?: React.ReactNode,
                                          /** A message as stored, for the row that can't be drawn ("Show raw"). */
                                          rawText?: (item: T) => string | undefined,
                                          /** Whether a message is for the reader (mentions them): the jump pill says so. */
                                          isForMe?: (item: T) => boolean,
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
    // The rows that arrived while the reader followed the end (C18), from the
    // same comparison: they rise into place once; anything loaded stands still.
    const [arrived, setArrived] = useState<ReadonlySet<string>>(() => new Set())
    if (items !== prevItems) {
        setPrevItems(items)
        setShift(changedAtStart(prevItems, items))
        setArrived(arrivedKeys(prevItems, items, atBottomRef.current))
    }
    // An empty conversation getting its first message keeps its empty block a
    // moment longer, to leave rather than vanish.
    const [emptyLeaving, setEmptyLeaving] = useState(false)
    const [wasEmpty, setWasEmpty] = useState(items.length === 0)
    if (wasEmpty && items.length > 0) {
        setWasEmpty(false)
        setEmptyLeaving(true)
    } else if (!wasEmpty && items.length === 0) {
        setWasEmpty(true)
    }
    useEffect(() => {
        if (!emptyLeaving) return
        const t = window.setTimeout(() => setEmptyLeaving(false), 220)
        return () => window.clearTimeout(t)
    }, [emptyLeaving])
    // Unseen messages that mention the reader, for the jump pill.
    const [unseenForMe, setUnseenForMe] = useState(0)
    // While the reader scrolls (and 1.2 s after), the floating day shows.
    const [scrolling, setScrolling] = useState(false)
    const scrollIdle = useRef(0)
    useEffect(() => () => window.clearTimeout(scrollIdle.current), [])

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

    // The floating day shows while the reader scrolls back through history,
    // and settles away 1.2 s after they stop at the end.
    const showDay = visibleDateIndex > -1 && items.length > 2 && (scrolling || !isScrolledToBottom)

    const toBottom = useCallback(() => {
        if (!ref.current || items.length === 0) return
        ref.current.scrollToIndex(items.length - 1, { align: "end" })
    }, [ref, items.length])

    const jumpToLatest = useCallback(() => {
        if (!ref.current || items.length === 0) return
        const v = ref.current
        // Within three screens of the end, a smooth 280ms glide; further, an
        // instant jump (C17): a long smooth scroll is a ride nobody asked for.
        const distance = v.scrollSize - v.viewportSize - v.scrollOffset
        const near = distance < v.viewportSize * 3
        atBottomRef.current = true
        // The press on this button was the reader's; the scroll it starts
        // is the list's, and lands at the end even if rows measure late.
        readerInputAt.current = 0
        setUnseen(0)
        setUnseenForMe(0)
        clickedScrollToBottom()
        v.scrollToIndex(items.length - 1, { align: "end", smooth: near && !prefersReducedMotion() })
    }, [ref, items.length, clickedScrollToBottom])

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
        const fresh = items.slice(from + 1).filter((i) => i.type === "item")
        if (fresh.length > 0 && from >= 0) {
            setUnseen((n) => n + fresh.length)
            if (isForMe) {
                const mine = fresh.filter((i) => i.data !== undefined && isForMe(i.data)).length
                if (mine) setUnseenForMe((n) => n + mine)
            }
        }
    }, [lastKey, items, toBottom, isForMe])

    // Escape while the pill shows takes the reader to the end (Discord).
    useEffect(() => {
        if (isScrolledToBottom) return
        const onKey = (e: KeyboardEvent) => {
            if (e.key !== "Escape" || e.defaultPrevented) return
            const t = e.target as HTMLElement | null
            if (t?.closest("[role=dialog],[role=menu],[contenteditable=true],input,textarea")) return
            if (!scrollerRef.current?.contains(document.activeElement) && document.activeElement !== document.body) return
            jumpToLatest()
        }
        window.addEventListener("keydown", onKey)
        return () => window.removeEventListener("keydown", onKey)
    }, [isScrolledToBottom, jumpToLatest])

    // How many unread rows the reader opened onto, for "NEW · 14".
    const unreadCount = useMemo(() => {
        const at = items.findIndex((i) => i.type === "unread")
        return at < 0 ? 0 : items.slice(at + 1).filter((i) => i.type === "item").length
    }, [items])

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
            {/* The floating day (C15) takes no room in the list: a sticky row
                of zero height. Behind its pill a 44px scrim of the sheet fades
                the row below under it, so the pill never sits on a name. While
                older messages load, the pill itself spins. */}
            <div className="pointer-events-none sticky top-0 z-[var(--z-sticky)] h-0 overflow-visible" aria-hidden={!showDay}>
                <div
                    className={cn(
                        "absolute inset-x-0 top-0 h-11 bg-gradient-to-b from-sheet via-sheet/80 to-transparent transition-opacity duration-[140ms] md:h-11",
                        showDay ? "opacity-100" : "opacity-0",
                    )}
                />
                <div className={cn("absolute inset-x-0 top-2.5 flex justify-center transition-opacity duration-[140ms]", showDay ? "opacity-100" : "opacity-0")}>
                    <DayPill
                        floating
                        label={visibleDateIndex > -1 ? getDateHeading(dateKeys[visibleDateIndex]) : ""}
                        loading={olderMessageLoading}
                        days={dateKeys.map((d, i) => ({ label: getDateHeading(d), index: separatorItems[i].index }))}
                        onJump={(index) => ref.current?.scrollToIndex(index, { align: "start" })}
                    />
                </div>
            </div>
            {olderMessageLoading && !showDay && (
                <div className="pointer-events-none sticky top-2.5 z-[var(--z-sticky)] flex h-0 justify-center overflow-visible" role="status" aria-label="Loading older messages">
                    <span className="flex h-6 items-center rounded-xl bg-sheet px-2.5 shadow-e1">
                        <Loader2 className="size-3 animate-spin text-ink-3" />
                    </span>
                </div>
            )}
            {/* An empty conversation said nothing at all: a blank panel above the
                composer, which reads as still loading. */}
            {/* The first message landing: the empty block fades and drops
                (200 ms) as the row arrives, rather than vanishing (C58). */}
            {emptyLeaving && items.length > 0 && (
                <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 animate-empty-out">{empty}</div>
            )}
            {items.length === 0 && !olderMessageLoading && !newMessageLoading && (
                empty ?? (
                    <div className="flex h-full flex-col justify-end px-5 pb-6">
                        <p className="text-heading text-ink">No messages yet</p>
                        <p className="text-ui text-ink-2">What you write below starts the conversation.</p>
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
                    if (atBottomRef.current) {
                        setUnseen(0)
                        setUnseenForMe(0)
                    }

                    if (offset < 20) setVisibleDateIndex(-1)
                    else debouncedUpdateVisibleDateIndex()
                    setScrolling(true)
                    window.clearTimeout(scrollIdle.current)
                    scrollIdle.current = window.setTimeout(() => setScrolling(false), 1200)

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
                                <UnreadDivider count={unreadCount} seen={isScrolledToBottom && !scrolling} />
                            </div>
                        )
                    }
                    const meta = rowMeta(index, items.length, item.continued, arrived.has(item.key))
                    return (
                        <div key={item.key}>
                            <MemoizedMessageItem
                                data={item.data!}
                                priority={meta.priority}
                                isLast={meta.isLast}
                                continued={meta.continued}
                                arrived={meta.arrived}
                                renderItem={renderItem}
                                raw={rawText?.(item.data!)}
                            />
                        </div>
                    )
                })}
            </Virtualizer>
            </div>

            {!isScrolledToBottom && (
                // Back to the newest message (C17): a centred pill 16px above
                // the composer, on the pop surface at e3. With messages waiting
                // its arrow turns the accent, which is "for you"; one that
                // mentions you says so. It takes no room: a zero-height sticky
                // row it hangs above.
                <div className="pointer-events-none sticky bottom-4 z-[var(--z-sticky)] flex h-0 justify-center overflow-visible pointer-coarse:bottom-3">
                    <button
                        type="button"
                        onClick={jumpToLatest}
                        data-jump-pill=""
                        className={cn(
                            "pointer-events-auto absolute bottom-0 left-1/2 flex h-[30px] -translate-x-1/2 items-center gap-2 whitespace-nowrap rounded-[15px] pl-1.5 pr-3 text-ui-sm font-medium text-ink",
                            "pop-surface animate-pill-in transition-[translate,scale] duration-[140ms] ease-out hover:-translate-y-px active:scale-[0.97]",
                            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                        )}
                    >
                        <span className={cn("flex size-5 items-center justify-center rounded-[10px]", unseen > 0 ? "bg-brand text-brand-foreground" : "bg-press text-ink-2")}>
                            <ArrowDown className="size-3.5" aria-hidden="true" />
                        </span>
                        {unseen > 0 ? (
                            <span className="flex items-center gap-1.5">
                                <span><RollingCount value={unseen} /> new{unseenForMe > 0 ? "" : unseen === 1 ? " message" : " messages"}</span>
                                {unseenForMe > 0 && (
                                    <>
                                        <span aria-hidden="true" className="text-ink-3">·</span>
                                        <span aria-hidden="true" className="size-1.5 rounded-full bg-brand" />
                                        <span>{unseenForMe} mentions you</span>
                                    </>
                                )}
                            </span>
                        ) : (
                            "Jump to latest"
                        )}
                    </button>
                </div>
            )}
        </div>
    )
}

/**
 * Where the unread messages start, as the conversation was opened (C16): a
 * hairline in the accent at 45% running from the left to "NEW" on the right,
 * with the count when the reader opened onto more than a screenful. It draws
 * itself once from the right, 200ms after the list settles, and once the
 * reader has reached the end it quiets to 60%, never vanishing under them.
 */
function UnreadDivider({ count, seen }: { count: number; seen: boolean }) {
    const [quiet, setQuiet] = useState(false)
    useEffect(() => {
        if (!seen) return
        const t = window.setTimeout(() => setQuiet(true), 3000)
        return () => window.clearTimeout(t)
    }, [seen])
    return (
        <div data-unread-line="" className="flex items-center gap-2.5 pb-1 pl-5 pr-6 pt-2" role="separator" aria-label={count > 10 ? `${count} new messages` : "New messages"}>
            <div className="h-px flex-1 origin-right bg-brand/45 animate-line-draw" />
            <span className={cn("text-micro font-semibold leading-none tracking-[0.02em] text-brand-text transition-opacity duration-[600ms]", quiet && "opacity-60")}>
                NEW{count > 10 ? <span className="tabular-nums"> · {count}</span> : null}
            </span>
        </div>
    )
}

/**
 * The day pill (C15): 24px, the sheet at e1, r12, 12/510 in ink-2. Floating,
 * it is a button: a menu of the days loaded here, to jump to one. Its label
 * rolls when the day under it changes.
 */
function DayPill({ label, floating = false, loading = false, days = [], onJump }: { label: string; floating?: boolean; loading?: boolean; days?: { label: string; index: number }[]; onJump?: (index: number) => void }) {
    const [open, setOpen] = useState(false)
    const pill = cn(
        "pointer-events-auto relative flex h-6 items-center gap-1.5 rounded-xl bg-sheet px-2.5 text-meta font-medium text-ink-2 shadow-e1",
        floating && "transition-shadow duration-[140ms] hover:shadow-e2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
    )
    if (!floating) return <span className={pill}>{label}</span>
    return (
        <div className="relative">
            <button type="button" className={pill} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)} onBlur={(e) => { if (!e.currentTarget.parentElement?.contains(e.relatedTarget as Node)) setOpen(false) }}>
                {loading ? <Loader2 className="size-3 animate-spin text-ink-3" aria-label="Loading older messages" /> : <span key={label} className="animate-count-in">{label}</span>}
            </button>
            {open && days.length > 0 && (
                <div role="menu" className="pop-surface pointer-events-auto absolute left-1/2 top-8 z-[var(--z-dropdown)] w-48 -translate-x-1/2 p-1 animate-pop-in">
                    <p className="px-2 pb-1 pt-1.5 text-meta font-medium text-ink-3">Jump to</p>
                    {days.slice().reverse().map((d) => (
                        <button
                            key={d.index}
                            type="button"
                            role="menuitem"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => { onJump?.(d.index); setOpen(false) }}
                            className="flex h-[30px] w-full items-center rounded-md px-2 text-left text-ui-sm text-ink hover:bg-press focus-visible:bg-press focus-visible:outline-none"
                        >
                            {d.label}
                        </button>
                    ))}
                </div>
            )}
        </div>
    )
}

MessageListVirtua.displayName = "MessageListVirtua"
