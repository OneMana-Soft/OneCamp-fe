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
        <div ref={containerRef} className={`text-sm leading-relaxed text-foreground max-h-[300px] overflow-y-auto scrollbar-thin ${className}`}>
            <div className="whitespace-pre-wrap break-words">
                {displayedText.split("\n").map((line, i) => (
                    <React.Fragment key={i}>
                        {line}
                        {i < displayedText.split("\n").length - 1 && <br />}
                    </React.Fragment>
                ))}
                {isStreaming && <span className="inline-block animate-blink text-primary text-[12px] ml-[1px] align-text-bottom">▊</span>}
            </div>
        </div>
    );
};

export default StreamingText;
