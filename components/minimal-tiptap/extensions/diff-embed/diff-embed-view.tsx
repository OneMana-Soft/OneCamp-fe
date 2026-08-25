"use client"

import React, { useMemo, useState } from "react"
import { NodeViewWrapper } from "@tiptap/react"

/**
 * Renders a unified diff as reviewable rows: additions, removals, hunk headers
 * and context, with old/new line numbers down the side.
 *
 * Dependency-free on purpose, matching AgentChart. A diff viewer library would
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
    add: "bg-success/10",
    del: "bg-destructive/10",
    hunk: "bg-muted text-muted-foreground",
    meta: "text-muted-foreground",
    context: "text-foreground/80",
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
            <div className="overflow-hidden rounded-lg border border-border bg-card">
                <div className="flex items-center gap-3 border-b border-border/60 px-3 py-1.5 text-xs">
                    <span className="font-medium text-muted-foreground">Proposed change</span>
                    <span className="font-mono text-success">+{added}</span>
                    <span className="font-mono text-destructive">-{removed}</span>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full border-collapse font-mono text-xs">
                        <tbody>
                            {shown.map((r, i) => (
                                <tr key={i} className={ROW_STYLES[r.kind]}>
                                    <td className="select-none border-r border-border/40 px-2 text-right align-top tabular-nums text-muted-foreground/70">
                                        {r.oldNo ?? ""}
                                    </td>
                                    <td className="select-none border-r border-border/40 px-2 text-right align-top tabular-nums text-muted-foreground/70">
                                        {r.newNo ?? ""}
                                    </td>
                                    <td className="whitespace-pre-wrap break-words px-2 align-top">
                                        <span className="select-none opacity-60">{PREFIX[r.kind]}</span>
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
                        className="w-full border-t border-border/60 px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted/50"
                    >
                        {expanded ? "Show less" : `Show ${hidden} more line${hidden === 1 ? "" : "s"}`}
                    </button>
                )}
            </div>
        </NodeViewWrapper>
    )
}

export default DiffEmbedView
