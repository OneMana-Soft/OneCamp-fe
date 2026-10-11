"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import MarkdownMessage from "@/components/ai/MarkdownMessage";
import { cn } from "@/lib/utils/helpers/cn";
import { SPARK_PATH } from "@/components/ui/graphics/motifs";

/**
 * AI text as it arrives (design v3, hub.md AI6, `stream`).
 *
 * NO TYPEWRITER. This used to reveal the answer at 15 ms a character on a
 * timer, so the model could be done while the screen was still typing, and a
 * long answer re-rendered its Markdown once per character. Now the text on
 * screen is exactly the text received, on every render:
 *
 *   - the STABLE PREFIX (everything up to the last blank line outside a code
 *     fence) is rendered as Markdown, and re-parsed only when it grows;
 *   - the OPEN BLOCK after it is plain text, so a half-written "**" or table
 *     never flashes as broken formatting; it becomes Markdown when its
 *     paragraph closes;
 *   - each chunk that arrives softens in from .35 opacity over 160 ms
 *     (hub-stream-chunk), so nothing waits for an animation;
 *   - while streaming, a 10 px spark in the agent colour breathes at the end.
 *
 * Under reduced motion the chunks appear at full opacity and the caret stands
 * still (the global rule in app/globals.css).
 */

/** Where the stable prefix ends: after the last blank line outside a code fence. */
export function splitStable(text: string): { stable: string; tail: string } {
    let fence = false;
    let cut = -1;
    let i = 0;
    while (i < text.length) {
        if (text.startsWith("```", i) && (i === 0 || text[i - 1] === "\n")) {
            fence = !fence;
            i += 3;
            continue;
        }
        if (!fence && text[i] === "\n" && text[i + 1] === "\n") cut = i;
        i++;
    }
    if (cut < 0) return { stable: "", tail: text };
    return { stable: text.slice(0, cut), tail: text.slice(cut + 2) };
}

/** At most this many separately-fading chunks; older ones merge into one plain run. */
const MAX_CHUNKS = 24;

interface Seen {
    text: string;
    /** Offsets where a new chunk began, ascending. */
    marks: number[];
}

/**
 * The chunks of the open block (which starts at `tailStart` in the full text),
 * each a [start, end) range of the full text, keyed by its start so a chunk
 * keeps its element (and does not fade again) as more text arrives. Pure.
 */
export function tailChunks(marks: number[], tailStart: number, end: number): Array<[number, number]> {
    const starts = [tailStart, ...marks.filter((m) => m > tailStart && m < end)];
    const out: Array<[number, number]> = starts.map((s, i) => [s, i + 1 < starts.length ? starts[i + 1] : end]);
    if (out.length <= MAX_CHUNKS) return out;
    const keep = out.slice(-(MAX_CHUNKS - 1));
    return [[tailStart, keep[0][0]], ...keep];
}

/** The 10 px spark caret, breathing in the agent colour. */
export function SparkCaret({ className }: { className?: string }) {
    return (
        <svg
            aria-hidden
            data-spark-caret=""
            viewBox="0 0 24 24"
            className={cn("ml-0.5 inline-block size-2.5 fill-agent align-[-1px] hub-breathe", className)}
        >
            <path d={SPARK_PATH} />
        </svg>
    );
}

/**
 * The answer itself: Markdown for what is settled, plain fading chunks for the
 * paragraph still being written, the caret while it streams.
 */
export function StreamingAnswer({ text, isStreaming, className }: { text: string; isStreaming: boolean; className?: string }) {
    // Chunk boundaries from earlier renders: derived state, updated in render
    // when the text changes (React's "storing information from previous
    // renders"), so there is no effect and no timer.
    const [seen, setSeen] = useState<Seen>({ text, marks: [] });
    let marks = seen.marks;
    if (seen.text !== text) {
        marks = text.startsWith(seen.text) ? [...seen.marks, seen.text.length] : [];
        setSeen({ text, marks });
    }

    const { stable, tail } = useMemo(() => (isStreaming ? splitStable(text) : { stable: text, tail: "" }), [text, isStreaming]);
    const tailStart = text.length - tail.length;
    const chunks = tail ? tailChunks(marks, tailStart, text.length) : [];

    return (
        <div className={cn("min-w-0 break-words", className)} data-streaming={isStreaming ? "" : undefined}>
            {stable ? <MarkdownMessage content={stable} /> : null}
            {chunks.length > 0 || isStreaming ? (
                <p className={cn("whitespace-pre-wrap [overflow-wrap:anywhere]", stable && "mt-2.5")}>
                    {chunks.map(([s, e]) => (
                        <span key={s} className="hub-stream-chunk">
                            {text.slice(s, e)}
                        </span>
                    ))}
                    {isStreaming ? <SparkCaret /> : null}
                </p>
            ) : null}
        </div>
    );
}

interface StreamingTextProps {
    /** The text received so far. */
    text: string;
    /** Whether more is still arriving. */
    isStreaming: boolean;
    /** Classes for the scrolling container. */
    className?: string;
}

/**
 * The answer in a box of its own that keeps its newest line in view (Catch me
 * up, a summary on a card). The AI panel uses StreamingAnswer directly.
 */
const StreamingText: React.FC<StreamingTextProps> = ({ text, isStreaming, className = "" }) => {
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const el = containerRef.current;
        if (el && isStreaming) el.scrollTop = el.scrollHeight;
    }, [text, isStreaming]);

    return (
        <div ref={containerRef} className={cn("max-h-[300px] overflow-y-auto scrollbar-thin text-sm leading-relaxed text-foreground", className)}>
            <StreamingAnswer text={text} isStreaming={isStreaming} />
        </div>
    );
};

export default StreamingText;
