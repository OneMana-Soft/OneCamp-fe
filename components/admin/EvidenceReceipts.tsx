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
import { SettingsSection } from "@/components/ui/settingsSection"
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
 * How much this window actually contains, from the manifest the pack emitted.
 *
 * NOT the chain verification's count. That one walks the whole log and is
 * therefore the same number on every month's receipt, which reads as "August had
 * 17 rows" when it means "the log has 17 rows and they verify". The window's own
 * total comes from the manifest, and totals every section including one this
 * code has never heard of.
 *
 * Contextual sections are left out. retention_policy describes the deployment
 * and contributes one row to every window forever, so counting it made nine
 * consecutive empty months read as months with something in them.
 */
export function receiptRows(r: Pick<EvidenceReceipt, "manifest">): number {
    return (r.manifest ?? [])
        .filter((m) => !m.contextual)
        .reduce((n, m) => n + (m.rows ?? 0), 0)
}

/**
 * What the receipt says, in words: what was in the window, then whether the log
 * it came from verifies.
 *
 * Redacted rows are named rather than folded in, because "I verified this row"
 * and "I took this row's word for it" are different statements and the server
 * reports them separately for that reason.
 */
export function receiptSummary(
    r: Pick<EvidenceReceipt, "chain_ok" | "chain_checked" | "chain_redacted" | "manifest">,
): string {
    const n = receiptRows(r)
    const inWindow = `${n} row${n === 1 ? "" : "s"}`
    if (!r.chain_ok) return `${inWindow}, and the chain did not verify`
    const verified = r.chain_redacted > 0
        ? `log verified, ${r.chain_redacted} taken at their word`
        : "log verified"
    return `${inWindow}, ${verified}`
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

    // A section inside the audit log's section, at its level 3: it was a block
    // under a rule inside the log's card, a box in a box.
    return (
        <SettingsSection
            level={3}
            className="pt-5"
            title="Monthly receipts"
            description="What each completed month's pack said, recorded while its rows were intact. A pack rebuilt later over the same month is a weaker document, and this is how you can tell."
        >
            <ul aria-label="Monthly receipts" className="divide-y divide-border rounded-lg border border-border">
                {receipts.map((r) => (
                    <li key={r.id}>
                        <Link
                            href={evidencePageHref(r)}
                            className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 transition-colors hover:bg-highlight focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/70"
                        >
                            {r.chain_ok ? (
                                <ShieldCheck className="size-4 shrink-0 text-success-ink" aria-hidden="true" />
                            ) : (
                                <ShieldAlert className="size-4 shrink-0 text-danger-ink" aria-hidden="true" />
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
        </SettingsSection>
    )
}

export default EvidenceReceipts
