"use client"

// InboxNudges: OneCamp AI's proactive nudges, as the pinned "From OneCamp AI"
// group at the top of Inbox's Priority tab (design v3, shell N1). The bell
// that held them in the top bar is retired; their count joins Inbox's badge
// (hooks/useNudgeCount). State hydrates from REST and then follows MQTT
// (useMqttMessageHandler), so the group is live without polling.

import React, { useEffect, useState } from "react"
import { useDispatch, useSelector } from "react-redux"
import { useRouter } from "next/navigation"
import { RootState } from "@/store/store"
import { Skeleton } from "@/components/ui/skeleton"
import { ToastAction } from "@/components/ui/toast"
import { AgentAvatar } from "@/components/ui/graphics"
import { useToast } from "@/hooks/use-toast"
import { cn } from "@/lib/utils/helpers/cn"
import { formatTimeForReplyCount } from "@/lib/utils/date/formatTimeForReplyCount"
import { getNudges, dismissNudge, dismissAllNudges, type Nudge } from "@/services/nudgeService"
import { setNudges, removeNudge, clearAllNudges } from "@/store/slice/nudgeSlice"
import { withAI } from "@/components/common/withFeature"

/** How long "Clear all" waits for an Undo before it reaches the server. */
const UNDO_MS = 5000

function InboxNudges() {
    const dispatch = useDispatch()
    const router = useRouter()
    const [busyId, setBusyId] = useState<string | null>(null)
    const { toast } = useToast()

    const nudges = useSelector((s: RootState) => s.nudge.nudges)
    const openCount = useSelector((s: RootState) => s.nudge.openCount)
    const hydrated = useSelector((s: RootState) => s.nudge.hydrated)

    // Fresh on arrival, so what the person sees is current (covers dismissals
    // in another tab, and supersedes that only sent a count).
    useEffect(() => {
        let cancelled = false
        getNudges({ fresh: true })
            .then((res) => {
                if (!cancelled) dispatch(setNudges({ nudges: res.nudges, openCount: res.open_count }))
            })
            .catch(() => { /* keep the current state */ })
        return () => { cancelled = true }
    }, [dispatch])

    // Opening a nudge goes to what it is about. It does NOT mark it handled:
    // viewing a reminder is not handling the thing. It stays until the thing
    // is resolved (the engine clears it) or the person dismisses it.
    const handleOpen = (n: Nudge) => {
        if (n.cta_url) router.push(n.cta_url)
    }

    const handleDismiss = async (e: React.MouseEvent, n: Nudge) => {
        e.stopPropagation()
        setBusyId(n.id)
        dispatch(removeNudge(n.id))
        try {
            await dismissNudge(n.id)
        } catch { /* optimistic */ }
        finally { setBusyId(null) }
    }

    // Clearing every nudge can't be taken back on the server, so it waits a
    // few seconds behind an Undo: the group empties at once, and the request
    // goes only if nobody asks for them back.
    const handleDismissAll = () => {
        const kept = { nudges, openCount }
        dispatch(clearAllNudges())
        let undone = false
        const send = setTimeout(() => {
            if (undone) return
            dismissAllNudges().catch(() => dispatch(setNudges(kept)))
        }, UNDO_MS)
        toast({
            title: "Nudges cleared",
            action: (
                <ToastAction
                    altText="Bring the nudges back"
                    onClick={() => {
                        undone = true
                        clearTimeout(send)
                        dispatch(setNudges(kept))
                    }}
                >
                    Undo
                </ToastAction>
            ),
        })
    }

    // Nothing to say until there are nudges: no group, no empty promise.
    if (hydrated && nudges.length === 0) return null

    return (
        <section aria-label="From OneCamp AI" data-inbox-nudges="" className="border-b border-line">
            <div className="flex h-9 items-center gap-2 bg-sunken px-5">
                <span className="text-xs font-medium text-ink-2">From OneCamp AI</span>
                {nudges.length > 0 && <span className="text-xs text-ink-3">{nudges.length}</span>}
                {nudges.length > 0 && (
                    <button
                        type="button"
                        onClick={handleDismissAll}
                        className="ml-auto h-6 rounded-[6px] px-2 text-2xs font-medium text-ink-3 transition-colors duration-[140ms] hover:bg-hover hover:text-ink hover:duration-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                    >
                        Clear all
                    </button>
                )}
            </div>
            {!hydrated ? (
                <div className="space-y-3 px-5 py-3" role="status" aria-label="Loading nudges">
                    {[0, 1].map((i) => (
                        <div key={i} className="flex gap-3">
                            <Skeleton className="size-6 shrink-0 rounded-[32%]" />
                            <div className="flex-1 space-y-1.5">
                                <Skeleton className="h-4 w-3/4" />
                                <Skeleton className="h-3 w-1/2" />
                            </div>
                        </div>
                    ))}
                </div>
            ) : (
                <ul>
                    {nudges.map((n) => (
                        // A row, reachable from the keyboard as well as the mouse. Not a
                        // <button>, since Dismiss sits inside it.
                        <li
                            key={n.id}
                            role="button"
                            tabIndex={0}
                            data-urgent={n.priority > 0 ? "true" : undefined}
                            className={cn(
                                "group flex cursor-pointer gap-3 px-5 py-3 transition-colors duration-[140ms] hover:bg-hover hover:duration-0 focus-visible:bg-hover focus-visible:outline-none",
                                busyId === n.id && "pointer-events-none opacity-50",
                            )}
                            onClick={() => handleOpen(n)}
                            onKeyDown={(e) => {
                                if (e.target !== e.currentTarget) return
                                if (e.key === "Enter" || e.key === " ") {
                                    e.preventDefault()
                                    handleOpen(n)
                                }
                            }}
                        >
                            <span className="size-6 shrink-0" aria-hidden="true"><AgentAvatar /></span>
                            <div className="min-w-0 flex-1">
                                <div className="flex items-start justify-between gap-2">
                                    <p className="text-sm font-medium leading-snug text-ink">{n.title}</p>
                                    <button
                                        aria-label="Dismiss"
                                        onClick={(e) => handleDismiss(e, n)}
                                        className="pointer-events-none shrink-0 rounded-sm text-2xs text-ink-3 opacity-0 transition-opacity hover:text-ink focus-visible:pointer-events-auto focus-visible:opacity-100 group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100 [@media(hover:none)]:pointer-events-auto [@media(hover:none)]:opacity-100"
                                    >
                                        Dismiss
                                    </button>
                                </div>
                                {n.body && <p className="mt-0.5 line-clamp-3 text-xs leading-snug text-ink-2">{n.body}</p>}
                                <div className="mt-1.5 flex items-center gap-2">
                                    <span className="text-2xs tabular-nums text-ink-3">{formatTimeForReplyCount(n.created_at)}</span>
                                    {n.priority > 0 && <span className="text-2xs font-medium text-warning-ink">Needs you</span>}
                                    {n.cta_text && <span className="text-2xs font-medium text-brand-text">{n.cta_text} →</span>}
                                </div>
                            </div>
                        </li>
                    ))}
                </ul>
            )}
        </section>
    )
}

// Gated on the AI subsystem: absent on the AI-free edition and wherever an
// admin has switched AI off. Wrapping the export covers every place it renders.
export default withAI(InboxNudges)
