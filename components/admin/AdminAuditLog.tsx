"use client"

// AdminAuditLog — a compliance-grade viewer of admin configuration changes:
// who changed which sensitive setting, when, and from where. Secret values are
// never recorded server-side, so this is safe to surface to any admin.

import React, { useEffect, useState } from "react"
import Link from "next/link"
import EvidenceReceipts from "@/components/admin/EvidenceReceipts"
import { PlanLockedNotice } from "@/components/admin/PlanLockedNotice"
import { usePlan } from "@/hooks/usePlan"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { RefreshCw, ShieldCheck, Download, FileArchive } from "@/lib/icons"
import { useToast } from "@/hooks/use-toast"
import { parseAuditMetadata, auditReason } from "@/lib/utils/auditMetadata"
import { apiErrorMessage } from "@/lib/utils/apiError"
import { fullDateTime, shortDateTime } from "@/lib/utils/date/shortDate"
import { ErrorState } from "@/components/ui/error-state"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils/helpers/cn"
import { HUE_CLASS } from "@/components/ui/graphics/hues"
import type { CampHue } from "@/lib/campHue"
import {
    getAdminAuditLog,
    verifyAuditLog,
    exportAuditLog,
    downloadEvidencePack,
    entryInitiator,
    UNATTENDED,
    type AuditEntry,
    type AuditVerifyResult,
    type InitiatorKind,
} from "@/services/settingsService"

// The categories name things, so their colours are identity, not states: one
// fixed camp hue per category, tint behind ink (AA on every pair), never the
// accent and never a raw Tailwind hue. Agent is dusk, as agents are wherever
// the admin page groups them. Status words (Refused, nobody watching) keep
// their status tokens.
const CATEGORY_HUE: Record<string, CampHue> = {
    settings: "sun",
    integration: "lake",
    auth: "sky",
    app: "moss",
    security: "berry",
    // Agent activity: an agent acting for a person, including calls arriving over
    // MCP from outside the workspace. Its own hue because "was this a human or
    // an agent on their behalf" is the first thing an auditor scans for.
    agent: "dusk",
}

const CHIP = "inline-flex shrink-0 items-center rounded-sm px-1.5 py-0.5 text-2xs font-medium capitalize"

// Unknown categories still render, in a neutral style. A category the server starts
// recording is more useful shown plainly than omitted, and omitting it is precisely
// how `agent` entries became invisible in this view.
function categoryChipClass(category: string): string {
    const hue = CATEGORY_HUE[category]
    return hue ? cn(CHIP, HUE_CLASS[hue], "bg-hue-tint text-hue-ink") : cn(CHIP, "bg-muted text-muted-foreground")
}

// The filter in use is marked in ink on the highlight step, not in the accent:
// the accent is the one primary action on this card (Evidence pack), and a
// filled orange chip beside it made two.
const FILTER_ON = "bg-highlight text-foreground border-foreground/25 hover:bg-highlight"
const FILTER_OFF = "text-muted-foreground"

// The filter list the component starts with, replaced by whatever the server
// reports. Kept as a seed so the buttons render on the very first paint instead of
// appearing a moment later.
const SEED_CATEGORIES = ["settings", "integration", "auth", "app", "security", "agent"]

/**
 * One audit entry.
 *
 * SHOWS THE METADATA, which this view fetched and ignored until now. That blob is where the
 * REASON lives, and the reasons are written to be acted on — "the originating person has no
 * grant on this private doc" is the sentence a reviewer opened the log for, and it was only
 * reachable by exporting CSV.
 *
 * The reason is inline, not behind the disclosure: scanning a list of refusals and their
 * causes is the common task, and burying the cause one click deep turns that into one click
 * per row. Everything else is one keystroke away in a native <details>, which is keyboard
 * and screen-reader accessible without any state of its own.
 */
