"use client";

import React, { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { useAskAIStream } from "@/services/aiService";
import StreamingText from "@/components/ai/StreamingText";
import ActionConfirmation from "@/components/ai/ActionConfirmation";
import { ProposedAction } from "@/services/aiService";
import { cn } from "@/lib/utils/helpers/cn";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useDispatch } from "react-redux";
import { closeRightPanel } from "@/store/slice/desktopRightPanelSlice";
import { X, Plus, Send, Sparkles, StopCircle, Loader2 } from "lucide-react";
import { useMedia } from "@/context/MediaQueryContext";
import { useRouter } from "next/navigation";

// --- Client-side AI text sanitization ---
// Defense-in-depth: strip tool_call XML, UUIDs, and command syntax before display.
// The backend also sanitizes, but chunks may arrive with partial blocks during
// streaming — this ensures raw XML never reaches users.

const TOOL_CALL_BLOCK_RE = /(?:^|\n)?\s*<tool_call>[\s\S]*?<\/tool_call>\s*(?:\n|$)?/g;
const ORPHAN_XML_TAG_RE = /<\/?(?:tool_call|send_message|send_dm|send_group_chat|create_task|create_doc|set_reminder)[^>]*>/g;
const UUID_RE = /[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/g;
const COMMAND_SYNTAX_RE = /^[!/](?:message|send|create_task|set_reminder)\b.*$/gm;

function sanitizeAIText(text: string): string {
    let result = text;
    // Strip complete <tool_call>...</tool_call> blocks
    result = result.replace(TOOL_CALL_BLOCK_RE, "");
    // Strip orphan XML-like action tags
    result = result.replace(ORPHAN_XML_TAG_RE, "");
    // Strip UUID patterns
    result = result.replace(UUID_RE, "");
    // Strip /command syntax lines
    result = result.replace(COMMAND_SYNTAX_RE, "");
    // Collapse multiple blank lines
    while (result.includes("\n\n\n")) {
        result = result.replace(/\n\n\n/g, "\n\n");
    }
    return result.trim();
}

// --- Types ---

interface ChatMessage {
    id: string;
    role: "user" | "assistant";
    content: string;
    sources?: SourceDisplay[];
    actions?: ProposedAction[];
    timestamp: Date;
}

interface SourceDisplay {
    content_type: string;
    content_uuid: string;
    channel_name?: string;
    snippet?: string;
}

// --- Component ---

const AiChatPanel: React.FC = () => {
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [input, setInput] = useState("");
    const [sessionId, setSessionId] = useState<string | null>(null);
    const { askStream, cancelStream, isStreaming, streamText, streamActions, error } = useAskAIStream();
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLTextAreaElement>(null);
    const dispatch = useDispatch();
    const { isMobile } = useMedia();
    const router = useRouter();

    // Sanitize streaming text in real-time so <tool_call> blocks never render
    const sanitizedStreamText = useMemo(() => sanitizeAIText(streamText), [streamText]);

    // Auto-scroll to bottom
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages, sanitizedStreamText]);

    // Focus input on mount
    useEffect(() => {
        setTimeout(() => inputRef.current?.focus(), 200);
    }, []);

    const handleSend = useCallback(async () => {
        const q = input.trim();
        if (!q || isStreaming) return;

        const userMsg: ChatMessage = {
            id: `user-${Date.now()}`,
            role: "user",
            content: q,
            timestamp: new Date(),
        };

        setMessages((prev) => [...prev, userMsg]);
        setInput("");

        // Resize textarea back
        if (inputRef.current) {
            inputRef.current.style.height = "44px";
        }

        // askStream returns the final text + actions synchronously as its
        // resolved value — no more race condition with React state updates.
        const result = await askStream(q, sessionId || undefined);

        if (result && result.text) {
            let finalText = sanitizeAIText(result.text);
            const finalActions = result.actions;
            
            // If the AI only sent tool calls (which sanitize stripped away),
            // provide a descriptive fallback so the bubble isn't blank.
            if (!finalText && finalActions && finalActions.length > 0) {
                finalText = finalActions.length === 1 
                    ? `I'll ${finalActions[0].description.toLowerCase()}...`
                    : "I have a few actions prepared for you...";
            }

            const assistantMsg: ChatMessage = {
                id: `ai-${Date.now()}`,
                role: "assistant",
                content: finalText,
                actions: finalActions && finalActions.length > 0 ? finalActions : undefined,
                timestamp: new Date(),
            };
            setMessages((prev) => [...prev, assistantMsg]);
        }
    }, [input, isStreaming, askStream, sessionId]);

    const handleNewChat = useCallback(() => {
        setMessages([]);
        setSessionId(null);
        setInput("");
        inputRef.current?.focus();
    }, []);

    const handleClose = useCallback(() => {
        if (isMobile) {
            router.back();
        } else {
            dispatch(closeRightPanel());
        }
    }, [dispatch, isMobile, router]);

    const handleKeyDown = useCallback(
        (e: React.KeyboardEvent) => {
            if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
            }
        },
        [handleSend]
    );

    const handleTextareaInput = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
        setInput(e.target.value);
        // Auto-resize
        const el = e.target;
        el.style.height = "44px";
        el.style.height = Math.min(el.scrollHeight, 120) + "px";
    }, []);

    return (
        <div className="flex flex-col h-full bg-background border-l border-border">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-background shrink-0">
                <div className="flex items-center gap-2 text-primary font-semibold">
                    <Sparkles className="w-[18px] h-[18px]" />
                    <span className="text-sm font-semibold">AI Assistant</span>
                </div>
                <div className="flex gap-1">
                    <Button
                        variant="ghost"
                        size="icon"
                        className="w-7 h-8 text-muted-foreground hover:bg-accent hover:text-foreground"
                        onClick={handleNewChat}
                        title="New conversation"
                    >
                        <Plus size={16} />
                    </Button>
                    <Button
                        variant="ghost"
                        size="icon"
                        className="w-7 h-8 text-muted-foreground hover:bg-accent hover:text-foreground"
                        onClick={handleClose}
                        title="Close"
                    >
                        <X size={16} />
                    </Button>
                </div>
            </div>

            {/* Messages */}
            <ScrollArea className="flex-1 p-4">
                <div className="flex flex-col gap-4 scrollbar-thin">
                {messages.length === 0 && !isStreaming && (
                    <div className="flex flex-col items-center justify-center flex-1 text-center p-6 gap-3">
                        <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-primary/10 text-primary">
                            <Sparkles size={32} />
                        </div>
                        <h3 className="text-lg font-semibold text-foreground m-0">OneCamp AI</h3>
                        <p className="text-[13px] text-muted-foreground max-w-[280px] leading-normal m-0">
                            Ask anything about your workspace — channels, tasks, docs, and more.
                        </p>
                        <div className="flex flex-col gap-2 mt-2 w-full max-w-[320px]">
                            {[
                                "What are the recent updates in my channels?",
                                "Summarize my pending tasks",
                                "What did the team discuss today?",
                            ].map((suggestion) => (
                                <Button
                                    key={suggestion}
                                    variant="outline"
                                    className="h-auto px-3.5 py-2.5 bg-card text-foreground text-xs text-left transition-all duration-150 leading-[1.4] hover:border-primary hover:bg-primary/5 whitespace-normal justify-start"
                                    onClick={() => {
                                        setInput(suggestion);
                                        inputRef.current?.focus();
                                    }}
                                >
                                    {suggestion}
                                </Button>
                            ))}
                        </div>
                    </div>
                )}

                {messages.map((msg) => (
                    <div
                        key={msg.id}
                        className={cn("flex gap-2 animate-msg-fade-in", msg.role === "user" && "justify-end")}
                    >
                        {msg.role === "assistant" && (
                            <div className="w-6 h-6 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0 mt-0.5">
                                <Sparkles size={14} />
                            </div>
                        )}
                        <div className={cn(
                            "max-w-[85%] px-3.5 py-2.5 rounded-xl text-[13px] leading-relaxed relative",
                            msg.role === "user" 
                                ? "bg-primary text-primary-foreground rounded-br-sm shadow-sm" 
                                : "bg-muted text-foreground border border-border rounded-bl-sm"
                        )}>
                            <div className="whitespace-pre-wrap break-words">
                                {msg.content.split("\n").map((line, i) => (
                                    <React.Fragment key={i}>
                                        {line}
                                        {i < msg.content.split("\n").length - 1 && <br />}
                                    </React.Fragment>
                                ))}
                            </div>
                            {msg.sources && msg.sources.length > 0 && (
                                <div className="flex flex-wrap gap-1 mt-2 pt-2 border-t border-border">
                                    {msg.sources.map((src, i) => (
                                        <span key={i} className="text-[10px] px-2 py-0.5 rounded bg-primary/8 text-primary font-medium capitalize">
                                            {src.content_type}
                                            {src.channel_name && ` · ${src.channel_name}`}
                                        </span>
                                    ))}
                                </div>
                            )}
                            {msg.actions && msg.actions.length > 0 && (
                                <ActionConfirmation
                                    actions={msg.actions}
                                    onClose={() => {
                                        setMessages((prev) =>
                                            prev.map((m) =>
                                                m.id === msg.id 
                                                    ? { 
                                                        ...m, 
                                                        actions: undefined,
                                                        // If we were showing fallback text and they dismissed, 
                                                        // mark it as dismissed for better UX.
                                                        content: m.content.startsWith("I'll ") || m.content.startsWith("I have ") 
                                                            ? "Action dismissed" 
                                                            : m.content 
                                                      } 
                                                    : m
                                            )
                                        );
                                    }}
                                    onActionComplete={(toolName, success, message) => {
                                        setMessages((prev) =>
                                            prev.map((m) =>
                                                m.id === msg.id 
                                                    ? { ...m, content: success ? `${message}` : `${message}` } 
                                                    : m
                                            )
                                        );
                                    }}
                                />
                            )}
                        </div>
                    </div>
                ))}

                {/* Streaming in progress */}
                {isStreaming && (
                    <div className="flex gap-2 animate-msg-fade-in">
                        <div className="w-6 h-6 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0 mt-0.5">
                            <Sparkles size={14} />
                        </div>
                        <div className="max-w-[85%] px-3.5 py-2.5 rounded-xl text-[13px] leading-relaxed bg-muted text-foreground border border-border rounded-bl-sm">
                            {sanitizedStreamText.length === 0 ? (
                                <div className="flex items-center gap-2 py-1 text-muted-foreground text-[13px]">
                                    <Loader2 size={14} className="animate-spin" />
                                    <span>Thinking...</span>
                                </div>
                            ) : (
                                <StreamingText
                                    text={sanitizedStreamText}
                                    isStreaming={isStreaming}
                                />
                            )}
                        </div>
                    </div>
                )}

                {error && (
                    <div className="px-3 py-2 rounded-lg bg-red-500/8 border border-red-500/15 text-red-500 text-xs">
                        ⚠️ {error}
                    </div>
                )}

                <div ref={messagesEndRef} />
                </div>
            </ScrollArea>

            {/* Input */}
            <div className="px-4 py-3 border-t border-border bg-background shrink-0">
                <div className="flex items-end gap-2 border border-border rounded-xl pl-3 pr-1 py-1 bg-card transition-colors duration-150 focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/10">
                    <Textarea
                        ref={inputRef}
                        value={input}
                        onChange={handleTextareaInput}
                        onKeyDown={handleKeyDown}
                        placeholder="Ask your workspace anything..."
                        className="flex-1 border-none bg-transparent text-foreground text-[13px] leading-normal resize-none outline-none min-h-[36px] max-h-[120px] py-2 font-inherit disabled:opacity-50 ring-0 focus-visible:ring-0 shadow-none"
                        disabled={isStreaming}
                        rows={1}
                    />
                    {isStreaming ? (
                        <Button
                            size="icon"
                            variant="destructive"
                            className="w-8 h-8 rounded-lg shrink-0 transition-all duration-150 hover:opacity-90 hover:scale-[1.02]"
                            onClick={cancelStream}
                            title="Stop generating"
                        >
                            <StopCircle size={18} />
                        </Button>
                    ) : (
                        <Button
                            size="icon"
                            className="w-8 h-8 rounded-lg bg-primary text-primary-foreground shrink-0 transition-all duration-150 hover:opacity-90 hover:scale-[1.02] disabled:opacity-30"
                            onClick={handleSend}
                            disabled={!input.trim()}
                            title="Send"
                        >
                            <Send size={18} />
                        </Button>
                    )}
                </div>
            </div>

        </div>
    );
};

export default AiChatPanel;
