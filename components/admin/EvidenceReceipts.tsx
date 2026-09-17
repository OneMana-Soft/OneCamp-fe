"use client"

/**
 * The months this workspace has already fingerprinted.
 *
 * WHY A LIST AND NOT A BUTTON. The evidence pack can be generated at any time,
 * and a pack generated later is a weaker document than one generated then:
 * retention redacts row content once it passes the window, so a rebuild verified
 * fewer rows and took more of them at their word, and reports "verified" either
 * way. A receipt is taken while the rows are intact.
 *
 * What that turns the output into is the point. One pack is a document somebody
 * asked for. Fourteen receipts is a chain of custody, accruing on its own, and a
 * regeneration that disagrees with one of them is a finding rather than a
 * silence. This is the part of the product that gets more valuable by being left
 * alone.
 *
 * SILENT WHEN EMPTY. A new workspace has no completed month yet, and a panel
 * saying "no receipts" would read as something failing rather than as a month
 * that has not finished.
 */

import React, { useEffect, useState } from "react"
import Link from "next/link"
import { ShieldCheck, ShieldAlert } from "@/lib/icons"
import {
    listEvidenceReceipts,
    evidencePageHref,
    receiptLabel,
    type EvidenceReceipt,
} from "@/services/settingsService"

/** The first eight of a digest, which is what a person compares by eye. */
export function shortFingerprint(hash: string): string {
    return hash ? hash.slice(0, 8) : ""
}

/**
 * What the receipt says about its own verification, in words.
 *
 * Redacted rows are named rather than folded in, because "I verified this row"
 * and "I took this row's word for it" are different statements and the server
 * reports them separately for that reason.
 */
export function receiptSummary(r: Pick<EvidenceReceipt, "chain_ok" | "chain_checked" | "chain_redacted">): string {
    if (!r.chain_ok) return "the chain did not verify"
    const rows = `${r.chain_checked} row${r.chain_checked === 1 ? "" : "s"} verified`
    return r.chain_redacted > 0 ? `${rows}, ${r.chain_redacted} taken at their word` : rows
}

export const EvidenceReceipts: React.FC = () => {
    const [receipts, setReceipts] = useState<EvidenceReceipt[]>([])

    useEffect(() => {
        let cancelled = false
        listEvidenceReceipts()
            .then((r) => {
                if (!cancelled) setReceipts(r)
            })
            .catch(() => {
                // The audit card must not fail because a history panel could not load.
                if (!cancelled) setReceipts([])
            })
        return () => {
            cancelled = true
        }
    }, [])

    if (receipts.length === 0) return null

    return (
        <section className="mt-5 border-t border-border/60 pt-4">
            <h3 className="text-sm font-medium">Monthly receipts</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
                What each completed month&apos;s pack said, recorded while its rows were intact. A pack
                rebuilt later over the same month is a weaker document, and this is how you can tell.
            </p>
            <ul className="mt-3 flex flex-col divide-y divide-border/60">
                {receipts.map((r) => (
                    <li key={r.id}>
                        <Link
                            href={evidencePageHref(r)}
                            className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 -mx-2 px-2 rounded-md hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                            {r.chain_ok ? (
                                <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-success" aria-hidden="true" />
                            ) : (
                                <ShieldAlert className="h-3.5 w-3.5 shrink-0 text-destructive" aria-hidden="true" />
                            )}
                            <span className="text-sm font-medium">{receiptLabel(r)}</span>
                            <span className="text-xs text-muted-foreground">{receiptSummary(r)}</span>
                            <span className="ml-auto font-mono text-xs text-muted-foreground">
                                {shortFingerprint(r.pack_fingerprint)}
                            </span>
                        </Link>
                    </li>
                ))}
            </ul>
        </section>
    )
}

export default EvidenceReceipts