function AuditRow({ entry, unattendedKinds }: { entry: AuditEntry; unattendedKinds: Set<string> }) {
    const meta = parseAuditMetadata(entry.metadata)
    const reason = auditReason(entry.metadata)
    const initiator = entryInitiator(entry)
    // Fields worth expanding for: everything except the reason, which is already shown.
    const detailFields = meta?.fields.filter((f) => !f.isReason) ?? []
    const hasDetail = Boolean(meta && (meta.malformed || detailFields.length > 0))

    return (
        <div className="flex items-start gap-3 px-2 py-2.5">
            <span className={categoryChipClass(entry.category)}>{entry.category}</span>
            <div className="min-w-0 flex-1">
                <p className="text-sm text-foreground">{entry.summary}</p>

                {reason && (
                    // Never colour-only: a refusal is marked by the word "Refused" as well
                    // as the tone, so the distinction survives colour blindness and a
                    // greyscale print of an audit export.
                    <p className="mt-1 text-xs">
                        {meta?.refused && (
                            <span className="font-medium text-danger-ink">Refused: </span>
                        )}
                        <span className={meta?.refused ? "text-danger-ink/90" : "text-muted-foreground"}>
                            {reason}
                        </span>
                    </p>
                )}

                <p className="text-2xs text-muted-foreground mt-0.5">
                    {/* An agent's row already carries the authorising person in
                        actor_email, which on its own reads as though they did it
                        themselves. This is the word that tells the two apart, and
                        it is omitted rather than defaulted on older entries: the
                        field did not exist when they were written, and guessing
                        "human" would put an assertion into a compliance record
                        that nothing supports. */}
                    {entry.actor_kind === "agent" && <span className="text-warning-ink">agent · </span>}
                    {/* WHO STARTED IT, as distinct from whose authority it carried. A
                        row whose initiator nobody watched says so in a word, because
                        "ran on Priya's authority" and "ran while Priya was asleep" are
                        the same actor and different facts. Omitted, not defaulted, on
                        a row that never said. */}
                    {initiator && (
                        <span className={unattendedKinds.has(initiator) ? "text-warning-ink" : ""}>
                            {unattendedKinds.has(initiator) ? `${initiator}, nobody watching · ` : `${initiator} · `}
                        </span>
                    )}
                    {entry.actor_kind === "system" && <span>system · </span>}
                    {entry.actor_email || "Unknown"}
                    {entry.ip_address ? ` · ${entry.ip_address}` : ""}
                    {" · "}
                    <AuditTime iso={entry.created_at} />
                </p>

                {hasDetail && (
                    <details className="mt-1.5 group">
                        <summary className="cursor-pointer text-2xs text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded w-fit">
                            <span className="group-open:hidden">Show details</span>
                            <span className="hidden group-open:inline">Hide details</span>
                        </summary>
                        {meta?.malformed ? (
                            // Surfaced rather than dropped: an unparseable blob is still
                            // evidence, and hiding it would lose it entirely.
                            <pre className="mt-1.5 overflow-x-auto rounded bg-muted/40 p-2 text-2xs text-muted-foreground">
                                {meta.raw}
                            </pre>
                        ) : (
                            <dl className="mt-1.5 grid grid-cols-[minmax(0,9rem)_minmax(0,1fr)] gap-x-3 gap-y-1 rounded bg-muted/40 p-2 text-2xs">
                                {detailFields.map((f) => (
                                    <React.Fragment key={f.key}>
                                        <dt className="text-muted-foreground">{f.label}</dt>
                                        <dd className="font-mono text-foreground [overflow-wrap:anywhere]">{f.value}</dd>
                                    </React.Fragment>
                                ))}
                            </dl>
                        )}
                    </details>
                )}
            </div>
        </div>
    )
}

const ALL = "all"
/** Entries read at a time; a page that comes back shorter was the last. */
const PAGE = 50

/**
 * When an entry was written, in the app's one format ("10 Oct, 8:42 AM"), with
 * the whole date in its tooltip. It was the browser's locale ("Oct 10, 08:42
 * AM"), so one record read differently on each auditor's machine.
 */
function AuditTime({ iso }: { iso: string }) {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return <>{iso}</>
    return (
        <time dateTime={iso} title={fullDateTime(d)} className="tabular-nums">
            {shortDateTime(d)}
        </time>
    )
}

