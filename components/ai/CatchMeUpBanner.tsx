"use client"

import React, { useCallback, useEffect, useState } from "react"
import { cn } from "@/lib/utils/helpers/cn"
import StreamingText from "./StreamingText"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Sparkles, X } from "@/lib/icons"
import {
    useSummarizeChannel,
    useSummarizeDM,
    useSummarizeGroup,
} from "@/services/aiService"

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

    const channelSummarizer = useSummarizeChannel()
    const dmSummarizer = useSummarizeDM()
    const groupSummarizer = useSummarizeGroup()

    const { summarize, isSubmitting } =
        type === "dm"
            ? dmSummarizer
            : type === "group"
              ? groupSummarizer
              : channelSummarizer

    useEffect(() => {
        const dismissKey = `catchmeup_dismissed_${channelUUID}`
        const dismissed = localStorage.getItem(dismissKey)
        if (dismissed) {
            const dismissedTime = new Date(dismissed).getTime()
            const oneHourAgo = Date.now() - 60 * 60 * 1000
            if (dismissedTime > oneHourAgo) {
                setState("dismissed")
            } else {
                localStorage.removeItem(dismissKey)
            }
        }
    }, [channelUUID])

    const handleCatchMeUp = useCallback(async () => {
        setState("loading")
        setError(null)

        try {
            const result = await summarize(channelUUID, 50)
            if (result?.summary) {
                setSummary(result.summary)
                setState("summary")
            } else {
                setError("No summary available")
                setState("idle")
            }
        } catch (err: any) {
            setError(err.message || "Failed to generate summary")
            setState("idle")
        }
    }, [channelUUID, summarize])

    const handleDismiss = useCallback(() => {
        setState("dismissed")
        const dismissKey = `catchmeup_dismissed_${channelUUID}`
        localStorage.setItem(dismissKey, new Date().toISOString())
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
