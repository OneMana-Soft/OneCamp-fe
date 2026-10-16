"use client"

import { createContext, useContext, useEffect, useRef, useState } from "react"
import { AlertCircle, AlertTriangle, RotateCcw } from "@/lib/icons"
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

/** After this long still on its way, the clock shows where the time goes. */
export const SENDING_CLOCK_MS = 600
/** After this long, the word "Sending…" joins it (Campsite waits 2 s too). */
export const SENDING_WORD_MS = 2000

/**
 * A 12px clock whose hand turns once every 1.2 s while the message is on its
 * way: status motion, so it is allowed, and it stands still for reduced
 * motion. Drawn here rather than from Lucide so only the hand turns.
 */
export function PendingClock({ className }: { className?: string }) {
    return (
        <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true" className={cn("shrink-0 text-ink-4", className)}>
            <circle cx="6" cy="6" r="5" fill="none" stroke="currentColor" strokeWidth="1.25" />
            <g className="motion-safe:animate-clock-hand" style={{ transformOrigin: "6px 6px" }}>
                <line x1="6" y1="6" x2="6" y2="3.2" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
            </g>
        </svg>
    )
}

/** Becomes true once `ms` has passed since it mounted. */
function useAfter(ms: number): boolean {
    const [passed, setPassed] = useState(false)
    useEffect(() => {
        const t = window.setTimeout(() => setPassed(true), ms)
        return () => window.clearTimeout(t)
    }, [ms])
    return passed
}

/**
 * Sending (design v3 chat, C30), where the message's time goes: nothing for
 * the first 600 ms (a quick send never flickers), then the 12px clock, and
 * after 2 s the word "Sending…" beside it. The message itself stays at full
 * strength: dimming it read as an error. When the server has it, the time
 * fades in where the clock was. compact is the gutter of a continued row,
 * which has room for the clock alone.
 */
export function SendingNote({ className, compact = false }: { className?: string; compact?: boolean }) {
    const showClock = useAfter(SENDING_CLOCK_MS)
    const showWord = useAfter(SENDING_WORD_MS)
    return (
        <span role="status" data-sending-note="" className={cn("inline-flex items-center gap-1.5 whitespace-nowrap text-meta text-ink-3", className)}>
            {showClock && <PendingClock className="animate-fade-in" />}
            {showWord && !compact ? <span className="animate-fade-in">Sending…</span> : <span className="sr-only">Sending…</span>}
        </span>
    )
}

/**
 * The alert where a failed message's time was (C31): danger, and one small
 * three-step nudge when it fails (Campfire's wiggle, made smaller), which
 * reduced motion leaves out.
 */
export function FailedMark({ className }: { className?: string }) {
    return (
        <span data-failed-mark="" className={cn("inline-flex text-danger-ink motion-safe:animate-nudge", className)}>
            <AlertCircle className="size-3.5" aria-hidden="true" />
            <span className="sr-only">Not sent</span>
        </span>
    )
}

function useOnline(): boolean {
    const [online, setOnline] = useState(() => (typeof navigator === "undefined" ? true : navigator.onLine !== false))
    useEffect(() => {
        const on = () => setOnline(true)
        const off = () => setOnline(false)
        window.addEventListener("online", on)
        window.addEventListener("offline", off)
        return () => {
            window.removeEventListener("online", on)
            window.removeEventListener("offline", off)
        }
    }, [])
    return online
}

const STRIP_BUTTON =
    "inline-flex h-6 items-center gap-1 rounded-sm px-2 text-xs font-medium transition-colors hover:bg-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"

/**
 * Under a message that was not sent (C31): "Didn't send." and what to do
 * about it, Try again first. The row keeps its full strength and carries a
 * 2px danger bar on its edge (BaseMessageCard). Offline, nothing is anyone's
 * fault yet: it says it is waiting, offers nothing to press, and sends by
 * itself when the connection is back.
 */
export function SendStatus({ state, localId, className }: { state?: SendState; localId?: string; className?: string }) {
    const actions = useContext(PendingSendContext)
    const online = useOnline()
    const failed = state === "failed"
    // Back online: what waited for the connection goes, once.
    const sawOffline = useRef(false)
    useEffect(() => {
        if (!online) {
            sawOffline.current = true
            return
        }
        if (sawOffline.current && failed && localId && actions) {
            sawOffline.current = false
            actions.retry(localId)
        }
    }, [online, failed, localId, actions])

    if (!failed || !localId) return null
    if (!online) {
        return (
            <div role="status" data-failed="" className={cn("mt-1 flex h-6 items-center gap-1.5 text-xs text-ink-2", className)}>
                <AlertTriangle className="size-3.5 shrink-0 text-camp-sun" aria-hidden="true" />
                Waiting for connection. It sends when you&apos;re back.
            </div>
        )
    }
    return (
        <div role="alert" data-failed="" className={cn("mt-1 flex h-6 flex-wrap items-center gap-x-1 text-xs", className)}>
            <span className="mr-1 font-medium text-danger-ink">Didn&apos;t send.</span>
            {actions && (
                <>
                    <button type="button" data-touch-target="" onClick={() => actions.retry(localId)} className={cn(STRIP_BUTTON, "text-ink")}>
                        <RotateCcw className="size-3" aria-hidden="true" />
                        Try again
                    </button>
                    <button type="button" data-touch-target="" onClick={() => actions.edit(localId)} className={cn(STRIP_BUTTON, "text-ink-2 hover:text-ink")}>
                        Edit
                    </button>
                    <button type="button" data-touch-target="" onClick={() => actions.discard(localId)} className={cn(STRIP_BUTTON, "text-ink-2 hover:text-ink")}>
                        Delete
                    </button>
                </>
            )}
        </div>
    )
}
