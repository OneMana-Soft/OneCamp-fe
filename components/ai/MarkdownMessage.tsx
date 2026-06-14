"use client";

import React from "react";
import { cn } from "@/lib/utils/helpers/cn";

/**
 * MarkdownMessage — a tiny, dependency-free, safe markdown renderer tuned for
 * the AI chat bubble. It builds React nodes directly (never dangerouslySetInnerHTML),
 * so there is no XSS surface, and it is resilient to partial/incomplete markdown
 * that arrives mid-stream (unmatched tokens simply render as literal text).
 *
 * Supported: headings, bold, italic, inline code, fenced code blocks, links,
 * bare URLs, unordered/ordered lists, blockquotes and horizontal rules.
 */

// Only allow hrefs we trust — http(s), mailto, and in-app relative links.
const SAFE_HREF = /^(https?:\/\/|mailto:|\/)/i;

function sanitizeHref(href: string): string | null {
    const trimmed = href.trim();
    return SAFE_HREF.test(trimmed) ? trimmed : null;
}

// Inline token matcher. Order matters: code first (so formatting inside code is
// ignored), then links, then bold (**/__) before italic (*/_), then bare URLs.
const INLINE_RE =
    /(`[^`]+`)|(\[[^\]]+\]\([^)\s]+\))|(\*\*[\s\S]+?\*\*)|(__[\s\S]+?__)|(\*[^*\n]+?\*)|(_[^_\n]+?_)|(https?:\/\/[^\s)]+)/;

function parseInline(text: string, keyPrefix: string): React.ReactNode[] {
    const out: React.ReactNode[] = [];
    let rest = text;
    let n = 0;

    while (rest.length > 0) {
        const m = rest.match(INLINE_RE);
        if (!m || m.index === undefined) {
            out.push(rest);
            break;
        }

        if (m.index > 0) out.push(rest.slice(0, m.index));

        const token = m[0];
        const key = `${keyPrefix}-${n++}`;

        if (token.startsWith("`")) {
            out.push(
                <code
                    key={key}
                    className="px-1 py-0.5 rounded bg-foreground/10 font-mono text-[0.85em] [overflow-wrap:anywhere]"
                >
                    {token.slice(1, -1)}
                </code>
            );
        } else if (token.startsWith("[")) {
            const link = token.match(/^\[([^\]]+)\]\(([^)\s]+)\)$/);
            const href = link ? sanitizeHref(link[2]) : null;
            if (link && href) {
                const external = /^https?:/i.test(href);
                out.push(
                    <a
                        key={key}
                        href={href}
                        {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                        className="text-primary underline underline-offset-2 hover:opacity-80 [overflow-wrap:anywhere]"
                    >
                        {link[1]}
                    </a>
                );
            } else {
                out.push(link ? link[1] : token);
            }
        } else if (token.startsWith("**") || token.startsWith("__")) {
            out.push(
                <strong key={key} className="font-semibold">
                    {parseInline(token.slice(2, -2), key)}
                </strong>
            );
        } else if (token.startsWith("*") || token.startsWith("_")) {
            out.push(
                <em key={key} className="italic">
                    {parseInline(token.slice(1, -1), key)}
                </em>
            );
        } else {
            // bare URL
            out.push(
                <a
                    key={key}
                    href={token}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary underline underline-offset-2 hover:opacity-80 [overflow-wrap:anywhere]"
                >
                    {token}
                </a>
            );
        }

        rest = rest.slice(m.index + token.length);
    }

    return out;
}

const HEADING_SIZES = [
    "text-base font-semibold",
    "text-sm font-semibold",
    "text-[13px] font-semibold",
    "text-[13px] font-semibold",
    "text-[13px] font-semibold",
    "text-[13px] font-semibold",
];

const HR_RE = /^\s*([-*_])\s*(\1\s*){2,}$/;

