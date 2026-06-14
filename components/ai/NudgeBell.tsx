"use client"

// NudgeBell — the in-app surface for AI Proactive Nudges.
//
// A bell button in the top nav with an unread badge; clicking opens a popover
// listing the user's open nudges. State is transport-agnostic: it hydrates once
// from REST and then updates live from MQTT (handled in useMqttMessageHandler),
// so the bell reflects new nudges in real time without polling.

import React, { useEffect, useState } from "react"
import { useDispatch, useSelector } from "react-redux"
import { useRouter } from "next/navigation"
import { RootState } from "@/store/store"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import {
    Bell, Sparkles, Check, Clock, GitPullRequest, HelpCircle, CalendarClock,
} from "@/lib/icons"
import { cn } from "@/lib/utils/helpers/cn"
import { formatTimeForReplyCount } from "@/lib/utils/date/formatTimeForReplyCount"
import {
    getNudges, dismissNudge, dismissAllNudges, type Nudge, type NudgeKind,
} from "@/services/nudgeService"
import { setNudges, removeNudge, clearAllNudges } from "@/store/slice/nudgeSlice"

const KIND_ICON: Record<NudgeKind, React.ComponentType<{ className?: string }>> = {
    overdue_commitment: CalendarClock,
    stale_question: HelpCircle,
    blocked_task: Clock,
    unreviewed_pr: GitPullRequest,
    idle_decision: Sparkles,
    generic: Sparkles,
}

export default function NudgeBell() {
    const dispatch = useDispatch()
    const router = useRouter()
    const [open, setOpen] = useState(false)
    const [busyId, setBusyId] = useState<string | null>(null)

    const nudges = useSelector((s: RootState) => s.nudge.nudges)
    const openCount = useSelector((s: RootState) => s.nudge.openCount)
    const hydrated = useSelector((s: RootState) => s.nudge.hydrated)

    // Hydrate once on mount. Live updates thereafter come via MQTT.
    useEffect(() => {
        let cancelled = false
        getNudges()
            .then((res) => {
                if (!cancelled) dispatch(setNudges({ nudges: res.nudges, openCount: res.open_count }))
            })
            .catch(() => {
                /* non-fatal: the bell just shows nothing until next event */
            })
        return () => { cancelled = true }
    }, [dispatch])

    // Re-hydrate when the user opens the panel, so the list is authoritative
    // at the moment of viewing — covers cross-tab dismissals and engine
    // supersedes that only sent a badge-count event (not per-item removals).
    useEffect(() => {
        if (!open) return
        let cancelled = false
        getNudges()
            .then((res) => {
                if (!cancelled) dispatch(setNudges({ nudges: res.nudges, openCount: res.open_count }))
            })
            .catch(() => { /* keep current state on error */ })
        return () => { cancelled = true }
    }, [open, dispatch])

    // Clicking a nudge OPENS it — navigate to the deep-linked item. It does
    // NOT mark the nudge "acted": viewing a reminder must never be mistaken
    // for handling the underlying thing. The nudge stays in the bell until the
    // user either resolves the underlying item (engine/loop clears it) or
    // explicitly dismisses it here. This is the correct notification model and
    // fixes the "empty bell but still-overdue commitment" confusion.
    const handleOpen = (n: Nudge) => {
        setOpen(false)
        if (n.cta_url) router.push(n.cta_url)
    }

    const handleDismiss = async (e: React.MouseEvent, n: Nudge) => {
        e.stopPropagation()
        setBusyId(n.id)
        dispatch(removeNudge(n.id))
        try {
            await dismissNudge(n.id)
        } catch { /* swallow — optimistic */ }
        finally { setBusyId(null) }
    }

    const handleDismissAll = async () => {
        dispatch(clearAllNudges())
        try {
            await dismissAllNudges()
        } catch { /* swallow — optimistic */ }
    }

    const hasNudges = nudges.length > 0

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <Tooltip delayDuration={0}>
                <TooltipTrigger asChild>
                    <PopoverTrigger asChild>
                        <button
                            aria-label="Nudges"
                            className={cn(
                                "relative h-9 w-9 flex items-center justify-center rounded-md transition-all duration-100",
                                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                                open
                                    ? "bg-primary/15 text-primary"
                                    : "text-muted-foreground hover:text-foreground hover:bg-accent",
                            )}
                        >
                            <Bell className="h-[18px] w-[18px]" />
                            {openCount > 0 && (
                                <span
                                    className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-semibold leading-4 text-center"
                                    aria-hidden="true"
                                >
                                    {openCount > 9 ? "9+" : openCount}
                                </span>
                            )}
                        </button>
                    </PopoverTrigger>
                </TooltipTrigger>
                <TooltipContent side="bottom">Nudges</TooltipContent>
            </Tooltip>

            <PopoverContent align="end" className="w-[360px] p-0 overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 border-b border-border/60">
                    <div className="flex items-center gap-2">
                        <Sparkles className="h-4 w-4 text-primary" />
                        <span className="text-sm font-semibold">Nudges</span>
                    </div>
                    {hasNudges && (
                        <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 gap-1.5 text-xs text-muted-foreground hover:text-foreground"
                            onClick={handleDismissAll}
                        >
                            <Check className="h-3.5 w-3.5" /> Clear all
                        </Button>
                    )}
                </div>

                {!hasNudges ? (
                    <div className="flex flex-col items-center justify-center gap-2 py-10 px-6 text-center">
                        <div className="bg-primary/10 p-2.5 rounded-full">
                            <Bell className="h-5 w-5 text-primary" />
                        </div>
                        <p className="text-sm font-medium">You&apos;re all caught up</p>
                        <p className="text-xs text-muted-foreground">
                            {hydrated
                                ? "OneCamp will nudge you here when something needs your attention."
                                : "Loading…"}
                        </p>
                    </div>
                ) : (
                    <ScrollArea className="max-h-[420px]">
                        <div className="divide-y divide-border/40">
                            {nudges.map((n) => {
                                const Icon = KIND_ICON[n.kind] ?? Sparkles
                                return (
                                    <div
                                        key={n.id}
                                        className={cn(
                                            "group flex gap-3 px-4 py-3 transition-colors cursor-pointer hover:bg-accent/40",
                                            busyId === n.id && "opacity-50 pointer-events-none",
                                        )}
                                        onClick={() => handleOpen(n)}
                                    >
                                        <div className={cn(
                                            "shrink-0 h-8 w-8 rounded-md flex items-center justify-center",
                                            n.priority > 0 ? "bg-amber-500/15 text-amber-600 dark:text-amber-400" : "bg-primary/10 text-primary",
                                        )}>
                                            <Icon className="h-4 w-4" />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-start justify-between gap-2">
                                                <p className="text-sm font-medium leading-snug">{n.title}</p>
                                                <button
                                                    aria-label="Dismiss"
                                                    onClick={(e) => handleDismiss(e, n)}
                                                    className="shrink-0 text-[11px] text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-foreground transition-opacity"
                                                >
                                                    Dismiss
                                                </button>
                                            </div>
                                            {n.body && (
                                                <p className="text-xs text-muted-foreground mt-0.5 leading-snug line-clamp-3">{n.body}</p>
                                            )}
                                            <div className="flex items-center gap-2 mt-1.5">
                                                <span className="text-[10px] text-muted-foreground tabular-nums">
                                                    {formatTimeForReplyCount(n.created_at)}
                                                </span>
                                                {n.cta_text && (
                                                    <span className="text-[11px] font-medium text-primary">{n.cta_text} →</span>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    </ScrollArea>
                )}
            </PopoverContent>
        </Popover>
    )
}
