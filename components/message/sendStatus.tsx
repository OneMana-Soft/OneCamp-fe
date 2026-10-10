"use client"

import { createContext, useContext } from "react"
import { AlertCircle, Clock } from "@/lib/icons"
import { cn } from "@/lib/utils/helpers/cn"
import type { SendState } from "@/lib/chat/pendingSend"

/** What the conversation can do with a message it could not send. */
export interface PendingSendActions {
    /** Send it again. */
    retry: (localId: string) => void
    /** Put it back in the message box, to change it before sending. */
    edit: (localId: string) => void
    /** Drop it. */
    discard: (localId: string) => void
}

/** Provided by each conversation view (channel, DM, group). */
export const PendingSendContext = createContext<PendingSendActions | null>(null)

/**
 * "Sending…", where the message's time is: beside the time on a turn's first
 * message, and in the gutter where a continued message shows its time
 * (ContinuedGutter). It fades in after 600 ms, so a quick send never flashes
 * it, and takes no room of its own, so nothing moves when it goes.
 *
 * It sat over the row's bottom-right corner, a screen's width from a short
 * message (1,100px away at 1440), where nobody reads for it, while "Not sent."
 * appeared under the message.
 */
export function SendingNote({ className, compact = false }: { className?: string; compact?: boolean }) {
    return (
        <span
            role="status"
            data-sending-note=""
            title={compact ? "Sending…" : undefined}
            className={cn(
                "whitespace-nowrap text-2xs text-muted-foreground opacity-0 motion-safe:animate-[msg-fade-in_160ms_var(--ease-standard)_600ms_forwards] motion-reduce:opacity-100",
                className,
            )}
        >
            {/* The gutter is 36px; the words are about 58px and ran off the
                panel's edge. There a clock says it, as a pending message
                does in most chat apps, and the words stay for a reader. */}
            {compact ? (
                <>
                    <Clock className="h-3 w-3" strokeWidth={1.75} aria-hidden="true" />
                    <span className="sr-only">Sending…</span>
                </>
            ) : (
                "Sending…"
            )}
        </span>
    )
}

/**
 * Under a message sent from here that the server has not confirmed, when it
 * was not sent: what to do about it. While it is still on its way the row
 * says so by its time (SendingNote). The message itself is already in the
 * conversation, where it was written.
 */
export function SendStatus({ state, localId, className }: { state?: SendState; localId?: string; className?: string }) {
    const actions = useContext(PendingSendContext)
    if (!state || !localId) return null
    // Still on its way: said by the time, not here (SendingNote). A line of its
    // own grew the conversation by 18px and shrank it back when the message
    // was confirmed, a jump on every send.
    if (state === "sending") return null
    return (
        <div role="alert" className={cn("mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-danger-ink", className)}>
            <AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span className="font-medium">Not sent.</span>
            {actions && (
                <>
                    <button type="button" onClick={() => actions.retry(localId)} className="rounded-sm font-medium underline underline-offset-2 hover:no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70">
                        Try again
                    </button>
                    <button type="button" onClick={() => actions.edit(localId)} className="rounded-sm text-muted-foreground underline-offset-2 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70">
                        Edit
                    </button>
                    <button type="button" onClick={() => actions.discard(localId)} className="rounded-sm text-muted-foreground underline-offset-2 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70">
                        Delete
                    </button>
                </>
            )}
        </div>
    )
}
