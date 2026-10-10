"use client"

// AdminAuditLog — a compliance-grade viewer of admin configuration changes:
// who changed which sensitive setting, when, and from where. Secret values are
// never recorded server-side, so this is safe to surface to any admin.

import React, { useEffect, useState } from "react"
import Link from "next/link"
import EvidenceReceipts from "@/components/admin/EvidenceReceipts"
import { PlanLockedNotice } from "@/components/admin/PlanLockedNotice"
import { usePlan } from "@/hooks/usePlan"
import { Button } from "@/components/ui/button"
import { SettingsSection, sectionActionClass } from "@/components/ui/settingsSection"
import { SegmentedControl } from "@/components/ui/segmentedControl"
import { StatusWord } from "@/components/ui/statusWord"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { RefreshCw, ShieldCheck, Download, FileArchive, ChevronDown, Filter } from "@/lib/icons"
import { useToast } from "@/hooks/use-toast"
import { parseAuditMetadata, auditReason } from "@/lib/utils/auditMetadata"
import { apiErrorMessage, apiErrorStatus } from "@/lib/utils/apiError"
import { fullDateTime, shortDateTime } from "@/lib/utils/date/shortDate"
import { ErrorState } from "@/components/ui/error-state"
import { EmptyState } from "@/components/ui/empty-state"
import { SpotInbox } from "@/components/ui/graphics"
import { ADMIN_GROUP_HUE } from "@/components/admin/adminHues"
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

const CHIP = "inline-flex max-w-full items-center truncate rounded-sm px-1.5 py-0.5 text-2xs font-medium capitalize"

/**
 * The category's own column, as wide as the widest chip ("integration"), so
 * every summary starts on one line whatever its category. The chip led the row
 * at its own width, and the summaries started anywhere from 575 to 599px.
 */
export const CHIP_COLUMN = "w-[5.5rem] shrink-0"

/** A list of rows between hairlines, as every list on the admin page is drawn. */
const LIST = "divide-y divide-border rounded-lg border border-border"

// Unknown categories still render, in a neutral style. A category the server starts
// recording is more useful shown plainly than omitted, and omitting it is precisely
// how `agent` entries became invisible in this view.
function categoryChipClass(category: string): string {
    const hue = CATEGORY_HUE[category]
    return hue ? cn(CHIP, HUE_CLASS[hue], "bg-hue-tint text-hue-ink") : cn(CHIP, "bg-muted text-muted-foreground")
}

// "Nobody watching" is on or off, and when on it is the current selection, so
// it takes the selection's soft accent ground, as the app marks a current
// place. Not the filled accent: that is the one primary action here (Evidence
// pack). The categories are a choice of one, so they are the segmented control.
const FILTER_ON = "bg-brand-muted text-foreground border-brand/40 hover:bg-brand-muted"
const FILTER_OFF = "text-muted-foreground"

/** "integration" as a person reads it: "Integration". */
const categoryLabel = (c: string) => (c === ALL ? "All" : c.charAt(0).toUpperCase() + c.slice(1))

/** What the server said, when it answered; a network failure keeps ErrorState's own words. */
const serverReason = (e: unknown) => (apiErrorStatus(e) ? apiErrorMessage(e) : undefined)

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
        <li className="flex items-start gap-3 px-4 py-3">
            <span data-audit-chip-column="" className={CHIP_COLUMN}>
                <span className={categoryChipClass(entry.category)}>{entry.category}</span>
            </span>
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
        </li>
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

/**
 * The rows the log is about to show, in the list's own frame, padding and
 * columns, so nothing moves when they arrive. Its rows sat 8px further in than
 * the loaded ones, which were pulled out by a margin the skeleton didn't have.
 */
export function AuditSkeleton() {
    return (
        <ul role="status" aria-busy="true" aria-label="Loading the audit log" className={LIST}>
            {Array.from({ length: 6 }).map((_, i) => (
                <li key={i} className="flex items-start gap-3 px-4 py-3" aria-hidden="true">
                    <span className={CHIP_COLUMN}>
                        <Skeleton className="h-5 w-16" />
                    </span>
                    <div className="min-w-0 flex-1 space-y-1.5 pt-0.5">
                        <Skeleton className={cn("h-3.5", i % 2 === 0 ? "w-3/5" : "w-1/2")} />
                        <Skeleton className="h-3 w-2/5" />
                    </div>
                </li>
            ))}
        </ul>
    )
}

