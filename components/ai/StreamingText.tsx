"use client";

import React, { useState, useEffect, useRef } from "react";
import MarkdownMessage from "@/components/ai/MarkdownMessage";

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
            {/* Rendered as markdown, because that is what a model emits. Printing
                the characters put a literal "**Summary**", asterisks and all, on
                the home screen of the live demo for anyone to see. The renderer
                builds React nodes rather than HTML, so there
                is no injection surface, and it tolerates the half-finished tokens
                this component necessarily hands it mid-animation: an unmatched
                "**" renders as itself until its partner arrives. */}
            <div className="break-words">
                <MarkdownMessage content={displayedText} />
                {isStreaming && <span className="inline-block animate-blink text-primary text-xs ml-[1px] align-text-bottom">▊</span>}
            </div>
        </div>
    );
};

export default StreamingText;
