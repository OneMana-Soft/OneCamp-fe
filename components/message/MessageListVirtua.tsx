import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { useListMoving } from "@/lib/ui/scrollState"
import { SeparatorPill } from "@/components/separator/separatorPill"
import { debounceUtil } from "@/lib/utils/helpers/debounce"
import type { RowMeta, VirtualizedListProps } from "@/types/virtual"
import { Virtualizer } from "virtua"
import { cn } from "@/lib/utils/helpers/cn"
import { ArrowDown, Loader2 } from "@/lib/icons";
import { arrivedKeys } from "@/components/message/arrival";
import { onEscape } from "@/lib/keys/onEscape";
import { RowBoundary } from "@/components/message/rowBoundary";
import { RollingCount } from "@/components/message/rollingCount";
import { changedAtStart } from "@/components/message/listShift";
import { rowMeta } from "@/components/message/rowMeta";
import { followAfterScroll, READER_INPUT_MS } from "@/components/message/followEnd";
import { listKeyAction } from "@/components/message/listKeys";
import { prefersReducedMotion } from "@/lib/reducedMotion";
import { ix } from "@/lib/ui/interactive"
import { ErrorState } from "@/components/ui/error-state";
import { highlightMessage } from "@/lib/utils/scrollToMessage";
import { clockTime } from "@/lib/utils/date/clock";

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


/** The gap between the pill and the composer on a phone (the pill's bottom-3 elsewhere). */
const PILL_GAP = 12
/** The unread banner's pill ends 42px down (top-2.5, h-8); 8px clear under it. */
const BANNER_BOTTOM = 42, BANNER_GAP = 8

/**
 * Where a phone's "Jump to latest" hangs: PILL_GAP above the composer's card,
 * or above the command answers showing over it (a Giphy card), as an offset
 * from the list's padding edge. Below md the composer floats over the room the
 * list pads under its last message (phone.css --phone-composer-room), and a
 * sticky offset counts from above that padding, so the pill hung about 100px
 * over the conversation, across the author's name of a message (QA F-27).
 * Measured while it shows: as the card grows with the tools and the formatting
 * row, as answers come and go, and as the room follows the sheet. Undefined at
 * md and up, or with no composer. Wherever the card is, the pill's foot lands
 * PILL_GAP above its top.
 */
