"use client";

import React, { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { useAskAIStream } from "@/services/aiService";
import StreamingText from "@/components/ai/StreamingText";
import ActionConfirmation from "@/components/ai/ActionConfirmation";
import { ProposedAction } from "@/services/aiService";
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
        <div className="ai-chat-panel">
            {/* Header */}
            <div className="ai-chat-header">
                <div className="ai-chat-header-left">
                    <Sparkles className="ai-header-icon" />
                    <span className="ai-header-title">AI Assistant</span>
                </div>
                <div className="ai-chat-header-actions">
                    <button
                        className="ai-header-btn"
                        onClick={handleNewChat}
                        title="New conversation"
                    >
                        <Plus size={16} />
                    </button>
                    <button
                        className="ai-header-btn"
                        onClick={handleClose}
                        title="Close"
                    >
                        <X size={16} />
                    </button>
                </div>
            </div>

            {/* Messages */}
            <div className="ai-chat-messages">
                {messages.length === 0 && !isStreaming && (
                    <div className="ai-chat-empty">
                        <div className="ai-empty-icon">
                            <Sparkles size={32} />
                        </div>
                        <h3 className="ai-empty-title">OneCamp AI</h3>
                        <p className="ai-empty-desc">
                            Ask anything about your workspace — channels, tasks, docs, and more.
                        </p>
                        <div className="ai-suggestions">
                            {[
                                "What are the recent updates in my channels?",
                                "Summarize my pending tasks",
                                "What did the team discuss today?",
                            ].map((suggestion) => (
                                <button
                                    key={suggestion}
                                    className="ai-suggestion-chip"
                                    onClick={() => {
                                        setInput(suggestion);
                                        inputRef.current?.focus();
                                    }}
                                >
                                    {suggestion}
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {messages.map((msg) => (
                    <div
                        key={msg.id}
                        className={`ai-chat-msg ai-chat-msg-${msg.role}`}
                    >
                        {msg.role === "assistant" && (
                            <div className="ai-msg-avatar">
                                <Sparkles size={14} />
                            </div>
                        )}
                        <div className={`ai-msg-bubble ai-msg-bubble-${msg.role}`}>
                            <div className="ai-msg-content">
                                {msg.content.split("\n").map((line, i) => (
                                    <React.Fragment key={i}>
                                        {line}
                                        {i < msg.content.split("\n").length - 1 && <br />}
                                    </React.Fragment>
                                ))}
                            </div>
                            {msg.sources && msg.sources.length > 0 && (
                                <div className="ai-msg-sources">
                                    {msg.sources.map((src, i) => (
                                        <span key={i} className="ai-source-tag">
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
                    <div className="ai-chat-msg ai-chat-msg-assistant">
                        <div className="ai-msg-avatar">
                            <Sparkles size={14} />
                        </div>
                        <div className="ai-msg-bubble ai-msg-bubble-assistant">
                            {sanitizedStreamText.length === 0 ? (
                                <div className="ai-loading-dots">
                                    <span className="dot"></span>
                                    <span className="dot"></span>
                                    <span className="dot"></span>
                                </div>
                            ) : (
                                <StreamingText
                                    text={sanitizedStreamText}
                                    isStreaming={isStreaming}
                                    className="ai-stream-text"
                                />
                            )}
                        </div>
                    </div>
                )}

                {error && (
                    <div className="ai-chat-error">
                        ⚠️ {error}
                    </div>
                )}

                <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="ai-chat-input-area">
                <div className="ai-chat-input-wrapper">
                    <textarea
                        ref={inputRef}
                        value={input}
                        onChange={handleTextareaInput}
                        onKeyDown={handleKeyDown}
                        placeholder="Ask your workspace anything..."
                        className="ai-chat-textarea"
                        disabled={isStreaming}
                        rows={1}
                    />
                    {isStreaming ? (
                        <button
                            className="ai-send-btn ai-stop-btn"
                            onClick={cancelStream}
                            title="Stop generating"
                        >
                            <StopCircle size={18} />
                        </button>
                    ) : (
                        <button
                            className="ai-send-btn"
                            onClick={handleSend}
                            disabled={!input.trim()}
                            title="Send"
                        >
                            {input.trim() ? <Send size={18} /> : <Send size={18} />}
                        </button>
                    )}
                </div>
            </div>

            <style jsx>{`
                .ai-chat-panel {
                    display: flex;
                    flex-direction: column;
                    height: 100%;
                    background: hsl(var(--background));
                    border-left: 1px solid hsl(var(--border));
                }

                .ai-chat-header {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    padding: 12px 16px;
                    border-bottom: 1px solid hsl(var(--border));
                    background: hsl(var(--background));
                    flex-shrink: 0;
                }

                .ai-chat-header-left {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                }

                .ai-chat-header-left :global(.ai-header-icon) {
                    color: hsl(var(--primary));
                    width: 18px;
                    height: 18px;
                }

                .ai-header-title {
                    font-size: 14px;
                    font-weight: 600;
                    color: hsl(var(--foreground));
                }

                .ai-chat-header-actions {
                    display: flex;
                    gap: 4px;
                }

                .ai-header-btn {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    width: 28px;
                    height: 28px;
                    border-radius: 6px;
                    border: none;
                    background: transparent;
                    color: hsl(var(--muted-foreground));
                    cursor: pointer;
                    transition: all 0.15s;
                }

                .ai-header-btn:hover {
                    background: hsl(var(--accent));
                    color: hsl(var(--foreground));
                }

                .ai-chat-messages {
                    flex: 1;
                    overflow-y: auto;
                    padding: 16px;
                    display: flex;
                    flex-direction: column;
                    gap: 16px;
                    scrollbar-width: thin;
                }

                .ai-chat-empty {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    flex: 1;
                    text-align: center;
                    padding: 24px;
                    gap: 12px;
                }

                .ai-typing-indicator span:nth-child(3) { animation-delay: 0.4s; }

                .ai-loading-dots {
                    display: flex;
                    align-items: center;
                    gap: 4px;
                    padding: 8px 4px;
                }
                .ai-loading-dots .dot {
                    width: 6px;
                    height: 6px;
                    background: rgba(255, 255, 255, 0.4);
                    border-radius: 50%;
                    animation: pulse-dot 1.4s infinite ease-in-out;
                }
                .ai-loading-dots .dot:nth-child(1) { animation-delay: -0.32s; }
                .ai-loading-dots .dot:nth-child(2) { animation-delay: -0.16s; }
                
                @keyframes pulse-dot {
                    0%, 80%, 100% { transform: scale(0); opacity: 0.3; }
                    40% { transform: scale(1); opacity: 1; }
                }

                .ai-empty-icon {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    width: 56px;
                    height: 56px;
                    border-radius: 16px;
                    background: hsl(var(--primary) / 0.1);
                    color: hsl(var(--primary));
                }

                .ai-empty-title {
                    font-size: 18px;
                    font-weight: 600;
                    color: hsl(var(--foreground));
                    margin: 0;
                }

                .ai-empty-desc {
                    font-size: 13px;
                    color: hsl(var(--muted-foreground));
                    max-width: 280px;
                    line-height: 1.5;
                    margin: 0;
                }

                .ai-suggestions {
                    display: flex;
                    flex-direction: column;
                    gap: 8px;
                    margin-top: 8px;
                    width: 100%;
                    max-width: 320px;
                }

                .ai-suggestion-chip {
                    padding: 10px 14px;
                    border-radius: 10px;
                    border: 1px solid hsl(var(--border));
                    background: hsl(var(--card));
                    color: hsl(var(--foreground));
                    font-size: 12px;
                    text-align: left;
                    cursor: pointer;
                    transition: all 0.15s;
                    line-height: 1.4;
                }

                .ai-suggestion-chip:hover {
                    border-color: hsl(var(--primary));
                    background: hsl(var(--primary) / 0.05);
                }

                .ai-chat-msg {
                    display: flex;
                    gap: 8px;
                    animation: msgFadeIn 0.2s ease-out;
                }

                @keyframes msgFadeIn {
                    from { opacity: 0; transform: translateY(4px); }
                    to { opacity: 1; transform: translateY(0); }
                }

                .ai-chat-msg-user {
                    justify-content: flex-end;
                }

                .ai-msg-avatar {
                    width: 24px;
                    height: 24px;
                    border-radius: 8px;
                    background: hsl(var(--primary) / 0.1);
                    color: hsl(var(--primary));
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    flex-shrink: 0;
                    margin-top: 2px;
                }

                .ai-msg-bubble {
                    max-width: 85%;
                    padding: 10px 14px;
                    border-radius: 14px;
                    font-size: 13px;
                    line-height: 1.6;
                }

                .ai-msg-bubble-user {
                    background: hsl(var(--primary));
                    color: hsl(var(--primary-foreground));
                    border-bottom-right-radius: 4px;
                }

                .ai-msg-bubble-assistant {
                    background: hsl(var(--card));
                    color: hsl(var(--foreground));
                    border: 1px solid hsl(var(--border));
                    border-bottom-left-radius: 4px;
                }

                .ai-msg-content {
                    white-space: pre-wrap;
                    word-break: break-word;
                }

                .ai-msg-sources {
                    display: flex;
                    flex-wrap: wrap;
                    gap: 4px;
                    margin-top: 8px;
                    padding-top: 8px;
                    border-top: 1px solid hsl(var(--border));
                }

                .ai-source-tag {
                    font-size: 10px;
                    padding: 2px 8px;
                    border-radius: 4px;
                    background: hsl(var(--primary) / 0.08);
                    color: hsl(var(--primary));
                    font-weight: 500;
                    text-transform: capitalize;
                }

                .ai-chat-error {
                    padding: 8px 12px;
                    border-radius: 8px;
                    background: hsl(0 84% 60% / 0.08);
                    border: 1px solid hsl(0 84% 60% / 0.15);
                    color: hsl(0 84% 60%);
                    font-size: 12px;
                }

                .ai-chat-input-area {
                    padding: 12px 16px;
                    border-top: 1px solid hsl(var(--border));
                    background: hsl(var(--background));
                    flex-shrink: 0;
                }

                .ai-chat-input-wrapper {
                    display: flex;
                    align-items: flex-end;
                    gap: 8px;
                    border: 1px solid hsl(var(--border));
                    border-radius: 12px;
                    padding: 4px 4px 4px 12px;
                    background: hsl(var(--card));
                    transition: border-color 0.15s;
                }

                .ai-chat-input-wrapper:focus-within {
                    border-color: hsl(var(--primary));
                    box-shadow: 0 0 0 3px hsl(var(--primary) / 0.1);
                }

                .ai-chat-textarea {
                    flex: 1;
                    border: none;
                    background: transparent;
                    color: hsl(var(--foreground));
                    font-size: 13px;
                    line-height: 1.5;
                    resize: none;
                    outline: none;
                    min-height: 36px;
                    max-height: 120px;
                    padding: 8px 0;
                    font-family: inherit;
                }

                .ai-chat-textarea::placeholder {
                    color: hsl(var(--muted-foreground));
                }

                .ai-send-btn {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    width: 32px;
                    height: 32px;
                    border-radius: 8px;
                    border: none;
                    background: hsl(var(--primary));
                    color: hsl(var(--primary-foreground));
                    cursor: pointer;
                    flex-shrink: 0;
                    transition: all 0.15s;
                }

                .ai-send-btn:hover:not(:disabled) {
                    opacity: 0.9;
                    transform: scale(1.02);
                }

                .ai-send-btn:disabled {
                    opacity: 0.3;
                    cursor: not-allowed;
                }

                .ai-stop-btn {
                    background: hsl(0 84% 60%);
                }

                .ai-stream-text :global(.ai-streaming-text) {
                    max-height: none;
                }
            `}</style>
        </div>
    );
};

export default AiChatPanel;
