"use client"

// BlockKitCard renders a Slack-compatible Block Kit subset into React, with
// interactive buttons/selects wired to the command interaction round-trip.
// It mirrors the design language of ActionConfirmation (the AI action card)
// so command output feels native. XSS-safe: text is rendered as plain React
// children (mrkdwn gets a minimal, safe inline transform), never innerHTML.

import React from "react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils/helpers/cn"
import type { Block, BlockElement, BlockText } from "@/types/command"

interface BlockKitCardProps {
    blocks: Block[]
    onAction?: (el: BlockElement) => void
    busyActionId?: string | null
    className?: string
}

// renderMrkdwn applies a tiny, safe subset of Slack mrkdwn (*bold*, _italic_,
// `code`) as React nodes — no innerHTML, so there is no injection surface.
function renderMrkdwn(text: string): React.ReactNode[] {
    const out: React.ReactNode[] = []
    const re = /(\*[^*]+\*)|(_[^_]+_)|(`[^`]+`)/g
    let last = 0
    let m: RegExpExecArray | null
    let key = 0
    while ((m = re.exec(text)) !== null) {
        if (m.index > last) out.push(text.slice(last, m.index))
        const tok = m[0]
        if (tok.startsWith("*")) {
            out.push(<strong key={key++} className="font-semibold">{tok.slice(1, -1)}</strong>)
        } else if (tok.startsWith("_")) {
            out.push(<em key={key++} className="italic">{tok.slice(1, -1)}</em>)
        } else {
            out.push(
                <code key={key++} className="px-1 py-0.5 rounded bg-foreground/10 font-mono text-[0.85em]">
                    {tok.slice(1, -1)}
                </code>,
            )
        }
        last = m.index + tok.length
    }
    if (last < text.length) out.push(text.slice(last))
    return out
}

function renderText(t?: BlockText): React.ReactNode {
    if (!t) return null
    if (t.type === "mrkdwn") return <span className="whitespace-pre-wrap">{renderMrkdwn(t.text)}</span>
    return <span className="whitespace-pre-wrap">{t.text}</span>
}

const BlockKitCard: React.FC<BlockKitCardProps> = ({ blocks, onAction, busyActionId, className }) => {
    if (!blocks || blocks.length === 0) return null

    return (
        <div className={cn("flex flex-col gap-2 rounded-xl border border-border bg-card p-3 shadow-sm", className)}>
            {blocks.map((block, i) => {
                switch (block.type) {
                    case "header":
                        return (
                            <div key={i} className="text-sm font-semibold text-foreground">
                                {renderText(block.text)}
                            </div>
                        )
                    case "section":
                        return (
                            <div key={i} className="text-[13px] leading-relaxed text-foreground/90">
                                {renderText(block.text)}
                                {block.fields && block.fields.length > 0 && (
                                    <div className="mt-1.5 grid grid-cols-2 gap-2">
                                        {block.fields.map((f, fi) => (
                                            <div key={fi} className="text-[12px] text-muted-foreground">
                                                {renderText(f)}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )
                    case "context":
                        return (
                            <div key={i} className="text-[11px] text-muted-foreground">
                                {renderText(block.text)}
                            </div>
                        )
                    case "divider":
                        return <hr key={i} className="border-border/60" />
                    case "image":
                        return (
                            <div key={i} className="overflow-hidden rounded-lg bg-muted/40">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                    src={block.image_url}
                                    alt={block.alt_text || "image"}
                                    className="w-full max-h-80 object-contain transition-opacity duration-150"
                                    loading="eager"
                                />
                            </div>
                        )
                    case "actions":
                        return (
                            <div key={i} className="flex flex-wrap gap-2">
                                {(block.elements || []).map((el, ei) => {
                                    const isBusy = busyActionId === el.action_id
                                    if (el.type === "button") {
                                        const variant: "default" | "destructive" | "outline" =
                                            el.style === "primary" ? "default"
                                            : el.style === "danger" ? "destructive"
                                            : "outline"
                                        if (el.url) {
                                            return (
                                                <a
                                                    key={ei}
                                                    href={el.url}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="inline-flex"
                                                >
                                                    <Button size="sm" variant={variant} className="h-8">
                                                        {el.text?.text || "Open"}
                                                    </Button>
                                                </a>
                                            )
                                        }
                                        return (
                                            <Button
                                                key={ei}
                                                size="sm"
                                                variant={variant}
                                                className="h-8"
                                                disabled={isBusy}
                                                onClick={() => onAction?.(el)}
                                            >
                                                {isBusy ? "…" : el.text?.text || el.action_id}
                                            </Button>
                                        )
                                    }
                                    if (el.type === "select") {
                                        return (
                                            <select
                                                key={ei}
                                                className="h-8 rounded-md border border-input bg-background px-2 text-sm"
                                                disabled={isBusy}
                                                onChange={(e) => onAction?.({ ...el, value: e.target.value })}
                                                defaultValue=""
                                            >
                                                <option value="" disabled>
                                                    {el.text?.text || "Select…"}
                                                </option>
                                                {(el.options || []).map((o, oi) => (
                                                    <option key={oi} value={o.value}>
                                                        {o.text}
                                                    </option>
                                                ))}
                                            </select>
                                        )
                                    }
                                    return null
                                })}
                            </div>
                        )
                    default:
                        return null
                }
            })}
        </div>
    )
}

export default BlockKitCard
