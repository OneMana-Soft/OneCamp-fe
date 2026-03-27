"use client";

import React, { useState, useCallback, useEffect } from "react";
import StreamingText from "./StreamingText";
import { useSummarizeChannel } from "@/services/aiService";

interface CatchMeUpBannerProps {
    /** UUID of the channel to summarize */
    channelUUID: string;
    /** Number of unread messages in the channel */
    unreadCount: number;
    /** Channel name for display */
    channelName?: string;
    /** Minimum unread count to show the banner (default: 20) */
    threshold?: number;
}

/**
 * CatchMeUpBanner — A glassmorphic floating banner that appears at the top of
 * channels with many unread messages. Click to get an AI-generated summary.
 *
 * This is the first visible AI feature — the "hook" that demonstrates OneCamp's
 * Second Brain capabilities.
 */
const CatchMeUpBanner: React.FC<CatchMeUpBannerProps> = ({
    channelUUID,
    unreadCount,
    channelName,
    threshold = 20,
}) => {
    const [state, setState] = useState<"idle" | "loading" | "summary" | "dismissed">("idle");
    const [summary, setSummary] = useState("");
    const [error, setError] = useState<string | null>(null);
    const { summarize, isSubmitting } = useSummarizeChannel();

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
        <div className="catch-me-up-banner">
            {state === "idle" && (
                <div className="banner-idle">
                    <div className="banner-icon">✨</div>
                    <div className="banner-text">
                        <span className="banner-count">{unreadCount} unread messages</span>
                        {channelName && <span className="banner-channel"> in #{channelName}</span>}
                    </div>
                    <button
                        className="catch-me-up-btn"
                        onClick={handleCatchMeUp}
                        disabled={isSubmitting}
                    >
                        Catch Me Up
                    </button>
                    <button className="dismiss-btn" onClick={handleDismiss} title="Dismiss">
                        ✕
                    </button>
                </div>
            )}

            {state === "loading" && (
                <div className="banner-loading">
                    <div className="banner-icon spinning">🧠</div>
                    <div className="banner-text">
                        <span>AI is reading {unreadCount} messages...</span>
                    </div>
                    <div className="skeleton-lines">
                        <div className="skeleton-line" style={{ width: "90%" }} />
                        <div className="skeleton-line" style={{ width: "75%" }} />
                        <div className="skeleton-line" style={{ width: "60%" }} />
                    </div>
                </div>
            )}

            {state === "summary" && (
                <div className="banner-summary">
                    <div className="summary-header">
                        <div className="banner-icon">✨</div>
                        <span className="summary-title">
                            AI Summary — {channelName ? `#${channelName}` : "Channel"}
                        </span>
                        <button className="dismiss-btn" onClick={handleDismiss} title="Dismiss">
                            ✕
                        </button>
                    </div>
                    <StreamingText text={summary} isStreaming={false} className="summary-content" />
                </div>
            )}

            {error && (
                <div className="banner-error">
                    <span>⚠️ {error}</span>
                    <button className="retry-btn" onClick={handleCatchMeUp}>
                        Retry
                    </button>
                </div>
            )}

            <style jsx>{`
                .catch-me-up-banner {
                    margin: 8px 16px;
                    padding: 12px 16px;
                    border-radius: 12px;
                    background: rgba(99, 102, 241, 0.08);
                    backdrop-filter: blur(16px);
                    border: 1px solid rgba(99, 102, 241, 0.2);
                    box-shadow: 0 4px 24px rgba(0, 0, 0, 0.12);
                    animation: slideDown 0.3s ease-out;
                    position: relative;
                    z-index: 10;
                }

                @keyframes slideDown {
                    from {
                        opacity: 0;
                        transform: translateY(-8px);
                    }
                    to {
                        opacity: 1;
                        transform: translateY(0);
                    }
                }

                .banner-idle,
                .banner-loading {
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    flex-wrap: wrap;
                }

                .banner-icon {
                    font-size: 18px;
                    flex-shrink: 0;
                }

                .banner-icon.spinning {
                    animation: spin 2s linear infinite;
                }

                @keyframes spin {
                    100% {
                        transform: rotate(360deg);
                    }
                }

                .banner-text {
                    flex: 1;
                    font-size: 13px;
                    color: var(--text-secondary, #a1a1aa);
                }

                .banner-count {
                    font-weight: 600;
                    color: var(--text-primary, #e4e4e7);
                }

                .banner-channel {
                    color: var(--accent-primary, #818cf8);
                }

                .catch-me-up-btn {
                    padding: 6px 16px;
                    border-radius: 8px;
                    border: none;
                    background: linear-gradient(135deg, #6366f1, #8b5cf6);
                    color: white;
                    font-size: 13px;
                    font-weight: 600;
                    cursor: pointer;
                    transition: all 0.2s;
                    white-space: nowrap;
                }

                .catch-me-up-btn:hover {
                    background: linear-gradient(135deg, #4f46e5, #7c3aed);
                    box-shadow: 0 2px 12px rgba(99, 102, 241, 0.4);
                    transform: translateY(-1px);
                }

                .catch-me-up-btn:disabled {
                    opacity: 0.5;
                    cursor: not-allowed;
                    transform: none;
                }

                .dismiss-btn {
                    background: none;
                    border: none;
                    color: var(--text-tertiary, #71717a);
                    cursor: pointer;
                    font-size: 14px;
                    padding: 4px 8px;
                    border-radius: 4px;
                    transition: color 0.2s;
                    flex-shrink: 0;
                }

                .dismiss-btn:hover {
                    color: var(--text-primary, #e4e4e7);
                }

                /* Skeleton loading */
                .skeleton-lines {
                    width: 100%;
                    display: flex;
                    flex-direction: column;
                    gap: 8px;
                    margin-top: 8px;
                }

                .skeleton-line {
                    height: 12px;
                    border-radius: 6px;
                    background: linear-gradient(
                        90deg,
                        rgba(99, 102, 241, 0.1) 25%,
                        rgba(99, 102, 241, 0.2) 50%,
                        rgba(99, 102, 241, 0.1) 75%
                    );
                    background-size: 200% 100%;
                    animation: shimmer 1.5s ease-in-out infinite;
                }

                @keyframes shimmer {
                    0% {
                        background-position: 200% 0;
                    }
                    100% {
                        background-position: -200% 0;
                    }
                }

                /* Summary view */
                .banner-summary {
                    display: flex;
                    flex-direction: column;
                    gap: 10px;
                }

                .summary-header {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                }

                .summary-title {
                    flex: 1;
                    font-size: 13px;
                    font-weight: 600;
                    color: var(--accent-primary, #818cf8);
                }

                :global(.summary-content) {
                    font-size: 13px;
                    color: var(--text-secondary, #a1a1aa);
                    padding-left: 26px;
                }

                /* Error state */
                .banner-error {
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    font-size: 13px;
                    color: #f87171;
                    margin-top: 8px;
                }

                .retry-btn {
                    padding: 4px 12px;
                    border-radius: 6px;
                    border: 1px solid rgba(248, 113, 113, 0.3);
                    background: transparent;
                    color: #f87171;
                    font-size: 12px;
                    cursor: pointer;
                    transition: all 0.2s;
                }

                .retry-btn:hover {
                    background: rgba(248, 113, 113, 0.1);
                }
            `}</style>
        </div>
    );
};

export default CatchMeUpBanner;
