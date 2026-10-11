"use client"

import { useEffect, useState } from "react"
import { cn } from "@/lib/utils/helpers/cn"

/**
 * A number that rolls when it changes (design v3 chat, count-roll): the old
 * value leaves upward and fades while the new one rises from below, 160ms.
 * The first value never moves, so a list drawn from history stands still;
 * only a change made while it is on screen rolls. Tabular figures, so the
 * width holds; reduced motion swaps the digits in place.
 */
export function RollingCount({ value, className }: { value: number | string; className?: string }) {
    const [shown, setShown] = useState(value)
    const [leaving, setLeaving] = useState<number | string | null>(null)
    const [changes, setChanges] = useState(0)
    useEffect(() => {
        if (value === shown) return
        setChanges((n) => n + 1)
        setLeaving(shown)
        setShown(value)
        const t = window.setTimeout(() => setLeaving(null), 180)
        return () => window.clearTimeout(t)
        // shown is what was on screen; only a new value starts a roll.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [value])
    return (
        <span data-rolling-count="" className={cn("relative inline-grid overflow-hidden tabular-nums", className)}>
            {leaving !== null && (
                <span aria-hidden="true" className="col-start-1 row-start-1 animate-count-out motion-reduce:hidden">
                    {leaving}
                </span>
            )}
            <span key={changes} className={cn("col-start-1 row-start-1", changes > 0 && "animate-count-in")}>
                {shown}
            </span>
        </span>
    )
}
