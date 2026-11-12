"use client"

import { useMemo } from "react"
import { useScheduledMessages } from "@/hooks/useScheduledMessages"

/** What the scheduled chip (design v3 chat, C44) asks of its conversation's queue. */
export interface ChipSchedule {
    /** Takes back the message just scheduled for `at` (the chip's Undo). */
    undo: (at: Date) => void
    /** Its message is still queued; the chip leaves once it isn't (deleted, sent now or sent: V-711 F2). */
    queued: (at: Date) => boolean
}

/** The chip's message here: the last pending one due within a minute of `at`. */
export function useUndoSchedule(target: string | undefined): ChipSchedule {
    const { items, cancel } = useScheduledMessages(target)
    return useMemo(() => {
        const mine = (at: Date) => {
            const near = items.filter((m) => m.status === "pending" && Math.abs(new Date(m.send_at).getTime() - at.getTime()) < 60_000)
            return near[near.length - 1]
        }
        return {
            undo: (at) => {
                const last = mine(at)
                if (last) void cancel(last.id)
            },
            queued: (at) => !!mine(at),
        }
    }, [items, cancel])
}
