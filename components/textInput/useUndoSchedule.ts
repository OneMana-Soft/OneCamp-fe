"use client"

import { useCallback } from "react"
import { useScheduledMessages } from "@/hooks/useScheduledMessages"

/**
 * The scheduled chip's Undo (design v3 chat, C44): takes back the message just
 * scheduled for `at` here, the last pending one due within a minute of it.
 */
export function useUndoSchedule(target: string | undefined): (at: Date) => void {
    const { items, cancel } = useScheduledMessages(target)
    return useCallback(
        (at: Date) => {
            const near = items.filter((m) => m.status === "pending" && Math.abs(new Date(m.send_at).getTime() - at.getTime()) < 60_000)
            const last = near[near.length - 1]
            if (last) void cancel(last.id)
        },
        [items, cancel],
    )
}