export default function AdminAuditLog() {
    const [entries, setEntries] = useState<AuditEntry[]>([])
    const [loading, setLoading] = useState(true)
    // A failed read is not an empty log: said as such, with Try again, and
    // with the server's reason when it gave one.
    const [failed, setFailed] = useState(false)
    const [failure, setFailure] = useState<string | undefined>(undefined)
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
        setFailure(undefined)
        getAdminAuditLog(cat === ALL ? undefined : cat, PAGE, 0, unattended ? UNATTENDED : undefined)
            .then((page) => {
                setEntries(page.entries)
                setHasOlder(page.entries.length === PAGE)
                // Only replace the filter list when the server actually sent one, so
                // a partial response never removes a filter mid-session.
                if (page.categories.length > 0) setCategories(page.categories)
                if (page.initiators.length > 0) setInitiators(page.initiators)
            })
            .catch((e) => {
                // It said "No audit entries yet", which a reviewer reads as a fact
                // about the workspace rather than a request that failed.
                setEntries([])
                setHasOlder(false)
                setFailed(true)
                setFailure(serverReason(e))
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

    const filtered = filter !== ALL || unattendedOnly
    const showAll = () => {
        setFilter(ALL)
        setUnattendedOnly(false)
    }

    return (
        <SettingsSection
            id="audit-log"
            title="Audit log"
            description="Every change admins make to settings, and what agents did for people. Each entry is chained to the one before, so Verify shows whether any was altered or removed. Secret values are never recorded, only that they changed."
            action={
                <>
                    <Button
                        variant="outline"
                        size="sm"
                        className={cn(sectionActionClass, "gap-1.5")}
                        onClick={() => handleVerify("recent")}
                        disabled={verifying}
                    >
                        <ShieldCheck className={verifying ? "animate-pulse" : undefined} />
                        Verify
                    </Button>
                    {!exportLocked && (
                        <>
                            {/* The three files in one menu: the log as rows (CSV, JSON)
                                and the pack as the file its fingerprint is a digest of.
                                Four outline buttons and the pack in a row squeezed the
                                description beside them to a few words a line. */}
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button variant="outline" size="sm" className={cn(sectionActionClass, "gap-1.5")} disabled={exporting}>
                                        <Download />
                                        Export
                                        <ChevronDown className="text-muted-foreground" />
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                    <DropdownMenuItem onSelect={() => void handleExport("csv")}>The log as CSV</DropdownMenuItem>
                                    <DropdownMenuItem onSelect={() => void handleExport("json")}>The log as JSON</DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem
                                        onSelect={() => void handleEvidencePack()}
                                        title="The same pack as a file. The fingerprint is a digest of these bytes, so verification happens against the file."
                                    >
                                        The evidence pack file
                                    </DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>
                            {/* READ FIRST, DOWNLOAD SECOND, and that order is the point.
                                Nobody hands an auditor a JSON file; the primary action is
                                the document, with the file in the menu beside it for the
                                reader who is going to verify the digests. A LINK, not a
                                button with a push: the pack is a document somebody sends
                                to somebody else, so open-in-new-tab and copy-link work. */}
                            <Button asChild size="sm" className={cn(sectionActionClass, "gap-1.5")}>
                                <Link
                                    href="/app/admin/evidence"
                                    title="The log, the chain recomputation, what each agent was told, and a manifest fingerprinting every section, as one document you can read, print or send"
                                >
                                    <FileArchive />
                                    Evidence pack
                                </Link>
                            </Button>
                        </>
                    )}
                    <Button
                        variant="ghost"
                        size="icon"
                        className="size-11 md:size-8"
                        onClick={() => load(filter)}
                        aria-label="Refresh the log"
                    >
                        <RefreshCw className={loading ? "animate-spin" : undefined} />
                    </Button>
                </>
            }
        >
            {exportLocked && <PlanLockedNotice what="Exporting the audit log" upgradeUrl={plan.upgradeUrl} />}

            {/* What Verify found, said as a state in words (never by colour
                alone), with how far it reached. */}
            {verifyResult && (
                <p data-verify-result="" className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm">
                    <StatusWord tone={verifyResult.ok ? "success" : "danger"} className="font-medium">
                        {verifyResult.ok ? `${verifyResult.partial ? "Recent" : "Whole chain"} verified` : "Tampering detected"}
                    </StatusWord>
                    <span className="text-muted-foreground" title={verifyResult.message}>
                        {verifyResult.ok
                            ? `· ${verifyResult.checked.toLocaleString()} ${verifyResult.checked === 1 ? "entry" : "entries"}`
                            : `· ${verifyResult.message}`}
                    </span>
                </p>
            )}
            {/* Offered only AFTER a windowed check comes back, and only when it
                passed. Verify is bounded by default because the log only grows
                and a full walk on a year-old workspace is the moment the button
                stops answering at all. The fast result is the useful one; this is
                for the reader who needs the claim to cover everything, and it is
                labelled as the slower thing so nobody clicks it by reflex. */}
            {verifyResult?.ok && verifyResult.partial && (
                <p className="text-xs text-muted-foreground">
                    Checked the most recent {verifyResult.checked.toLocaleString()} entries
                    {verifyResult.from_seq ? ` (from #${verifyResult.from_seq} onwards)` : ""}, not the whole log.{" "}
                    <button
                        type="button"
                        onClick={() => handleVerify("full")}
                        disabled={verifying}
                        className="rounded-sm underline underline-offset-2 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70 disabled:opacity-50"
                    >
                        Check the whole chain
                    </button>{" "}
                    (slower, because it starts from the first entry ever written).
                </p>
            )}

            {/* One choice of category, from the ones the SERVER records rather
                than a list kept here, as the segmented control every other choice
                of one uses; and, apart from it because it cuts across them, the
                one question an auditor asks first: what ran while nobody watched. */}
            <div data-audit-filters="" className="flex flex-wrap items-center gap-2">
                <SegmentedControl
                    aria-label="Filter audit entries by category"
                    value={filter}
                    onValueChange={setFilter}
                    options={[ALL, ...categories].map((c) => ({ value: c, label: categoryLabel(c) }))}
                />
                <Button
                    size="sm"
                    variant="outline"
                    className={cn("ml-auto h-11 md:h-9", unattendedOnly ? FILTER_ON : FILTER_OFF)}
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
                <ErrorState compact subject="the audit log" detail={failure} onRetry={() => load(filter)} retrying={loading} />
            ) : entries.length === 0 && filtered ? (
                <EmptyState
                    icon={Filter}
                    hue={ADMIN_GROUP_HUE.workspace}
                    title="No entries match this filter"
                    description="Nothing recorded in this category, or while nobody was watching, in the entries read so far."
                    action={
                        <Button variant="outline" size="sm" onClick={showAll}>
                            Show every entry
                        </Button>
                    }
                />
            ) : entries.length === 0 ? (
                // Nothing recorded yet, a first run: the inbox, in the workspace group's hue.
                <EmptyState
                    illustration={<SpotInbox hue={ADMIN_GROUP_HUE.workspace} />}
                    title="No audit entries yet"
                    description="Changes to settings, and what agents do for people, are recorded here as they happen."
                />
            ) : (
                // No scroller of its own: the admin page's tab region scrolls,
                // so the log grows with the page instead of inside a box.
                <>
                    <ul aria-label="Audit entries" className={LIST}>
                        {entries.map((e) => (
                            <AuditRow key={e.id} entry={e} unattendedKinds={unattendedKinds} />
                        ))}
                    </ul>
                    {hasOlder && (
                        <Button variant="outline" size="sm" onClick={loadOlder} disabled={loadingOlder}>
                            {loadingOlder ? "Loading older entries…" : "Show older entries"}
                        </Button>
                    )}
                </>
            )}
            <EvidenceReceipts />
        </SettingsSection>
    )
}
