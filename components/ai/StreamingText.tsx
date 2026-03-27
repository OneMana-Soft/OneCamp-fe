"use client";

import React, { useState, useEffect, useRef } from "react";

interface StreamingTextProps {
    /** Text content to display with typewriter effect */
    text: string;
    /** Whether the text is still being streamed */
    isStreaming: boolean;
    /** Optional CSS class for the container */
    className?: string;
    /** Speed of typewriter effect in ms per character (default: 15) */
    speed?: number;
}

/**
 * StreamingText — Renders AI-generated text with a typewriter cursor animation.
 * Reusable component for all AI features (Catch Me Up, AI Search, etc.)
 */
const StreamingText: React.FC<StreamingTextProps> = ({
    text,
    isStreaming,
    className = "",
    speed = 15,
}) => {
    const [displayedLength, setDisplayedLength] = useState(0);
    const containerRef = useRef<HTMLDivElement>(null);
    const prevTextLengthRef = useRef(0);

    // Animate new characters as they arrive
    useEffect(() => {
        if (text.length > prevTextLengthRef.current) {
            // New content arrived — animate from where we left off
            const startFrom = prevTextLengthRef.current;
            let current = startFrom;

            const interval = setInterval(() => {
                current++;
                setDisplayedLength(current);

                if (current >= text.length) {
                    clearInterval(interval);
                }
            }, speed);

            prevTextLengthRef.current = text.length;

            return () => clearInterval(interval);
        }
    }, [text, speed]);

    // Auto-scroll to bottom as text grows
    useEffect(() => {
        if (containerRef.current) {
            containerRef.current.scrollTop = containerRef.current.scrollHeight;
        }
    }, [displayedLength]);

    const displayedText = text.slice(0, displayedLength);

    return (
        <div ref={containerRef} className={`ai-streaming-text ${className}`}>
            <div className="ai-text-content">
                {displayedText.split("\n").map((line, i) => (
                    <React.Fragment key={i}>
                        {line}
                        {i < displayedText.split("\n").length - 1 && <br />}
                    </React.Fragment>
                ))}
                {isStreaming && <span className="ai-cursor">▊</span>}
            </div>

            <style jsx>{`
                .ai-streaming-text {
                    font-size: 14px;
                    line-height: 1.6;
                    color: var(--text-primary, #e4e4e7);
                    max-height: 300px;
                    overflow-y: auto;
                    scrollbar-width: thin;
                }

                .ai-text-content {
                    white-space: pre-wrap;
                    word-break: break-word;
                }

                .ai-cursor {
                    display: inline-block;
                    animation: blink 1s step-end infinite;
                    color: var(--accent-primary, #818cf8);
                    font-size: 12px;
                    margin-left: 1px;
                    vertical-align: text-bottom;
                }

                @keyframes blink {
                    50% {
                        opacity: 0;
                    }
                }
            `}</style>
        </div>
    );
};

export default StreamingText;