function usePillAboveComposer(scroller: React.RefObject<HTMLElement | null>, shown: boolean): number | undefined {
    const [offset, setOffset] = useState<number>()
    useEffect(() => {
        const list = scroller.current
        const phone = typeof window !== "undefined" && window.matchMedia?.("(max-width: 767.98px)").matches
        // The phone's floating card, or (640 to 767px wide) the computer's
        // composer under the list, which the room still pads.
        const card =
            document.querySelector<HTMLElement>("[data-phone-composer]") ??
            document.querySelector<HTMLElement>("[data-composer-sheet]") ??
            document.querySelector<HTMLElement>("[data-composer]")
        if (!shown || !phone || !list || !card) {
            setOffset(undefined)
            return
        }
        const sheet = card.closest<HTMLElement>("[data-composer-sheet]")
        const measure = () => {
            // A command's answers show above the card, in its sheet.
            const answers = sheet?.querySelector<HTMLElement>("[data-command-answers]")
            const top = Math.min(card.getBoundingClientRect().top, answers?.getBoundingClientRect().top ?? Infinity)
            const room = parseFloat(getComputedStyle(list).paddingBottom) || 0
            setOffset(Math.round(list.getBoundingClientRect().bottom - top + PILL_GAP - room))
        }
        measure()
        if (typeof ResizeObserver === "undefined") return
        const observer = new ResizeObserver(measure)
        observer.observe(card)
        // The sheet grows and shrinks as answers come and go, and the list's
        // room (its padding, so its content box) follows the sheet.
        if (sheet) observer.observe(sheet)
        observer.observe(list)
        return () => observer.disconnect()
    }, [scroller, shown])
    return offset
}

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
                                          start,
                                          label,
                                          rowLabel,
                                          isOwn,
                                          retryOlder,
                                          anchor,
                                          timeOf,
                                          onMarkRead,
                                          unreadKnown = true,
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
                                          /**
                                           * Where the conversation begins (ConversationEmpty, placement "start"):
                                           * drawn above the first message once the whole history is here, as
                                           * Slack and Discord open every history, so reaching the top says so.
                                           */
                                          start?: React.ReactNode,
                                          /**
                                           * What a screen reader calls the list: "Messages in #engineering" (SD-53).
                                           */
                                          label?: string,
                                          /**
                                           * A message's summary (lib/chat/messageSummary): its row's label, and what
                                           * is announced when it arrives live (SD-53, SD-54).
                                           */
                                          rowLabel?: (item: T) => string,
                                          /** Whether the reader sent it: their own sends are never announced. */
                                          isOwn?: (item: T) => boolean,
                                          /**
                                           * Set when the older page failed: the list says so with Try again where the
                                           * conversation's start would be, and asks for no more (SD-BUG-1).
                                           */
                                          retryOlder?: () => void,
                                          /**
                                           * The message a link opened the conversation at (its row's key): the
                                           * list goes to it, in the middle of the screen, and lights it up a
                                           * moment (chat A1: "every link opens the message in place,
                                           * highlighted"). It wins over where the reader last left the list.
                                           */
                                          anchor?: string,
                                          /** A message's time, for the unread banner's "since 10:14" (chat B27). */
                                          timeOf?: (item: T) => string | undefined,
                                          /** Marks the conversation read, from the unread banner (chat B27). */
                                          onMarkRead?: () => void,
                                          /** Whether the unread count is known. */
                                          unreadKnown?: boolean,
                                      }) => {
    const scrollerRef = useRef<HTMLDivElement>(null)
    useListMoving(scrollerRef)
    const contentRef = useRef<HTMLDivElement>(null)
    const [visibleDateIndex, setVisibleDateIndex] = useState<number>(-1)
    const [isScrolledToBottom, setIsScrolledToBottom] = useState(true)
    const pillOffset = usePillAboveComposer(scrollerRef, !isScrolledToBottom)

    // STAYING AT THE BOTTOM. A reader at the bottom of a conversation stays
    // there as it grows: a new message, their own send, an image or a code
    // block that finishes laying out, a reaction on the last message. A reader
    // who has scrolled up stays exactly where they are, and new messages are
    // counted on the button that takes them back down. It used to be a one-
    // second window after opening with retries at 50 and 150 ms, then nothing:
    // a message that arrived while you watched landed below the fold, and the
    // list faded in over 300 ms to hide its own settling.
    const restoring = !anchor && initialTopMostItemIndex !== undefined
    const atBottomRef = useRef(!restoring && !anchor)
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
    // Each message's summary, worked out once per message (an edited one is
    // a new object): the list renders on every scroll.
    const labels = useMemo(() => new WeakMap<object, string>(), [rowLabel])
    // Every row, kept mounted (below).
    const everyRow = useMemo(() => Array.from({ length: items.length }, (_, i) => i), [items.length])
    const labelOf = (data: T | undefined): string | undefined => {
        if (!rowLabel || data === undefined) return undefined
        const key = data as unknown as object
        let said = labels.get(key)
        if (said === undefined) {
            said = rowLabel(data)
            labels.set(key, said)
        }
        return said
    }
    // What a screen reader is told of messages arriving live, wherever the
    // reader is in the list (SD-54): a backlog, a page and your own sends say
    // nothing (arrivedKeys). The zero-width mark makes a repeat a change.
    const [spoken, setSpoken] = useState("")
    if (items !== prevItems) {
        setPrevItems(items)
        setShift(changedAtStart(prevItems, items))
        setArrived(arrivedKeys(prevItems, items, atBottomRef.current))
        const live = rowLabel ? arrivedKeys(prevItems, items, true) : undefined
        const said = live?.size
            ? items.filter((i) => live.has(i.key) && i.data !== undefined && !isOwn?.(i.data)).map((i) => labelOf(i.data)!)
            : []
        if (said.length) setSpoken((was) => said.join(". ") + (was.endsWith("\u200b") ? "" : "\u200b"))
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
    // The conversation's beginning heads it once nothing older is left to load;
    // an older page that failed says so in its place, with Try again, never
    // that the conversation begins there (SD-BUG-1).
    const startNode = retryOlder && !olderMessageLoading && items.length > 0
        ? <div data-older-failed=""><ErrorState compact subject="older messages" onRetry={retryOlder} /></div>
        : start && !hasOldMessage && !olderMessageLoading && items.length > 0
            ? <div data-conversation-start="">{start}</div>
            : null

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

    useEffect(() => debouncedUpdateVisibleDateIndex.cancel, [debouncedUpdateVisibleDateIndex])

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

    // A link's message: once its row is in the list, the list goes to it and it
    // lights up. Until the reader takes the list (a wheel, a touch, a key),
    // older messages loading above it keep it in the middle, so it opens with
    // what led to it as well as what followed.
    const anchoredTo = useRef<{ key: string; at: number } | undefined>(undefined)
    useLayoutEffect(() => {
        if (!anchor || !ref.current) return
        const index = items.findIndex((i) => i.key === anchor)
        if (index < 0) return
        const was = anchoredTo.current
        const first = was?.key !== anchor
        if (!first && readerInputAt.current > was!.at) return
        anchoredTo.current = { key: anchor, at: first ? performance.now() : was!.at }
        atBottomRef.current = false
        setIsScrolledToBottom(false)
        ref.current.scrollToIndex(index, { align: "center" })
        if (first) requestAnimationFrame(() => highlightMessage(anchor))
    }, [anchor, items, ref])

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
        return onEscape("page", (e) => {
            const t = e.target as HTMLElement | null
            if (t?.closest("[role=dialog],[role=menu],[contenteditable=true],input,textarea")) return false
            if (!scrollerRef.current?.contains(document.activeElement) && document.activeElement !== document.body) return false
            jumpToLatest()
        })
    }, [isScrolledToBottom, jumpToLatest])

    // WHERE A CONVERSATION OPENS (chat B27, D-SD6). At the newest message,
    // with the line drawn from the marker; but with more than a screen
    // unread, at the first unread, its line under a banner that says how many
    // since when, with Jump and Mark as read. Once, as it opens; never over a
    // link's message or the place the reader left it.
    const [banner, setBanner] = useState(false)
    const [lineRead, setLineRead] = useState(false)
    const opened = useRef(false)
    const bannerRef = useRef<HTMLDivElement>(null)
    const placeLine = useRef<number | null>(null)
    // The line clear of the banner, under the last read message (at most a third of a screen).
    const toUnreadLine = useCallback((at: number) => {
        const v = ref.current
        if (!v) return
        const pill = bannerRef.current?.getBoundingClientRect()
        const clear = (pill?.height ? pill.bottom - (scrollerRef.current?.getBoundingClientRect().top ?? 0) : BANNER_BOTTOM) + BANNER_GAP
        let read = at - 1
        while (read >= 0 && items[read].type !== "item") read--
        const context = read < 0 ? 0 : Math.min(v.getItemOffset(at) - v.getItemOffset(read), v.viewportSize / 3)
        v.scrollToIndex(at, { align: "start", offset: -(clear + context) })
    }, [items, ref])
    useLayoutEffect(() => {
        if (opened.current || anchor || restoring || !ref.current || items.length === 0 || !unreadKnown) return
        opened.current = true
        const at = items.findIndex((i) => i.type === "unread")
        if (at < 0) return
        const frame = requestAnimationFrame(() => {
            const v = ref.current
            if (!v || v.getItemOffset(at) >= v.scrollOffset) return
            atBottomRef.current = false
            setIsScrolledToBottom(false)
            toUnreadLine(at)
            placeLine.current = at
            setBanner(true)
        })
        return () => cancelAnimationFrame(frame)
    }, [items, anchor, restoring, ref, unreadKnown, toUnreadLine])
    // Then by the banner's measured edge.
    useLayoutEffect(() => {
        if (!banner || placeLine.current === null) return
        toUnreadLine(placeLine.current)
        placeLine.current = null
    }, [banner, toUnreadLine])
    // Reaching the end has read it: the banner goes.
    useEffect(() => {
        if (isScrolledToBottom) setBanner(false)
    }, [isScrolledToBottom])

    // How many unread rows the reader opened onto, for "NEW · 14".
    const unreadCount = useMemo(() => {
        const at = items.findIndex((i) => i.type === "unread")
        return at < 0 ? 0 : items.slice(at + 1).filter((i) => i.type === "item").length
    }, [items])

    const unreadSince = useMemo(() => {
        if (!banner || !timeOf) return undefined
        const at = items.findIndex((i) => i.type === "unread")
        const first = at < 0 ? undefined : items.slice(at + 1).find((i) => i.type === "item" && i.data !== undefined)
        return first?.data !== undefined ? timeOf(first.data) : undefined
    }, [banner, items, timeOf])

    // Anything that grows the conversation while the reader is at the bottom
    // (an image loading, a code block laying out, a reaction) keeps them there.
    // So does anything that shortens the list itself: a long draft growing the
    // composer, the formatting row or a reply opening on it, a huddle banner
    // above, the phone's keyboard. The last messages used to slide under the
    // composer while you wrote your answer to them.
    useLayoutEffect(() => {
        const content = contentRef.current
        const scroller = scrollerRef.current
        if (!content || typeof ResizeObserver === "undefined") return
        const observer = new ResizeObserver(() => {
            if (atBottomRef.current) toBottom()
        })
        observer.observe(content)
        if (scroller) observer.observe(scroller)
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

    // Page Up and Down, Home and End on the viewport (listKeys): the keyboard's
    // way through the history, without tabbing through every message.
    const onViewportKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
        const scroller = scrollerRef.current
        const action = scroller ? listKeyAction(e, scroller.clientHeight) : null
        if (!scroller || !action) return
        e.preventDefault()
        readerInputAt.current = performance.now()
        if ("scrollBy" in action) {
            if (typeof scroller.scrollBy === "function") scroller.scrollBy({ top: action.scrollBy, behavior: prefersReducedMotion() ? "auto" : "smooth" })
            else scroller.scrollTop += action.scrollBy
        } else if (action.to === "end") {
            jumpToLatest()
        } else if (items.length > 0) {
            // The oldest message loaded; reaching the top asks for older ones.
            ref.current?.scrollToIndex(0, { align: "start" })
        }
    }

    return (
        <div
            ref={scrollerRef}
            // One Tab stop for the whole history, named for a screen reader
            // (INTERACTION_SPEC §7.3): Page Up and Down scroll it from here.
            // Named for its conversation, so two side by side (split view)
            // are told apart.
            role="region"
            aria-label={label ?? "Messages"}
            tabIndex={0}
            data-message-viewport=""
            onKeyDown={onViewportKey}
            // A column, so a conversation shorter than the screen sits at its
            // end, just above the composer, as chat reads (the content's
            // mt-auto); a longer one scrolls as before. Its focus ring sits
            // inside it, where the panes around it can't clip it.
            className={cn(containerClassName, "flex touch-pan-y flex-col w-full min-w-0 flex-1 min-h-0 md:pb-0 pb-[var(--phone-composer-room)] focus-visible:outline-offset-[calc(var(--ix-ring)*-1)]")}
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
                <div className={cn("absolute inset-x-0 top-2.5 flex justify-center transition-opacity duration-[140ms]", showDay && !banner ? "opacity-100" : "opacity-0")}>
                    <DayPill
                        floating
                        label={visibleDateIndex > -1 ? getDateHeading(dateKeys[visibleDateIndex]) : ""}
                        loading={olderMessageLoading}
                        days={dateKeys.map((d, i) => ({ label: getDateHeading(d), index: separatorItems[i].index }))}
                        onJump={(index) => ref.current?.scrollToIndex(index, { align: "start" })}
                    />
                </div>
            </div>
            {banner && (
                <UnreadBanner
                    pillRef={bannerRef}
                    count={unreadCount}
                    since={unreadSince}
                    onJump={() => {
                        const at = items.findIndex((i) => i.type === "unread")
                        if (at >= 0) toUnreadLine(at)
                    }}
                    onMarkRead={onMarkRead && (() => {
                        onMarkRead()
                        setBanner(false)
                        setLineRead(true)
                    })}
                />
            )}
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
            {/* A labelled list of labelled rows (SD-53), busy while an older page loads. */}
            <div ref={contentRef} data-list-content="" className="mt-auto" role="list" aria-label={label} aria-busy={olderMessageLoading || undefined}>
            <Virtualizer
                ref={ref}
                scrollRef={scrollerRef}
                shift={shift}
                // Every message stays mounted: a jump to a quoted message
                // finds it in the page, and a message's own height never has
                // to be guessed. Overscan alone didn't keep them: the
                // virtualiser keeps it only ahead of a scroll, so scrolling
                // down took out every row above the screen and they all
                // mounted afresh when it stopped (opening a thread at the foot
                // of a channel read back by six pages remounted 341 rows,
                // 8,383 components: fluid-04, 20 Oct).
                overscan={500}
                keepMounted={everyRow}
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

                    if (offset < 200 && !olderMessageLoading && hasOldMessage && !retryOlder) fetchOlderMessage()
                    if (fromBottom <= 200 && hasNewMessage && !newMessageLoading) fetchNewMessage()
                }}
            >
                {items.map((item, index) => {
                    // The beginning rides on the first row (a virtual item of its
                    // own would shift every index the list scrolls by).
                    // Each row is a list item; the beginning (or the failed page)
                    // is one of its own above the first.
                    const head = index === 0 && startNode ? <div role="listitem">{startNode}</div> : null
                    if (item.type === "separator") {
                        return (
                            <div key={item.key}>
                                {head}
                                <div role="listitem"><SeparatorPill>{getDateHeading(item.date!)}</SeparatorPill></div>
                            </div>
                        )
                    }
                    if (item.type === "unread") {
                        return (
                            <div key={item.key}>
                                {head}
                                {lineRead ? null : <div role="listitem"><UnreadDivider count={unreadCount} seen={isScrolledToBottom && !scrolling} /></div>}
                            </div>
                        )
                    }
                    if (item.type === "shared") {
                        return (
                            <div key={item.key}>
                                {head}
                                <div role="listitem"><SharedHistoryHeading /></div>
                            </div>
                        )
                    }
                    const meta = rowMeta(index, items.length, item.continued, arrived.has(item.key))
                    return (
                        <div key={item.key}>
                            {head}
                            <div role="listitem" aria-label={labelOf(item.data)}>
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
                        </div>
                    )
                })}
            </Virtualizer>
            </div>

            <p className="sr-only" aria-live="polite" data-announcer="">{spoken}</p>

            {!isScrolledToBottom && (
                // Back to the newest message (C17): a pill 16px above the
                // composer, centred over it (the composer is the 800px column
                // 20px in, so on a wide sheet the pill keeps to that column's
                // middle, not the sheet's), on the pop surface at e3. With
                // messages waiting its arrow turns the accent, which is "for
                // you"; one that mentions you says so. It takes no room: a
                // zero-height sticky row it hangs above.
                <div
                    data-jump-row=""
                    className="pointer-events-none sticky bottom-4 z-[var(--z-sticky)] flex h-0 justify-center overflow-visible pointer-coarse:bottom-3"
                    style={pillOffset === undefined ? undefined : { bottom: pillOffset }}
                >
                    <button
                        type="button"
                        onClick={jumpToLatest}
                        data-jump-pill=""
                        className={cn(
                            "pointer-events-auto absolute bottom-0 left-[min(50%,420px)] flex h-[30px] -translate-x-1/2 items-center gap-2 whitespace-nowrap rounded-[15px] pl-1.5 pr-3 text-ui-sm font-medium text-ink",
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
                                        <span>{unseenForMe} {unseenForMe === 1 ? "mentions" : "mention"} you</span>
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
 * The unread banner (chat B27, D-SD6): a conversation opened onto more than a
 * screen of unread says how many since when, with Jump (back to the line) and
 * Mark as read. A sticky strip of no height at the list's top, as the day pill.
 * A phone says it short; no phrase wraps; a finger's reach is 44px (phone.css F3).
 */
function UnreadBanner({ count, since, onJump, onMarkRead, pillRef }: { count: number; since?: string; onJump: () => void; onMarkRead?: () => void; pillRef: React.Ref<HTMLDivElement> }) {
    const time = since ? ` since ${clockTime(new Date(since))}` : ""
    return (
        <div className="sticky top-0 z-[var(--z-sticky)] h-0 overflow-visible" data-unread-banner="">
            <div role="status" className="absolute inset-x-0 top-2.5 flex justify-center px-4">
                <div ref={pillRef} className="flex min-h-8 flex-wrap items-center justify-center gap-x-1 whitespace-nowrap rounded-xl bg-sheet py-1 pl-3 pr-1 text-ui-sm text-ink shadow-e2 ring-1 ring-line">
                    <span className="font-medium tabular-nums sm:hidden">{count} new{time}</span>
                    <span className="hidden font-medium tabular-nums sm:inline">{count} new {count === 1 ? "message" : "messages"}{time}</span>
                    <button type="button" onClick={onJump} {...ix("button")} data-touch-target="" className="ml-1 h-6 rounded-md px-2 font-medium text-brand-text">Jump</button>
                    {onMarkRead && (
                        <button type="button" onClick={onMarkRead} {...ix("button")} data-touch-target="" className="h-6 rounded-md px-2 font-medium text-ink-2">Mark as read</button>
                    )}
                </div>
            </div>
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
 * Above the messages a shared history copied into this conversation
 * (lib/conversation/sharedHistory): the day pill's shape, the hairline in the
 * brand, so the copies read as what they are without a box around each one.
 */
function SharedHistoryHeading() {
    return (
        <div data-shared-history="" role="separator" aria-label="Shared from the earlier conversation" className="relative flex w-full justify-center pb-1.5 pt-2.5">
            <div aria-hidden="true" className="absolute inset-x-5 top-[calc(50%+2px)] h-px bg-brand/30" />
            <span className="relative flex h-6 items-center rounded-xl bg-sheet px-2.5 text-meta font-medium text-brand-text shadow-e1">
                Shared from the earlier conversation
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
                            {...ix("item")}
                            className="flex h-[30px] w-full items-center rounded-md px-2 text-left text-ui-sm text-ink"
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
