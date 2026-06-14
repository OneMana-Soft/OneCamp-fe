"use client"

import React, { useCallback, useEffect, useState } from "react"
import { cn } from "@/lib/utils/helpers/cn"
import StreamingText from "./StreamingText"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Sparkles, X } from "@/lib/icons"
import { useCatchUp } from "@/services/aiService"
import { CatchUpRequest } from "@/services/catchUpService"
import { isTTLActive, setTTL } from "@/lib/utils/helpers/ttlStorage"

const DISMISS_PREFIX = "catchmeup_dismissed_"
const DISMISS_TTL_MS = 60 * 60 * 1000 // 1 hour

interface CatchMeUpBannerProps {
    /** UUID of the channel, user, or group to summarize */
    channelUUID: string
    /** Number of unread messages */
    unreadCount: number
    /** Header name for display */
    channelName?: string
    /** Minimum unread count to show the banner (default: 10) */
    threshold?: number
    /** Whether this is a channel (true) or a DM/Group Chat (false) */
    isChannel?: boolean
    /** The conversation type used to pick the summarization strategy */
    type?: "channel" | "dm" | "group"
}

/**
 * CatchMeUpBanner — calm, neutral banner that appears at the top of
 * conversations with many unread messages. Click to get an AI-generated
 * summary. Uses semantic tokens, no gradients.
 */
const CatchMeUpBanner: React.FC<CatchMeUpBannerProps> = ({
    channelUUID,
    unreadCount,
    channelName,
    threshold = 10,
    isChannel = true,
    type = "channel",
}) => {
    const [state, setState] = useState<"idle" | "loading" | "summary" | "dismissed">("idle")
    const [summary, setSummary] = useState("")
    const [error, setError] = useState<string | null>(null)

    const { catchUp, isLoading } = useCatchUp()
    const isSubmitting = isLoading

    useEffect(() => {
        if (isTTLActive(DISMISS_PREFIX, channelUUID, DISMISS_TTL_MS)) {
            setState("dismissed")
        }
    }, [channelUUID])

    const handleCatchMeUp = useCallback(async () => {
        setState("loading")
        setError(null)

        // Map the conversation type to a precise catch-up scope. The recap
        // covers ONLY the unread window (since last seen), not the last N
        // messages — that's the UX leap over a blunt summary.
        const req: CatchUpRequest =
            type === "dm"
                ? { scope_type: "chat", to_user_uuid: channelUUID }
                : type === "group"
                  ? { scope_type: "chat", chat_grp_id: channelUUID }
                  : { scope_type: "channel", channel_uuid: channelUUID }

        try {
            const result = await catchUp(req)
            if (!result || !result.enabled) {
                // AI disabled — silently dismiss; no surface.
                setState("dismissed")
                return
            }
            if (!result.has_unread) {
                // Nothing actually missed — clear the banner calmly.
                setState("dismissed")
                setTTL(DISMISS_PREFIX, channelUUID, DISMISS_TTL_MS)
                return
            }
            setSummary(result.summary)
            setState("summary")
        } catch (err: unknown) {
            const e = err as { response?: { data?: { err?: string } }; message?: string }
            setError(e?.response?.data?.err || e?.message || "Failed to generate summary")
            setState("idle")
        }
    }, [channelUUID, catchUp, type])

    const handleDismiss = useCallback(() => {
        setState("dismissed")
        setTTL(DISMISS_PREFIX, channelUUID, DISMISS_TTL_MS)
    }, [channelUUID])

    if (unreadCount < threshold || state === "dismissed") {
        return null
    }

    const subjectLabel = channelName
        ? isChannel
            ? `#${channelName}`
            : channelName
        : isChannel
          ? "Channel"
          : "Conversation"

    return (
        <div
            className={cn(
                "mx-4 my-2 px-3.5 py-3 rounded-xl",
                "bg-muted/50 border border-border/60",
                "relative z-10 animate-in fade-in slide-in-from-top-2 duration-200",
            )}
            role="region"
            aria-label="AI summary"
        >
            {state === "idle" && (
                <div className="flex items-center gap-3 flex-wrap">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-violet-500/10 text-violet-600 dark:text-violet-400">
                        <Sparkles className="h-4 w-4" />
                    </div>
                    <div className="flex-1 text-sm text-muted-foreground min-w-0">
                        <span className="font-semibold text-foreground">
                            {unreadCount} unread messages
                        </span>
                        {channelName && (
                            <>
                                {" "}
                                in <span className="text-foreground/80">{subjectLabel}</span>
                            </>
                        )}
                    </div>
                    <Button
                        size="sm"
                        onClick={handleCatchMeUp}
                        disabled={isSubmitting}
                        className="shrink-0"
                    >
                        Catch me up
                    </Button>
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 shrink-0"
                        onClick={handleDismiss}
                        aria-label="Dismiss"
                    >
                        <X className="h-4 w-4" />
                    </Button>
                </div>
            )}

            {state === "loading" && (
                <div className="flex flex-col gap-2.5">
                    <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-violet-500/10 text-violet-600 dark:text-violet-400">
                            <Sparkles className="h-4 w-4 animate-pulse" />
                        </div>
                        <span className="flex-1 text-sm text-muted-foreground">
                            Reading {unreadCount} messages...
                        </span>
                    </div>
                    <div className="flex flex-col gap-2 pl-11">
                        <Skeleton className="h-3 w-[90%]" />
                        <Skeleton className="h-3 w-[75%]" />
                        <Skeleton className="h-3 w-[60%]" />
                    </div>
                </div>
            )}

            {state === "summary" && (
                <div className="flex flex-col gap-2.5">
                    <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-violet-500/10 text-violet-600 dark:text-violet-400">
                            <Sparkles className="h-4 w-4" />
                        </div>
                        <span className="flex-1 text-sm font-semibold text-foreground truncate">
                            AI summary — {subjectLabel}
                        </span>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 shrink-0"
                            onClick={handleDismiss}
                            aria-label="Dismiss"
                        >
                            <X className="h-4 w-4" />
                        </Button>
                    </div>
                    <StreamingText
                        text={summary}
                        isStreaming={false}
                        className="text-sm text-foreground/85 leading-relaxed pl-11"
                    />
                </div>
            )}

            {error && (
                <div className="flex items-center gap-2 text-sm text-destructive mt-2 pl-11">
                    <span>{error}</span>
                    <Button
                        variant="outline"
                        size="xs"
                        onClick={handleCatchMeUp}
                        className="border-destructive/30 text-destructive hover:bg-destructive/10"
                    >
                        Retry
                    </Button>
                </div>
            )}
        </div>
    )
}

export default CatchMeUpBanner
