"use client"

import React, { useMemo, useState } from "react"
import { NodeViewWrapper } from "@tiptap/react"
import { FileCode } from "@/lib/icons"
import { cn } from "@/lib/utils/helpers/cn"
import { EmbedCard } from "@/components/minimal-tiptap/components/embed-card"

/**
 * Renders a unified diff as reviewable rows: additions, removals, hunk headers
 * and context, with old/new line numbers down the side.
 *
 * Dependency-free on purpose, matching SvgChart. A diff viewer library would
 * be a large dependency in every message bundle to draw what is fundamentally a
 * list of coloured rows.
 *
 * Long patches collapse. A 900-line patch pasted into a thread pushes the whole
 * conversation off screen, so anything past COLLAPSE_AFTER rows is hidden behind
 * a control that says how much more there is.
 */

const COLLAPSE_AFTER = 24

type RowKind = "add" | "del" | "hunk" | "meta" | "context"

interface Row {
    kind: RowKind
    text: string
    oldNo: number | null
    newNo: number | null
}

/** Parse a unified diff into numbered rows. Tolerant: anything unrecognised is context. */
export function parseUnifiedDiff(patch: string): Row[] {
    const rows: Row[] = []
    let oldNo = 0
    let newNo = 0

    for (const line of patch.split("\n")) {
        if (line.startsWith("@@")) {
            // @@ -oldStart,oldCount +newStart,newCount @@
            const m = /^@@+\s*-(\d+)(?:,\d+)?\s*\+(\d+)(?:,\d+)?\s*@@/.exec(line)
            if (m) {
                oldNo = parseInt(m[1], 10)
                newNo = parseInt(m[2], 10)
            }
            rows.push({ kind: "hunk", text: line, oldNo: null, newNo: null })
            continue
        }
        if (
            line.startsWith("diff --git") ||
            line.startsWith("index ") ||
            line.startsWith("--- ") ||
            line.startsWith("+++ ") ||
            line.startsWith("new file") ||
            line.startsWith("deleted file")
        ) {
            rows.push({ kind: "meta", text: line, oldNo: null, newNo: null })
            continue
        }
        if (line.startsWith("+")) {
            rows.push({ kind: "add", text: line.slice(1), oldNo: null, newNo: newNo++ })
            continue
        }
        if (line.startsWith("-")) {
            rows.push({ kind: "del", text: line.slice(1), oldNo: oldNo++, newNo: null })
            continue
        }
        const text = line.startsWith(" ") ? line.slice(1) : line
        rows.push({ kind: "context", text, oldNo: oldNo++, newNo: newNo++ })
    }
    return rows
}

/** Additions and removals, for the summary line. */
export function countChanges(rows: Row[]): { added: number; removed: number } {
    let added = 0
    let removed = 0
    for (const r of rows) {
        if (r.kind === "add") added++
        else if (r.kind === "del") removed++
    }
    return { added, removed }
}

// Status colour comes from a token, never a raw hue, and --success/--destructive
// already redefine themselves for dark mode, so no dark: variant is needed here.
// The row is tinted and the text stays foreground: at 10% tint, coloured text on
// top costs contrast for no added meaning, since the tint already says which
// side of the change this is.
const ROW_STYLES: Record<RowKind, string> = {
    add: "bg-[color-mix(in_oklab,var(--camp-moss-tint)_55%,transparent)]",
    del: "bg-[color-mix(in_oklab,var(--camp-berry-tint)_55%,transparent)]",
    hunk: "bg-sunken text-ink-3",
    meta: "text-ink-3",
    context: "text-ink-2",
}

const PREFIX: Record<RowKind, string> = {
    add: "+",
    del: "-",
    hunk: "",
    meta: "",
    context: " ",
}

export const DiffEmbedView: React.FC<{ node: { attrs: { diff?: string } } }> = ({ node }) => {
    const patch = node?.attrs?.diff || ""
    const rows = useMemo(() => (patch ? parseUnifiedDiff(patch) : []), [patch])
    const { added, removed } = useMemo(() => countChanges(rows), [rows])
    const [expanded, setExpanded] = useState(false)

    if (rows.length === 0) return null

    const hidden = Math.max(0, rows.length - COLLAPSE_AFTER)
    const shown = expanded ? rows : rows.slice(0, COLLAPSE_AFTER)

    return (
        <NodeViewWrapper className="my-2">
            <EmbedCard
                kind="diff"
                icon={FileCode}
                title="Proposed change"
                meta={<><span className="font-mono text-camp-moss-ink">+{added}</span> <span className="font-mono text-camp-berry-ink">−{removed}</span></>}
            >
                <div className="overflow-x-auto">
                    <table className="w-full border-collapse font-mono text-meta leading-5">
                        <tbody>
                            {shown.map((r, i) => (
                                <tr key={i} className={ROW_STYLES[r.kind]}>
                                    <td className="select-none px-2 text-right align-top tabular-nums text-ink-4">
                                        {r.oldNo ?? ""}
                                    </td>
                                    <td className="select-none px-2 text-right align-top tabular-nums text-ink-4">
                                        {r.newNo ?? ""}
                                    </td>
                                    <td className="whitespace-pre-wrap break-words px-2 align-top">
                                        <span className={cn("select-none", r.kind === "add" ? "text-camp-moss-ink" : r.kind === "del" ? "text-camp-berry-ink" : "opacity-60")}>{r.kind === "del" ? "−" : PREFIX[r.kind]}</span>
                                        {r.text}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                {hidden > 0 && (
                    <button
                        type="button"
                        onClick={() => setExpanded((v) => !v)}
                        className="w-full border-t border-line px-3.5 py-1.5 text-meta text-ink-3 hover:bg-hover hover:text-ink"
                    >
                        {expanded ? "Show less" : `Show ${hidden} more line${hidden === 1 ? "" : "s"}`}
                    </button>
                )}
            </EmbedCard>
        </NodeViewWrapper>
    )
}

