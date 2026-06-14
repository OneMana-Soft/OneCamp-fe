"use client";

import * as React from "react";
import { Sparkles, Send, X, Loader2, AlertCircle } from "@/lib/icons";
import { Button } from "@/components/ui/button";
import MarkdownMessage from "@/components/ai/MarkdownMessage";
import { useAIStatus, AIStatusResponse } from "@/services/aiService";
import { InCallQAItem } from "./useInCallAgent";
import { cn } from "@/lib/utils/helpers/cn";

interface InCallAIPanelProps {
    /** Shared, multiplayer conversation (persists while the panel is closed). */
    items: InCallQAItem[];
    /** True while the local user's question is streaming an answer. */
    isStreaming: boolean;
    onAsk: (question: string) => void;
    onCancel: () => void;
    onClose: () => void;
}

// Quick-prompt chips — the highest-signal asks during a live call.
const SUGGESTIONS = [
    "Summarize the last few minutes",
    "What did we decide?",
    "What are my action items?",
];

export function InCallAIPanel({
    items,
    isStreaming,
    onAsk,
    onCancel,
    onClose,
}: InCallAIPanelProps) {
    const { getStatus } = useAIStatus();
    const [input, setInput] = React.useState("");
    const [status, setStatus] = React.useState<AIStatusResponse | null>(null);
    const [statusLoading, setStatusLoading] = React.useState(true);
    const scrollRef = React.useRef<HTMLDivElement | null>(null);
    const inputRef = React.useRef<HTMLTextAreaElement | null>(null);

    // Resolve AI availability + active chat model once on open so we can show
    // an accurate "powered by" hint and disable the composer when AI is off.
    React.useEffect(() => {
        let cancelled = false;
        (async () => {
            const s = await getStatus();
            if (!cancelled) {
                setStatus(s ?? null);
                setStatusLoading(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [getStatus]);

    const aiEnabled = status?.enabled ?? false;
    const modelLabel = status?.model || status?.provider || "";

    // Keep the newest exchange in view.
    React.useEffect(() => {
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
    }, [items]);

    const submit = React.useCallback(
        (raw: string) => {
            const question = raw.trim();
            if (!question || isStreaming || !aiEnabled) return;
            onAsk(question);
            setInput("");
        },
        [aiEnabled, isStreaming, onAsk],
    );

    const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            submit(input);
        }
    };

    return (
        <div className="flex flex-col h-full w-full md:w-[360px] bg-zinc-900/95 backdrop-blur-md border-l border-white/10 text-white shadow-2xl">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 shrink-0">
                <div className="flex items-center gap-2">
                    <div className="flex items-center justify-center h-7 w-7 rounded-lg bg-gradient-to-br from-violet-500 to-blue-500">
                        <Sparkles className="h-4 w-4 text-white" />
                    </div>
                    <div>
                        <p className="text-sm font-semibold leading-tight">Call Assistant</p>
                        <p className="text-[11px] text-white/50 leading-tight">
                            {aiEnabled && modelLabel
                                ? `Powered by ${modelLabel} · shared with the call`
                                : "Shared with everyone in the call"}
                        </p>
                    </div>
                </div>
                <Button
                    variant="ghost"
                    size="icon"
                    onClick={onClose}
                    className="h-8 w-8 rounded-lg text-white/60 hover:text-white hover:bg-white/10"
                >
                    <X className="h-4 w-4" />
                </Button>
            </div>

            {/* Conversation */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
                {statusLoading && (
                    <div className="flex items-center justify-center h-full">
                        <Loader2 className="h-5 w-5 animate-spin text-white/40" />
                    </div>
                )}

                {/* AI disabled — explain why and how to fix, no dead composer. */}
                {!statusLoading && !aiEnabled && (
                    <div className="flex flex-col items-center justify-center h-full text-center gap-4 px-2">
                        <div className="flex items-center justify-center h-12 w-12 rounded-2xl bg-amber-500/10">
                            <AlertCircle className="h-6 w-6 text-amber-400" />
                        </div>
                        <div className="space-y-1">
                            <p className="text-sm font-medium text-white/90">AI is turned off</p>
                            <p className="text-xs text-white/50 leading-relaxed">
                                An admin can enable the AI assistant and pick a chat model from
                                Admin → AI. Once it&apos;s on, you can ask about this call here.
                            </p>
                        </div>
                    </div>
                )}

                {!statusLoading && aiEnabled && items.length === 0 && (
                    <div className="flex flex-col items-center justify-center h-full text-center gap-4 px-2">
                        <div className="flex items-center justify-center h-12 w-12 rounded-2xl bg-white/5">
                            <Sparkles className="h-6 w-6 text-violet-400" />
                        </div>
                        <div className="space-y-1">
                            <p className="text-sm font-medium text-white/90">Ask about the call</p>
                            <p className="text-xs text-white/50 leading-relaxed">
                                I answer from what&apos;s been said so far — decisions, action
                                items, or a quick recap. Everyone in the call sees the answer.
                            </p>
                        </div>
                        <div className="flex flex-col gap-2 w-full mt-2">
                            {SUGGESTIONS.map((s) => (
                                <button
                                    key={s}
                                    onClick={() => submit(s)}
                                    className="text-xs text-left px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white/80 transition-colors"
                                >
                                    {s}
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {!statusLoading && aiEnabled && items.map((it) => (
                    <div key={it.id} className="space-y-1.5">
                        {/* Asker attribution — only for questions from others. */}
                        {!it.mine && (
                            <p className="text-[11px] text-white/40 px-1">
                                {it.askedByName} asked
                            </p>
                        )}
                        {/* Question */}
                        <div className={cn("flex", it.mine ? "justify-end" : "justify-start")}>
                            <div
                                className={cn(
                                    "max-w-[85%] rounded-2xl px-3 py-2 text-sm",
                                    it.mine
                                        ? "rounded-br-sm bg-blue-600"
                                        : "rounded-bl-sm bg-white/10",
                                )}
                            >
                                {it.question}
                            </div>
                        </div>
                        {/* Answer */}
                        <div className="flex justify-start">
                            <div className="max-w-[90%] rounded-2xl rounded-bl-sm bg-white/5 border border-white/10 px-3 py-2 text-sm text-white/90">
                                {it.error ? (
                                    <span className="text-red-400">{it.error}</span>
                                ) : it.answer ? (
                                    <MarkdownMessage content={it.answer} className="text-sm leading-relaxed" />
                                ) : (
                                    <span className="inline-flex items-center gap-2 text-white/50">
                                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                        Thinking…
                                    </span>
                                )}
                                {it.streaming && it.answer && (
                                    <span className="inline-block w-1.5 h-4 ml-0.5 align-middle bg-white/60 animate-pulse" />
                                )}
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {/* Composer */}
            <div className="border-t border-white/10 p-3 shrink-0">
                <div className={cn(
                    "flex items-end gap-2 rounded-2xl bg-white/5 border border-white/10 px-3 py-2 transition-colors",
                    aiEnabled ? "focus-within:border-white/30" : "opacity-50",
                )}>
                    <textarea
                        ref={inputRef}
                        rows={1}
                        value={input}
                        maxLength={2000}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={onKeyDown}
                        disabled={!aiEnabled}
                        placeholder={aiEnabled ? "Ask the call assistant…" : "AI is unavailable"}
                        className="flex-1 resize-none bg-transparent text-sm text-white placeholder:text-white/40 outline-none max-h-24 leading-relaxed disabled:cursor-not-allowed"
                    />
                    {isStreaming ? (
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={onCancel}
                            className="h-8 w-8 rounded-lg text-white/70 hover:text-white hover:bg-white/10 shrink-0"
                            title="Stop"
                        >
                            <Loader2 className="h-4 w-4 animate-spin" />
                        </Button>
                    ) : (
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => submit(input)}
                            disabled={!input.trim() || !aiEnabled}
                            className={cn(
                                "h-8 w-8 rounded-lg shrink-0 transition-colors",
                                input.trim() && aiEnabled
                                    ? "text-blue-400 hover:text-blue-300 hover:bg-white/10"
                                    : "text-white/30",
                            )}
                            title="Send"
                        >
                            <Send className="h-4 w-4" />
                        </Button>
                    )}
                </div>
            </div>
        </div>
    );
}