function parseBlocks(src: string): React.ReactNode[] {
    const lines = src.replace(/\r\n/g, "\n").split("\n");
    const blocks: React.ReactNode[] = [];
    let i = 0;
    let key = 0;

    while (i < lines.length) {
        const line = lines[i];

        if (line.trim() === "") {
            i++;
            continue;
        }

        // Fenced code block
        const fence = line.match(/^```(\w*)\s*$/);
        if (fence) {
            const code: string[] = [];
            i++;
            while (i < lines.length && !/^```\s*$/.test(lines[i])) {
                code.push(lines[i]);
                i++;
            }
            if (i < lines.length) i++; // consume closing fence
            blocks.push(
                <pre
                    key={key++}
                    className="my-0.5 p-2.5 rounded-lg bg-foreground/[0.06] border border-border/60 overflow-x-auto text-xs font-mono leading-relaxed"
                >
                    <code>{code.join("\n")}</code>
                </pre>
            );
            continue;
        }

        // Heading
        const heading = line.match(/^(#{1,6})\s+(.*)$/);
        if (heading) {
            const level = heading[1].length;
            blocks.push(
                <div
                    key={key++}
                    className={cn(HEADING_SIZES[level - 1], "text-foreground mt-1 first:mt-0")}
                >
                    {parseInline(heading[2], `h${key}`)}
                </div>
            );
            i++;
            continue;
        }

        // Horizontal rule
        if (HR_RE.test(line)) {
            blocks.push(<hr key={key++} className="my-1 border-border" />);
            i++;
            continue;
        }

        // Blockquote
        if (/^>\s?/.test(line)) {
            const quote: string[] = [];
            while (i < lines.length && /^>\s?/.test(lines[i])) {
                quote.push(lines[i].replace(/^>\s?/, ""));
                i++;
            }
            blocks.push(
                <blockquote
                    key={key++}
                    className="border-l-2 border-border pl-3 text-muted-foreground italic"
                >
                    {parseInline(quote.join(" "), `q${key}`)}
                </blockquote>
            );
            continue;
        }

        // Unordered list
        if (/^\s*[-*+]\s+/.test(line)) {
            const items: React.ReactNode[] = [];
            while (i < lines.length && /^\s*[-*+]\s+/.test(lines[i])) {
                const item = lines[i].replace(/^\s*[-*+]\s+/, "");
                items.push(
                    <li key={items.length} className="pl-0.5 [overflow-wrap:anywhere]">
                        {parseInline(item, `uli${key}-${items.length}`)}
                    </li>
                );
                i++;
            }
            blocks.push(
                <ul
                    key={key++}
                    className="list-disc pl-5 flex flex-col gap-0.5 marker:text-muted-foreground"
                >
                    {items}
                </ul>
            );
            continue;
        }

        // Ordered list
        if (/^\s*\d+\.\s+/.test(line)) {
            const items: React.ReactNode[] = [];
            while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
                const item = lines[i].replace(/^\s*\d+\.\s+/, "");
                items.push(
                    <li key={items.length} className="pl-0.5 [overflow-wrap:anywhere]">
                        {parseInline(item, `oli${key}-${items.length}`)}
                    </li>
                );
                i++;
            }
            blocks.push(
                <ol
                    key={key++}
                    className="list-decimal pl-5 flex flex-col gap-0.5 marker:text-muted-foreground"
                >
                    {items}
                </ol>
            );
            continue;
        }

        // Paragraph — gather consecutive lines until a blank line or a new block.
        const para: string[] = [];
        while (
            i < lines.length &&
            lines[i].trim() !== "" &&
            !/^```/.test(lines[i]) &&
            !/^(#{1,6})\s+/.test(lines[i]) &&
            !/^>\s?/.test(lines[i]) &&
            !/^\s*[-*+]\s+/.test(lines[i]) &&
            !/^\s*\d+\.\s+/.test(lines[i]) &&
            !HR_RE.test(lines[i])
        ) {
            para.push(lines[i]);
            i++;
        }

        const paraNodes: React.ReactNode[] = [];
        para.forEach((pl, idx) => {
            if (idx > 0) paraNodes.push(<br key={`br-${idx}`} />);
            paraNodes.push(...parseInline(pl, `p${key}-${idx}`));
        });
        blocks.push(
            <p key={key++} className="leading-relaxed [overflow-wrap:anywhere]">
                {paraNodes}
            </p>
        );
    }

    return blocks;
}

interface MarkdownMessageProps {
    content: string;
    className?: string;
}

const MarkdownMessage: React.FC<MarkdownMessageProps> = ({ content, className }) => {
    const blocks = React.useMemo(() => parseBlocks(content), [content]);
    return (
        <div className={cn("flex flex-col gap-2 min-w-0 [overflow-wrap:anywhere]", className)}>
            {blocks}
        </div>
    );
};

export default MarkdownMessage;
