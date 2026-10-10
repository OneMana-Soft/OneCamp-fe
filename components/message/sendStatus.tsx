"use client"

import { createContext, useContext } from "react"
import { AlertCircle } from "@/lib/icons"
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
 * Under a message sent from here that the server has not confirmed: nothing
 * at first, then "Sending…" if it takes a moment (the line fades in after
 * 600 ms, so a quick send never flashes it), or what to do when it was not
 * sent. The message itself is already in the conversation, where it was
 * written.
 */
export function SendStatus({ state, localId, className }: { state?: SendState; localId?: string; className?: string }) {
    const actions = useContext(PendingSendContext)
    if (!state || !localId) return null
    if (state === "sending") {
        return (
            <p
                role="status"
                className={cn(
                    "mt-0.5 text-2xs text-muted-foreground opacity-0 motion-safe:animate-[msg-fade-in_160ms_var(--ease-standard)_600ms_forwards] motion-reduce:opacity-100",
                    className,
                )}
            >
                Sending…
            </p>
        )
    }
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
