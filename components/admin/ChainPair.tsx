"use client"

/**
 * One audit row's place in the chain: where it sits, what it carried forward,
 * and what it produced.
 *
 * ONE COMPONENT BECAUSE IT IS ONE CLAIM. The governance drill rendered this, the
 * AI activity feed did not, and the two surfaces therefore told one story twice
 * in different words: the feed said an agent was stopped, the log held the proof,
 * and a reader had to take it on faith that they were the same event. An admin
 * could search the log by hand. A member cannot open the log at all, so the
 * claim being made to them about their own agent was unverifiable by them.
 *
 * BOTH HASHES, ALWAYS. A single fingerprint demonstrates nothing: anyone can
 * hash a row they just wrote. The LINK is the claim — this row carries the
 * previous row's fingerprint, so removing or editing anything behind it changes
 * what this row should have hashed to. Rendering one without the other would be
 * the reassuring half of a guarantee, which is worse than none.
 */

import React from "react"

/** A hash is identified by its ends; the middle is noise at this size. */
export function shortHash(hash?: string): string {
    if (!hash || hash.length <= 16) return hash || ""
    return `${hash.slice(0, 8)}…${hash.slice(-8)}`
}

export const ChainPair: React.FC<{
    seq?: number
    prevHash?: string
    entryHash?: string
    className?: string
}> = ({ seq, prevHash, entryHash, className }) => {
    // No entry hash means this did not come from the chain — an agent run, say.
    // Saying nothing is right; inventing a position would point at a row that
    // does not exist.
    if (!entryHash) return null

    return (
        <div
            className={`flex flex-wrap items-baseline gap-x-2 gap-y-0.5 font-mono text-[0.7rem] text-muted-foreground ${className || ""}`}
        >
            {seq ? <span className="tabular-nums">#{seq}</span> : null}
            <span title={prevHash || "nothing: this is the first entry in the chain"}>
                prev {prevHash ? shortHash(prevHash) : "— first entry"}
            </span>
            <span aria-hidden>→</span>
            <span title={entryHash}>this {shortHash(entryHash)}</span>
        </div>
    )
}

export default ChainPair
