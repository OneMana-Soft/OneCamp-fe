"use client"

// AdminAuditLog — a compliance-grade viewer of admin configuration changes:
// who changed which sensitive setting, when, and from where. Secret values are
// never recorded server-side, so this is safe to surface to any admin.

import React, { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { FileText, RefreshCw, ShieldCheck, Download } from "@/lib/icons"
import { useToast } from "@/hooks/use-toast"
import { parseAuditMetadata, auditReason } from "@/lib/utils/auditMetadata"
import {
    getAdminAuditLog,
    verifyAuditLog,
    exportAuditLog,
    type AuditEntry,
    type AuditVerifyResult,
} from "@/services/settingsService"

const CATEGORY_STYLES: Record<string, string> = {
    settings: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20",
    integration: "bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-500/20",
    auth: "bg-amber-500/10 text-warning border-amber-500/20",
    app: "bg-success/10 text-success border-success/20",
    security: "bg-red-500/10 text-destructive border-red-500/20",
    // Agent activity: an agent acting for a person, including calls arriving over
    // MCP from outside the workspace. Visually distinct because "was this a human
    // or an agent on their behalf" is the first thing an auditor scans for.
    agent: "bg-teal-500/10 text-teal-600 dark:text-teal-400 border-teal-500/20",
}

// Unknown categories still render, in a neutral style. A category the server starts
// recording is more useful shown plainly than omitted, and omitting it is precisely
// how `agent` entries became invisible in this view.
const FALLBACK_CATEGORY_STYLE = "bg-muted text-muted-foreground border-border"

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
function AuditRow({ entry }: { entry: AuditEntry }) {
    const meta = parseAuditMetadata(entry.metadata)
    const reason = auditReason(entry.metadata)
    // Fields worth expanding for: everything except the reason, which is already shown.
    const detailFields = meta?.fields.filter((f) => !f.isReason) ?? []
    const hasDetail = Boolean(meta && (meta.malformed || detailFields.length > 0))

    return (
        <div className="flex items-start gap-3 px-2 py-2.5">
            <Badge
                variant="outline"
                className={`text-3xs capitalize shrink-0 ${CATEGORY_STYLES[entry.category] ?? FALLBACK_CATEGORY_STYLE}`}
            >
                {entry.category}
            </Badge>
            <div className="min-w-0 flex-1">
                <p className="text-sm text-foreground">{entry.summary}</p>

                {reason && (
                    // Never colour-only: a refusal is marked by the word "Refused" as well
                    // as the tone, so the distinction survives colour blindness and a
                    // greyscale print of an audit export.
                    <p className="mt-1 text-xs">
                        {meta?.refused && (
                            <span className="font-medium text-destructive">Refused — </span>
                        )}
                        <span className={meta?.refused ? "text-destructive/90" : "text-muted-foreground"}>
                            {reason}
                        </span>
                    </p>
                )}

                <p className="text-2xs text-muted-foreground mt-0.5">
                    {entry.actor_email || "Unknown"}
                    {entry.ip_address ? ` · ${entry.ip_address}` : ""}
                    {` · ${formatTime(entry.created_at)}`}
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
                            <pre className="mt-1.5 overflow-x-auto rounded bg-muted/40 p-2 text-3xs text-muted-foreground">
                                {meta.raw}
                            </pre>
                        ) : (
                            <dl className="mt-1.5 grid grid-cols-[minmax(0,9rem)_1fr] gap-x-3 gap-y-1 rounded bg-muted/40 p-2 text-2xs">
                                {detailFields.map((f) => (
                                    <React.Fragment key={f.key}>
                                        <dt className="text-muted-foreground">{f.label}</dt>
                                        <dd className="break-words font-mono text-foreground">{f.value}</dd>
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

function formatTime(iso: string): string {
    try {
        return new Date(iso).toLocaleString(undefined, {
            month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
        })
    } catch {
        return iso
    }
}

export default function AdminAuditLog() {
    const [entries, setEntries] = useState<AuditEntry[]>([])
    const [loading, setLoading] = useState(true)
    const [filter, setFilter] = useState<string>(ALL)
    const [categories, setCategories] = useState<string[]>(SEED_CATEGORIES)
    const { toast } = useToast()
    const [verifying, setVerifying] = useState(false)
    const [verifyResult, setVerifyResult] = useState<AuditVerifyResult | null>(null)
    const [exporting, setExporting] = useState(false)

    const load = (cat: string) => {
        setLoading(true)
        getAdminAuditLog(cat === ALL ? undefined : cat)
            .then((page) => {
                setEntries(page.entries)
                // Only replace the filter list when the server actually sent one, so
                // a partial response never removes a filter mid-session.
                if (page.categories.length > 0) setCategories(page.categories)
            })
            .catch(() => setEntries([]))
            .finally(() => setLoading(false))
    }

    useEffect(() => {
        load(filter)
    }, [filter])

    const handleVerify = async () => {
        setVerifying(true)
        try {
            const res = await verifyAuditLog()
            setVerifyResult(res)
            if (res) {
                toast({
                    title: res.ok ? "Audit log verified" : "Integrity check failed",
                    description: res.ok ? `${res.checked} entries, chain intact` : res.message,
                    variant: res.ok ? undefined : "destructive",
                })
            }
        } catch {
            toast({ title: "Verification failed", variant: "destructive" })
        } finally {
            setVerifying(false)
        }
    }

    const handleExport = async (format: "csv" | "json") => {
        setExporting(true)
        try {
            await exportAuditLog(format, filter === "all" ? undefined : filter)
        } catch {
            toast({ title: "Export failed", variant: "destructive" })
        } finally {
            setExporting(false)
        }
    }

    return (
        <Card className="border-border/60">
            <CardHeader>
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <FileText className="h-5 w-5 text-primary" />
                        <CardTitle className="text-lg font-semibold">Audit log</CardTitle>
                        {verifyResult && (
                            <Badge
                                variant="outline"
                                className={`text-[10px] ${verifyResult.ok ? "text-success border-success/30" : "text-red-600 border-red-500/30"}`}
                                title={verifyResult.message}
                            >
                                {verifyResult.ok ? `Verified · ${verifyResult.checked}` : "Tampering detected"}
                            </Badge>
                        )}
                    </div>
                    <div className="flex items-center gap-1.5">
                        <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" onClick={handleVerify} disabled={verifying}>
                            <ShieldCheck className={`h-3.5 w-3.5 ${verifying ? "animate-pulse" : ""}`} />
                            Verify
                        </Button>
                        <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" onClick={() => handleExport("csv")} disabled={exporting}>
                            <Download className="h-3.5 w-3.5" />
                            CSV
                        </Button>
                        <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" onClick={() => handleExport("json")} disabled={exporting}>
                            <Download className="h-3.5 w-3.5" />
                            JSON
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => load(filter)} aria-label="Refresh">
                            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
                        </Button>
                    </div>
                </div>
                <CardDescription>
                    Configuration changes by admins, tamper-evident (hash-chained). Secret values are never recorded — only that a change occurred. Verify the chain or export it for an auditor.
                </CardDescription>
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
                            variant={filter === f ? "default" : "outline"}
                            className="h-7 px-2.5 text-xs capitalize"
                            aria-pressed={filter === f}
                            onClick={() => setFilter(f)}
                        >
                            {f}
                        </Button>
                    ))}
                </div>

                {loading && entries.length === 0 ? (
                    <div className="py-8 text-center text-sm text-muted-foreground">Loading…</div>
                ) : entries.length === 0 ? (
                    <div className="py-8 text-center text-sm text-muted-foreground">No audit entries yet.</div>
                ) : (
                    <div className="divide-y divide-border/60 max-h-[28rem] overflow-y-auto -mx-2">
                        {entries.map((e) => (
                            <AuditRow key={e.id} entry={e} />
                        ))}
                    </div>
                )}
            </CardContent>
        </Card>
    )
}