/** The rows the log is about to show, so nothing moves when they arrive. */
function AuditSkeleton() {
    return (
        <div aria-busy="true" aria-label="Loading the audit log" className="divide-y divide-border/60">
            {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex items-start gap-3 px-2 py-2.5" aria-hidden="true">
                    <Skeleton className="h-5 w-16 shrink-0" />
                    <div className="min-w-0 flex-1 space-y-1.5">
                        <Skeleton className={cn("h-3.5", i % 2 === 0 ? "w-3/5" : "w-1/2")} />
                        <Skeleton className="h-3 w-2/5" />
                    </div>
                </div>
            ))}
        </div>
    )
}

export default function AdminAuditLog() {
    const [entries, setEntries] = useState<AuditEntry[]>([])
    const [loading, setLoading] = useState(true)
    // A failed read is not an empty log: said as such, with Try again.
    const [failed, setFailed] = useState(false)
    // Whether the server may hold entries past the ones shown.
    const [hasOlder, setHasOlder] = useState(false)
    const [loadingOlder, setLoadingOlder] = useState(false)
    const [filter, setFilter] = useState<string>(ALL)
    const [categories, setCategories] = useState<string[]>(SEED_CATEGORIES)
    // The one filter an auditor reaches for first: what ran on somebody's
    // authority while they were away. A toggle rather than one chip per kind,
    // because the question is binary and the kinds are served alongside so a
    // row can still name its own.
    const [unattendedOnly, setUnattendedOnly] = useState(false)
    const [initiators, setInitiators] = useState<InitiatorKind[]>([])
    const unattendedKinds = new Set(initiators.filter((k) => k.unattended).map((k) => k.kind))
    const { toast } = useToast()
    const [verifying, setVerifying] = useState(false)
    const [verifyResult, setVerifyResult] = useState<AuditVerifyResult | null>(null)
    const [exporting, setExporting] = useState(false)
    // Export and the evidence pack are a company control (the free plan leaves
    // them out); the log itself and verifying its chain are on every plan.
    const plan = usePlan()
    const exportLocked = plan.isLocked("audit_export")

    const load = (cat: string, unattended: boolean = unattendedOnly) => {
        setLoading(true)
        setFailed(false)
        getAdminAuditLog(cat === ALL ? undefined : cat, PAGE, 0, unattended ? UNATTENDED : undefined)
            .then((page) => {
                setEntries(page.entries)
                setHasOlder(page.entries.length === PAGE)
                // Only replace the filter list when the server actually sent one, so
                // a partial response never removes a filter mid-session.
                if (page.categories.length > 0) setCategories(page.categories)
                if (page.initiators.length > 0) setInitiators(page.initiators)
            })
            .catch(() => {
                // It said "No audit entries yet", which a reviewer reads as a fact
                // about the workspace rather than a request that failed.
                setEntries([])
                setHasOlder(false)
                setFailed(true)
            })
            .finally(() => setLoading(false))
    }

    // The next fifty, after the ones shown. The log only grows, and with export
    // locked on the free plan this was the only way to reach anything older.
    const loadOlder = () => {
        setLoadingOlder(true)
        getAdminAuditLog(filter === ALL ? undefined : filter, PAGE, entries.length, unattendedOnly ? UNATTENDED : undefined)
            .then((page) => {
                setEntries((prev) => {
                    const seen = new Set(prev.map((e) => e.id))
                    return [...prev, ...page.entries.filter((e) => !seen.has(e.id))]
                })
                setHasOlder(page.entries.length === PAGE)
            })
            .catch((e) => {
                toast({ title: "Couldn't load older entries", description: apiErrorMessage(e, "Try again in a moment."), variant: "destructive" })
            })
            .finally(() => setLoadingOlder(false))
    }

    useEffect(() => {
        load(filter, unattendedOnly)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [filter, unattendedOnly])

    const handleVerify = async (scope: "recent" | "full" = "recent") => {
        setVerifying(true)
        try {
            const res = await verifyAuditLog(scope)
            setVerifyResult(res)
            if (res) {
                toast({
                    title: res.ok ? "Audit log verified" : "Integrity check failed",
                    description: res.ok ? `${res.checked} entries, chain intact` : res.message,
                    variant: res.ok ? undefined : "destructive",
                })
            }
        } catch (e) {
            toast({ title: "Couldn't check the log", description: apiErrorMessage(e, "Try again in a moment."), variant: "destructive" })
        } finally {
            setVerifying(false)
        }
    }

    // The evidence pack is a different deliverable from the export beside it, so
    // it gets its own control rather than a third format on the same one. The
    // export hands over rows; this hands over a document a reviewer can act on.
    const handleEvidencePack = async () => {
        setExporting(true)
        try {
            await downloadEvidencePack()
            toast({
                title: "Evidence pack downloaded",
                description: "Covers the last 90 days: the log with its chain recomputation, what each agent was told, and a manifest fingerprinting every section.",
            })
        } catch (e) {
            toast({ title: "Couldn't build the evidence pack", description: apiErrorMessage(e, "Try again in a moment."), variant: "destructive" })
        } finally {
            setExporting(false)
        }
    }

    const handleExport = async (format: "csv" | "json") => {
        setExporting(true)
        try {
            await exportAuditLog(format, filter === "all" ? undefined : filter)
        } catch (e) {
            toast({ title: "Couldn't export the log", description: apiErrorMessage(e, "Try again in a moment."), variant: "destructive" })
        } finally {
            setExporting(false)
        }
    }

    return (
        <Card className="border-border/60">
            <CardHeader>
                {/* Wraps: on a phone the title and its actions do not fit one row. */}
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                        <CardTitle className="text-base font-semibold">Audit log</CardTitle>
                        {verifyResult && (
                            <Badge
                                variant="outline"
                                className={`text-2xs ${verifyResult.ok ? "text-success-ink border-success/30" : "text-danger-ink border-destructive/30"}`}
                                title={verifyResult.message}
                            >
                                {verifyResult.ok
                                    ? `${verifyResult.partial ? "Recent" : "Whole chain"} verified · ${verifyResult.checked}`
                                    : "Tampering detected"}
                            </Badge>
                        )}
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                        <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" onClick={() => handleVerify("recent")} disabled={verifying}>
                            <ShieldCheck className={`h-3.5 w-3.5 ${verifying ? "animate-pulse" : ""}`} />
                            Verify
                        </Button>
                        {!exportLocked && (<>
                        <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" onClick={() => handleExport("csv")} disabled={exporting}>
                            <Download className="h-3.5 w-3.5" />
                            CSV
                        </Button>
                        <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" onClick={() => handleExport("json")} disabled={exporting}>
                            <Download className="h-3.5 w-3.5" />
                            JSON
                        </Button>
                        {/* READ FIRST, DOWNLOAD SECOND, and that order is the point.
                            The pack was assembled, fingerprinted and honest about its
                            own limits, and the only way to meet it was a .json file.
                            Nobody hands an auditor a JSON file; the primary action is
                            now the document, with the file beside it for the reader
                            who is going to verify the digests. */}
                        {/* A LINK, not a button with a push. The pack is a document
                            somebody sends to somebody else, so open-in-new-tab and
                            copy-link have to work, and a router push gives neither. */}
                        <Button asChild variant="default" size="sm" className="h-8 gap-1.5 text-xs">
                            <Link
                                href="/app/admin/evidence"
                                title="The log, the chain recomputation, what each agent was told, and a manifest fingerprinting every section, as one document you can read, print or send"
                            >
                                <FileArchive className="h-3.5 w-3.5" />
                                Evidence pack
                            </Link>
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            className="h-8 gap-1.5 text-xs"
                            onClick={handleEvidencePack}
                            disabled={exporting}
                            title="The same pack as a file. The fingerprint is a digest of these bytes, so verification happens against the file."
                        >
                            <Download className="h-3.5 w-3.5" />
                            Pack file
                        </Button>
                        </>)}
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => load(filter)} aria-label="Refresh the log">
                            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
                        </Button>
                    </div>
                </div>
                <CardDescription>
                    Every change admins make to settings, and what agents did for people. Each entry is chained to the one before, so Verify shows whether any was altered or removed. Secret values are never recorded, only that they changed.
                </CardDescription>
                {exportLocked && <PlanLockedNotice what="Exporting the audit log" upgradeUrl={plan.upgradeUrl} className="mt-2" />}
                {/* Offered only AFTER a windowed check comes back, and only when it
                    passed. Verify is bounded by default because the log only grows
                    and a full walk on a year-old workspace is the moment the button
                    stops answering at all. The fast result is the useful one; this is
                    for the reader who needs the claim to cover everything, and it is
                    labelled as the slower thing so nobody clicks it by reflex. */}
                {verifyResult?.ok && verifyResult.partial && (
                    <p className="mt-2 text-xs text-muted-foreground">
                        Checked the most recent {verifyResult.checked.toLocaleString()} entries
                        {verifyResult.from_seq ? ` (from #${verifyResult.from_seq} onwards)` : ""}, not the whole log.{" "}
                        <button
                            type="button"
                            onClick={() => handleVerify("full")}
                            disabled={verifying}
                            className="underline underline-offset-2 hover:text-foreground disabled:opacity-50"
                        >
                            Check the whole chain
                        </button>{" "}
                        (slower, because it starts from the first entry ever written).
                    </p>
                )}
            </CardHeader>
            <CardContent>
                {/* One filter per category the SERVER records, not a list kept here.
                    role=group with an accessible name so the set reads as one control
                    rather than a run of unrelated buttons, and aria-pressed so the
                    active filter is announced rather than only coloured. */}
                <div className="flex flex-wrap gap-1.5 mb-3" role="group" aria-label="Filter audit entries by category">
                    {[ALL, ...categories].map((f) => (
                        <Button
                            key={f}
                            size="sm"
                            variant="outline"
                            className={cn("h-7 px-2.5 text-xs capitalize", filter === f ? FILTER_ON : FILTER_OFF)}
                            aria-pressed={filter === f}
                            onClick={() => setFilter(f)}
                        >
                            {f}
                        </Button>
                    ))}
                    {/* Separate from the categories because it cuts across them: an
                        unattended run is in the agent category and the refusal it
                        earned is too, and this asks a different question of both. */}
                    <Button
                        size="sm"
                        variant="outline"
                        className={cn("h-7 px-2.5 text-xs ml-auto", unattendedOnly ? FILTER_ON : FILTER_OFF)}
                        aria-pressed={unattendedOnly}
                        title="Only what ran on somebody's authority while they were away: scheduled runs, event-triggered runs, and work one agent handed to another"
                        onClick={() => setUnattendedOnly((v) => !v)}
                    >
                        Nobody watching
                    </Button>
                </div>

                {/* The failure is checked before the empty case: both leave the
                    list empty, and only one of them is true. */}
                {loading && entries.length === 0 ? (
                    <AuditSkeleton />
                ) : failed && entries.length === 0 ? (
                    <ErrorState subject="the audit log" onRetry={() => load(filter)} retrying={loading} />
                ) : entries.length === 0 ? (
                    <div className="py-8 text-center text-sm text-muted-foreground">
                        {filter !== ALL || unattendedOnly ? "No entries match this filter." : "No audit entries yet."}
                    </div>
                ) : (
                    // No scroller of its own: the admin page's tab region scrolls,
                    // so the log grows with the page instead of inside a box.
                    <div className="-mx-2">
                        <div className="divide-y divide-border/60">
                            {entries.map((e) => (
                                <AuditRow key={e.id} entry={e} unattendedKinds={unattendedKinds} />
                            ))}
                        </div>
                        {hasOlder && (
                            <div className="px-2 pt-3">
                                <Button variant="outline" size="sm" onClick={loadOlder} disabled={loadingOlder}>
                                    {loadingOlder ? "Loading older entries…" : "Show older entries"}
                                </Button>
                            </div>
                        )}
                    </div>
                )}
                <EvidenceReceipts />
            </CardContent>
        </Card>
    )
}
