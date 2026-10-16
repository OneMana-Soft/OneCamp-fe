"use client";

import * as React from "react";
import { X, AlertCircle } from "@/lib/icons";
import { Button } from "@/components/ui/button";
import MarkdownMessage from "@/components/ai/MarkdownMessage";
import { AiComposer } from "@/components/ai/AiComposer";
import { AiMark } from "@/components/ai/AiMark";
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
    "Summarise the last few minutes",
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

    return (
        // A right column in the stage (hub.md C10): #131416, r14, e3 in dark,
        // 12px in from the stage's edges, sliding in on the panel recipe. The
        // AI's own pieces in dark (hub.md section 9): its mark, your question
        // in the neutral bubble, the answer flat beside the mark, the mark
        // breathing while it thinks (no spinner in the AI), and its composer.
        <div data-in-call-ai="" className="hub-panel-in flex h-full w-full flex-col overflow-hidden bg-[#131416] text-foreground @3xl:my-3 @3xl:mr-3 @3xl:h-[calc(100%-24px-84px)] @3xl:w-[360px] @3xl:rounded-[14px] @3xl:shadow-e3">
            <div className="flex shrink-0 items-center justify-between border-b border-white/[0.06] px-4 py-3">
                <div className="flex items-center gap-2.5">
                    {/* The AI is agent identity: the agent square, not the accent. */}
                    <AiMark size={24} />
                    <div>
                        <p className="text-heading leading-tight">Ask about this call</p>
                        <p className="flex items-center gap-1.5 text-meta leading-tight text-ink-3" title={aiEnabled && modelLabel ? `Powered by ${modelLabel} · shared with the call` : undefined}>
                            <span aria-hidden className="size-1.5 rounded-[3px] bg-camp-moss" />
                            Listening · shared with everyone in the call
                        </p>
                    </div>
                </div>
                <Button aria-label="Close AI panel" variant="ghost" size="icon" onClick={onClose} className="h-8 w-8 rounded-lg text-ink-3 hover:bg-white/10 hover:text-foreground">
                    <X className="h-4 w-4" />
                </Button>
            </div>

            <div ref={scrollRef} className="flex-1 space-y-5 overflow-y-auto px-4 py-4">
                {statusLoading ? (
                    <div role="status" aria-label="Getting the assistant ready" className="flex h-full items-center justify-center">
                        <AiMark size={32} breathing />
                    </div>
                ) : !aiEnabled ? (
                    // AI disabled: why and how to fix it, no dead composer.
                    <div className="flex h-full flex-col items-center justify-center gap-4 px-2 text-center">
                        <div className="flex size-12 items-center justify-center rounded-[14px] bg-warning/10">
                            <AlertCircle className="size-6 text-warning-ink" />
                        </div>
                        <div className="space-y-1">
                            <p className="text-heading">AI is turned off</p>
                            <p className="text-ui-sm text-pretty text-ink-2">
                                An admin can switch on the AI assistant and pick a chat model in Admin, AI. Once it&apos;s on, you can ask about this call here.
                            </p>
                        </div>
                    </div>
                ) : items.length === 0 ? (
                    <div data-in-call-empty="" className="flex h-full flex-col items-center justify-center gap-4 px-2 text-center">
                        <AiMark size={40} />
                        <div className="space-y-1">
                            <p className="text-heading">Ask about the call</p>
                            <p className="text-ui-sm text-pretty text-ink-2">
                                I answer from what&apos;s been said so far: decisions, action items, or a quick recap. Everyone in the call sees the answer.
                            </p>
                        </div>
                        <div className="mt-2 flex w-full flex-col gap-2">
                            {SUGGESTIONS.map((s) => (
                                <button
                                    key={s}
                                    type="button"
                                    onClick={() => submit(s)}
                                    className="rounded-[10px] bg-raised px-3 py-2 text-left text-ui-sm text-foreground shadow-e1 transition-shadow hover:shadow-e2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                                >
                                    {s}
                                </button>
                            ))}
                        </div>
                    </div>
                ) : (
                    items.map((it) => (
                        <div key={it.id} className="space-y-2" data-in-call-item="">
                            {/* Asker attribution, only for questions from others. */}
                            {!it.mine && <p className="px-1 text-meta text-ink-3">{it.askedByName} asked</p>}
                            <div className={cn("flex", it.mine ? "justify-end" : "justify-start")}>
                                <div className="ai-user-bubble max-w-[85%] px-3.5 py-2 text-ui leading-[21px] text-foreground">{it.question}</div>
                            </div>
                            <div className="flex items-start gap-2.5">
                                <AiMark size={20} breathing={!it.answer && !it.error} className="mt-0.5" />
                                <div className="min-w-0 flex-1 text-ui leading-[22px]">
                                    {it.error ? (
                                        <span className="text-danger-ink">{it.error}</span>
                                    ) : it.answer ? (
                                        <MarkdownMessage content={it.answer} className="text-ui leading-[22px]" />
                                    ) : (
                                        <span className="hub-shimmer" role="status">
                                            Thinking…
                                        </span>
                                    )}
                                </div>
                            </div>
                        </div>
                    ))
                )}
            </div>

            <div className="shrink-0 px-3 pb-3 pt-1">
                <AiComposer
                    inputRef={inputRef}
                    value={input}
                    onChange={setInput}
                    onSend={() => submit(input)}
                    onStop={onCancel}
                    streaming={isStreaming}
                    disabled={!aiEnabled}
                    disabledNote={!statusLoading && !aiEnabled ? "AI is unavailable" : undefined}
                    placeholder="Ask about this call…"
                    maxLength={2000}
                />
            </div>
        </div>
    );
}
