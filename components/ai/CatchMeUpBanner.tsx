"use client";

import React, { useState, useCallback, useEffect } from "react";
import { cn } from "@/lib/utils/helpers/cn";
import StreamingText from "./StreamingText";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useSummarizeChannel, useSummarizeDM, useSummarizeGroup } from "@/services/aiService";

interface CatchMeUpBannerProps {
    /** UUID of the channel, user, or group to summarize */
    channelUUID: string;
    /** Number of unread messages */
    unreadCount: number;
    /** Header name for display */
    channelName?: string;
    /** Minimum unread count to show the banner (default: 20) */
    threshold?: number;
    /** Whether this is a channel (true) or a DM/Group Chat (false) - deprecated in favor of type */
    isChannel?: boolean;
    /** The type of conversation for selecting the correct summarization strategy */
    type?: 'channel' | 'dm' | 'group';
}

/**
 * CatchMeUpBanner — A glassmorphic floating banner that appears at the top of
 * conversations with many unread messages. Click to get an AI-generated summary.
 */
const CatchMeUpBanner: React.FC<CatchMeUpBannerProps> = ({
    channelUUID,
    unreadCount,
    channelName,
    threshold = 10,
    isChannel = true,
    type = 'channel',
}) => {
    const [state, setState] = useState<"idle" | "loading" | "summary" | "dismissed">("idle");
    const [summary, setSummary] = useState("");
    const [error, setError] = useState<string | null>(null);

    // Select the appropriate summarization hook based on type
    const channelSummarizer = useSummarizeChannel();
    const dmSummarizer = useSummarizeDM();
    const groupSummarizer = useSummarizeGroup();

    const { summarize, isSubmitting } = 
        type === 'dm' ? dmSummarizer : 
        type === 'group' ? groupSummarizer : 
        channelSummarizer;

    // Check localStorage for dismissal
    useEffect(() => {
        const dismissKey = `catchmeup_dismissed_${channelUUID}`;
        const dismissed = localStorage.getItem(dismissKey);
        if (dismissed) {
            const dismissedTime = new Date(dismissed).getTime();
            const oneHourAgo = Date.now() - 60 * 60 * 1000;
            if (dismissedTime > oneHourAgo) {
                setState("dismissed");
            } else {
                localStorage.removeItem(dismissKey);
            }
        }
    }, [channelUUID]);

    const handleCatchMeUp = useCallback(async () => {
        setState("loading");
        setError(null);

        try {
            const result = await summarize(channelUUID, 50);
            if (result?.summary) {
                setSummary(result.summary);
                setState("summary");
            } else {
                setError("No summary available");
                setState("idle");
            }
        } catch (err: any) {
            setError(err.message || "Failed to generate summary");
            setState("idle");
        }
    }, [channelUUID, summarize]);

    const handleDismiss = useCallback(() => {
        setState("dismissed");
        const dismissKey = `catchmeup_dismissed_${channelUUID}`;
        localStorage.setItem(dismissKey, new Date().toISOString());
    }, [channelUUID]);

    // Don't render if below threshold or dismissed
    if (unreadCount < threshold || state === "dismissed") {
        return null;
    }

    return (
        <div className="mx-4 my-2 p-3 px-4 rounded-xl bg-muted/50 backdrop-blur-2xl border border-border shadow-md relative z-10 animate-in fade-in slide-in-from-top-2 duration-300">
            {state === "idle" && (
                <div className="flex items-center gap-2.5 flex-wrap">
                    <div className="text-[18px] shrink-0">✨</div>
                    <div className="flex-1 text-[13px] text-muted-foreground">
                        <span className="font-semibold text-foreground">{unreadCount} unread messages</span>
                        {channelName && (
                            <span className="text-primary">
                                {" "}
                                in {isChannel ? `#${channelName}` : channelName}
                            </span>
                        )}
                    </div>
                    <Button
                        className="px-4 py-1.5 bg-gradient-to-br from-primary to-primary/80 text-white font-semibold transition-all duration-200 whitespace-nowrap hover:from-primary/90 hover:to-primary/70 hover:shadow-primary/30 hover:-translate-y-0.5"
                        onClick={handleCatchMeUp}
                        disabled={isSubmitting}
                    >
                        Catch Me Up
                    </Button>
                    <Button 
                        variant="ghost"
                        className="text-muted-foreground hover:text-foreground shrink-0 size-8 p-0" 
                        onClick={handleDismiss} 
                        title="Dismiss"
                    >
                        ✕
                    </Button>
                </div>
            )}

            {state === "loading" && (
                <div className="flex items-center gap-2.5 flex-wrap">
                    <div className="text-[18px] shrink-0 animate-spin">🧠</div>
                    <div className="flex-1 text-[13px] text-muted-foreground">
                        <span>AI is reading {unreadCount} messages...</span>
                    </div>
                    <div className="w-full flex flex-col gap-2 mt-2">
                        <Skeleton className="h-3 w-[90%] bg-primary/10 animate-text-shimmer" />
                        <Skeleton className="h-3 w-[75%] bg-primary/10 animate-text-shimmer" />
                        <Skeleton className="h-3 w-[60%] bg-primary/10 animate-text-shimmer" />
                    </div>
                </div>
            )}

            {state === "summary" && (
                <div className="flex flex-col gap-2.5">
                    <div className="flex items-center gap-2">
                        <div className="text-[18px] shrink-0">✨</div>
                        <span className="flex-1 text-[13px] font-semibold text-primary">
                            AI Summary —{" "}
                            {channelName
                                ? isChannel
                                    ? `#${channelName}`
                                    : channelName
                                : isChannel
                                ? "Channel"
                                : "Conversation"}
                        </span>
                        <Button 
                            variant="ghost"
                            className="text-muted-foreground hover:text-foreground shrink-0 size-8 p-0" 
                            onClick={handleDismiss} 
                            title="Dismiss"
                        >
                            ✕
                        </Button>
                    </div>
                    <StreamingText text={summary} isStreaming={false} className="text-[13px] text-muted-foreground pl-6.5" />
                </div>
            )}

            {error && (
                <div className="flex items-center gap-2.5 text-[13px] text-destructive mt-2">
                    <span>⚠️ {error}</span>
                    <Button 
                        variant="outline"
                        className="h-8 px-3 rounded-md border-destructive/30 bg-transparent text-destructive hover:bg-destructive/10" 
                        onClick={handleCatchMeUp}
                    >
                        Retry
                    </Button>
                </div>
            )}

        </div>
    );
};

export default CatchMeUpBanner;
