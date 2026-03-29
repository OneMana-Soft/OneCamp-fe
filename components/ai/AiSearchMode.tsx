"use client";

import React, { useState, useCallback, useRef } from "react";
import { cn } from "@/lib/utils/helpers/cn";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import StreamingText from "./StreamingText";
import { useAskAI, useAskAIStream } from "@/services/aiService";

interface AiSearchModeProps {
    /** Called when AI mode is toggled on/off */
    onModeChange?: (isAIMode: boolean) => void;
    /** Whether AI is available (from useAIStatus) */
    aiEnabled?: boolean;
}

/**
 * AiSearchMode — Toggle between keyword search and AI Q&A mode.
 * Plugs into the existing search palette (cmdk-style) to add AI capabilities.
 *
 * In AI mode, users type natural language questions and get streaming answers
 * with source citations linking back to original posts/docs/chats.
 */
const AiSearchMode: React.FC<AiSearchModeProps> = ({
    onModeChange,
    aiEnabled = true,
}) => {
    const [isAIMode, setIsAIMode] = useState(false);
    const [question, setQuestion] = useState("");
    const { askStream, cancelStream, isStreaming, streamText, error } = useAskAIStream();
    const inputRef = useRef<HTMLInputElement>(null);

    const handleToggle = useCallback(() => {
        const newMode = !isAIMode;
        setIsAIMode(newMode);
        onModeChange?.(newMode);
        // Focus input when entering AI mode
        if (newMode) {
            setTimeout(() => inputRef.current?.focus(), 100);
        }
    }, [isAIMode, onModeChange]);

    const handleAsk = useCallback(
        async (e?: React.FormEvent) => {
            e?.preventDefault();
            if (!question.trim() || isStreaming) return;
            await askStream(question.trim());
        },
        [question, isStreaming, askStream]
    );

    const handleKeyDown = useCallback(
        (e: React.KeyboardEvent) => {
            if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleAsk();
            }
            if (e.key === "Escape") {
                if (isStreaming) {
                    cancelStream();
                } else {
                    setIsAIMode(false);
                    onModeChange?.(false);
                }
            }
        },
        [handleAsk, isStreaming, cancelStream, onModeChange]
    );

    if (!aiEnabled) return null;

    return (
        <div className="flex flex-col gap-2">
            {/* Toggle Button */}
            <Button
                variant="outline"
                className={cn(
                    "inline-flex items-center gap-1.5 px-3 py-1 rounded-lg border border-border bg-muted/60 text-muted-foreground text-xs transition-all duration-200 self-end hover:border-primary/40 hover:text-foreground",
                    isAIMode && "bg-primary/10 border-primary/40 text-primary"
                )}
                onClick={handleToggle}
                title={isAIMode ? "Switch to keyword search" : "Switch to AI search"}
            >
                <span className="text-sm">{isAIMode ? "🧠" : "🔍"}</span>
                <span className="font-medium">{isAIMode ? "AI" : "Search"}</span>
            </Button>
 
            {/* AI Input & Response Area */}
            {isAIMode && (
                <div className="flex flex-col gap-2 animate-in fade-in slide-in-from-top-1 duration-200">
                    <form onSubmit={handleAsk} className="flex gap-2 items-center">
                        <Input
                            ref={inputRef}
                            type="text"
                            placeholder="Ask your workspace anything..."
                            value={question}
                            onChange={(e) => setQuestion(e.target.value)}
                            onKeyDown={handleKeyDown}
                            className="flex-1 px-3.5 py-2.5 rounded-xl border border-border bg-background/80 text-foreground text-sm outline-none transition-all focus:border-primary/50 focus:ring-4 focus:ring-primary/10 placeholder:text-muted-foreground"
                            disabled={isStreaming}
                        />
                        {isStreaming ? (
                            <Button
                                type="button"
                                variant="outline"
                                onClick={cancelStream}
                                className="px-5 py-2.5 rounded-xl bg-destructive/15 text-destructive border border-destructive/20 text-[13px] font-semibold transition-all hover:bg-destructive/25"
                            >
                                Stop
                            </Button>
                        ) : (
                            <Button
                                type="submit"
                                className="px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-[13px] font-semibold transition-all hover:shadow-primary/30 disabled:opacity-40"
                                disabled={!question.trim()}
                            >
                                Ask AI
                            </Button>
                        )}
                    </form>
 
                    {/* Response Area */}
                    {(streamText || isStreaming) && (
                        <div className="p-3 px-4 rounded-xl bg-muted/50 border border-border">
                            <StreamingText
                                text={streamText}
                                isStreaming={isStreaming}
                                className="text-sm"
                            />
                        </div>
                    )}
 
                    {error && (
                        <div className="px-3 py-2 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-xs">
                            ⚠️ {error}
                        </div>
                    )}
                </div>
            )}
 

        </div>
    );
};

export default AiSearchMode;
