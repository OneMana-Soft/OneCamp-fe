"use client"

import { useEffect, useState } from "react"
import { cn } from "@/lib/utils/helpers/cn"

// The body bars of each row: one to three lines at 72, 56 and 40% of the
// measure, so the page reads as conversation rather than as a table.
const BODIES: string[][] = [["w-[72%]"], ["w-[56%]", "w-[40%]"], ["w-[40%]"], ["w-[72%]", "w-[56%]"], ["w-[56%]"], ["w-[72%]", "w-[40%]"], ["w-[40%]"], ["w-[56%]"]]

/** How long a load may take before it is shown as loading at all. */
const SHOW_AFTER_MS = 150

/**
 * A conversation loading (design v3 chat, C34), on the message row's own grid
 * (baseMessageCard): a 36px avatar column 12px from the words, 20px in and
 * 24px from the right, a 20px name line and 23px body lines, so nothing
 * moves when the messages land. Eight rows: a 36px disc on the press ground,
 * a 96 by 10 name bar, and the body bars. They breathe, each row 120 ms
 * after the one above, so the wave reads downward; still with reduced
 * motion. A load faster than 150 ms never shows it at all.
 */
export const ChatLoadingSkeleton = () => {
    const [shown, setShown] = useState(false)
    useEffect(() => {
        const t = window.setTimeout(() => setShown(true), SHOW_AFTER_MS)
        return () => window.clearTimeout(t)
    }, [])
    return (
        // At the foot of the list, where the messages land: a conversation
        // sits at its end (MessageListVirtua), and a skeleton at the top swapped
        // for messages at the bottom was a jump the length of the screen. On a
        // phone it keeps clear of the floating composer, as the list does.
        <div data-message-skeleton="" data-shown={shown || undefined} role="status" aria-label="Loading messages" className={cn("flex h-full w-full flex-col justify-end overflow-hidden pb-[150px] md:pb-4", !shown && "invisible")}>
            {BODIES.map((lines, i) => (
                <div
                    key={i}
                    aria-hidden="true"
                    data-skeleton-row=""
                    className="grid grid-cols-[36px_minmax(0,1fr)] gap-x-3 py-1.5 pl-5 pr-6 motion-safe:animate-shimmer"
                    style={{ animationDelay: `${i * 120}ms` }}
                >
                    <span className="size-9 rounded-full bg-press" />
                    <span className="min-w-0">
                        <span className="flex h-5 items-center">
                            <span className="h-2.5 w-24 rounded-[5px] bg-press" />
                        </span>
                        {lines.map((w, j) => (
                            <span key={j} className="flex h-[23px] items-center">
                                <span className={cn("h-2.5 rounded-[5px] bg-press", w)} />
                            </span>
                        ))}
                    </span>
                </div>
            ))}
        </div>
    )
}
