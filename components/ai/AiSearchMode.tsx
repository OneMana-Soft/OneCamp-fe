"use client";

import React, { useState, useCallback, useRef } from "react";
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
        <div className="ai-search-mode">
            {/* Toggle Button */}
            <button
                className={`ai-toggle ${isAIMode ? "active" : ""}`}
                onClick={handleToggle}
                title={isAIMode ? "Switch to keyword search" : "Switch to AI search"}
            >
                <span className="toggle-icon">{isAIMode ? "🧠" : "🔍"}</span>
                <span className="toggle-label">{isAIMode ? "AI" : "Search"}</span>
            </button>

            {/* AI Input & Response Area */}
            {isAIMode && (
                <div className="ai-panel">
                    <form onSubmit={handleAsk} className="ai-input-form">
                        <input
                            ref={inputRef}
                            type="text"
                            placeholder="Ask your workspace anything..."
                            value={question}
                            onChange={(e) => setQuestion(e.target.value)}
                            onKeyDown={handleKeyDown}
                            className="ai-input"
                            disabled={isStreaming}
                        />
                        {isStreaming ? (
                            <button
                                type="button"
                                onClick={cancelStream}
                                className="ai-cancel-btn"
                            >
                                Stop
                            </button>
                        ) : (
                            <button
                                type="submit"
                                className="ai-send-btn"
                                disabled={!question.trim()}
                            >
                                Ask AI
                            </button>
                        )}
                    </form>

                    {/* Response Area */}
                    {(streamText || isStreaming) && (
                        <div className="ai-response">
                            <StreamingText
                                text={streamText}
                                isStreaming={isStreaming}
                                className="ai-response-text"
                            />
                        </div>
                    )}

                    {error && (
                        <div className="ai-error">
                            ⚠️ {error}
                        </div>
                    )}
                </div>
            )}

            <style jsx>{`
                .ai-search-mode {
                    display: flex;
                    flex-direction: column;
                    gap: 8px;
                }

                .ai-toggle {
                    display: inline-flex;
                    align-items: center;
                    gap: 6px;
                    padding: 4px 12px;
                    border-radius: 8px;
                    border: 1px solid rgba(113, 113, 122, 0.2);
                    background: rgba(39, 39, 42, 0.6);
                    color: var(--text-secondary, #a1a1aa);
                    font-size: 12px;
                    cursor: pointer;
                    transition: all 0.2s;
                    align-self: flex-end;
                }

                .ai-toggle:hover {
                    border-color: rgba(99, 102, 241, 0.4);
                    color: var(--text-primary, #e4e4e7);
                }

                .ai-toggle.active {
                    background: linear-gradient(135deg, rgba(99, 102, 241, 0.15), rgba(139, 92, 246, 0.15));
                    border-color: rgba(99, 102, 241, 0.4);
                    color: #818cf8;
                }

                .toggle-icon {
                    font-size: 14px;
                }

                .toggle-label {
                    font-weight: 500;
                }

                .ai-panel {
                    display: flex;
                    flex-direction: column;
                    gap: 8px;
                    animation: fadeIn 0.2s ease-out;
                }

                @keyframes fadeIn {
                    from { opacity: 0; transform: translateY(-4px); }
                    to { opacity: 1; transform: translateY(0); }
                }

                .ai-input-form {
                    display: flex;
                    gap: 8px;
                    align-items: center;
                }

                .ai-input {
                    flex: 1;
                    padding: 10px 14px;
                    border-radius: 10px;
                    border: 1px solid rgba(99, 102, 241, 0.25);
                    background: rgba(24, 24, 27, 0.8);
                    color: var(--text-primary, #e4e4e7);
                    font-size: 14px;
                    outline: none;
                    transition: border-color 0.2s;
                }

                .ai-input:focus {
                    border-color: rgba(99, 102, 241, 0.5);
                    box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.1);
                }

                .ai-input::placeholder {
                    color: var(--text-tertiary, #52525b);
                }

                .ai-send-btn,
                .ai-cancel-btn {
                    padding: 10px 18px;
                    border-radius: 10px;
                    border: none;
                    font-size: 13px;
                    font-weight: 600;
                    cursor: pointer;
                    transition: all 0.2s;
                    white-space: nowrap;
                }

                .ai-send-btn {
                    background: linear-gradient(135deg, #6366f1, #8b5cf6);
                    color: white;
                }

                .ai-send-btn:hover:not(:disabled) {
                    box-shadow: 0 2px 12px rgba(99, 102, 241, 0.4);
                }

                .ai-send-btn:disabled {
                    opacity: 0.4;
                    cursor: not-allowed;
                }

                .ai-cancel-btn {
                    background: rgba(239, 68, 68, 0.15);
                    color: #f87171;
                    border: 1px solid rgba(239, 68, 68, 0.2);
                }

                .ai-cancel-btn:hover {
                    background: rgba(239, 68, 68, 0.25);
                }

                .ai-response {
                    padding: 12px 16px;
                    border-radius: 10px;
                    background: rgba(39, 39, 42, 0.5);
                    border: 1px solid rgba(63, 63, 70, 0.4);
                }

                .ai-error {
                    padding: 8px 12px;
                    border-radius: 8px;
                    background: rgba(239, 68, 68, 0.08);
                    border: 1px solid rgba(239, 68, 68, 0.15);
                    color: #f87171;
                    font-size: 12px;
                }
            `}</style>
        </div>
    );
};

export default AiSearchMode;
