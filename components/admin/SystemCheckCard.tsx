"use client"

/**
 * SystemCheckCard — "is this installation actually working?"
 *
 * WHY THIS EXISTS. Unit tests were green through every serious defect this
 * product has had. Entity links were broken from the day they shipped: linking a
 * doc to a task silently did nothing, and nothing anywhere said so. The GitHub
 * link dialog had never once opened. The sync queue was failing most of its
 * writes. In each case the code was right in isolation, the seam between two
 * subsystems was not, and the way it was eventually found was a person noticing
 * something looked wrong.
 *
 * A self-hoster stands up fifteen services and has no way to learn any of that.
 * The onboarding checklist tells an admin what to DO. This tells them what WORKS.
 *
 * ON DEMAND, NOT POLLED. Each probe is a database aggregate with an eight second
 * ceiling, so this is not something to run every sixty seconds in a forgotten
 * tab. It runs when the tab is opened — Radix unmounts inactive tabs, so mount
 * IS open — and again when asked. Nothing here writes, so re-running is free of
 * consequence.
 *
 * WHAT IS SHOWN. Every check reports what it proves AND what it does not, and
 * that sentence is rendered rather than dropped: a green tick with no scope is
 * worth less than nothing. The list is registry-driven on the server, so a check
 * that is absent means the subsystem is not installed in this build — which is
 * why an empty result says so instead of rendering as "all clear".
 */

import React, { useCallback, useEffect, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Activity, AlertTriangle, CheckCircle2, Info, Loader2, RefreshCw } from "@/lib/icons"
import { apiErrorMessage } from "@/lib/utils/apiError"
import { runSystemCheck, type SystemCheckKind, type SystemCheckReport, type SystemCheckResult } from "@/services/systemCheckService"

/** Sub-second timings read as noise; whole milliseconds are what an operator compares. */
function formatDuration(ms: number): string {
    if (!Number.isFinite(ms) || ms < 0) return ""
    if (ms < 1000) return `${Math.round(ms)}ms`
    return `${(ms / 1000).toFixed(1)}s`
}

function formatCheckedAt(unixSeconds: number): string {
    if (!unixSeconds) return ""
    const d = new Date(unixSeconds * 1000)
    if (Number.isNaN(d.getTime())) return ""
    return d.toLocaleTimeString()
}

/**
 * The two questions, in the order an admin needs them.
 *
 * A fresh install has no tasks, no syncs and no agent runs, so every behaviour
 * check passes for want of anything to be wrong about -- while MinIO may have no
 * bucket and no upload will ever succeed. Listing dependencies first, under a
 * heading that says what they mean, is what stops three green ticks reading as a
 * working installation.
 */
const SECTIONS: { kind: SystemCheckKind; title: string; blurb: string }[] = [
    {
        kind: "dependency",
        title: "Services this install needs",
        blurb: "Without these, OneCamp cannot work at all. Each was checked just now, not at startup.",
    },
    {
        kind: "behaviour",
        title: "Features that can break quietly",
        blurb: "Everything above is reachable and a feature can still be broken. These look for the trace a known failure leaves behind.",
    },
]

const CheckRow: React.FC<{ check: SystemCheckResult }> = ({ check }) => (
    <div className="rounded-lg border border-border bg-card px-3 py-2.5">
        <div className="flex items-start gap-2">
            {check.healthy ? (
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />
            ) : (
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
            )}
            <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                    <span className="font-mono text-sm font-medium">{check.name}</span>
                    <span className="ml-auto shrink-0 text-xs tabular-nums text-muted-foreground">
                        {formatDuration(check.took_ms)}
                    </span>
                </div>
                {/* Always rendered, healthy or not. The scope of a passing check is
                    the part an operator most needs and is most often denied. */}
                <p className="mt-0.5 text-xs text-muted-foreground">{check.describe}</p>
                {check.detail &&
                    (check.healthy ? (
                        // A note: true, worth knowing, and not a failure.
                        <p className="mt-1.5 flex gap-1.5 rounded border border-warning/30 bg-warning/10 px-2 py-1 text-xs text-warning">
                            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                            <span>{check.detail}</span>
                        </p>
                    ) : (
                        <p className="mt-1.5 rounded border border-destructive/30 bg-destructive/5 px-2 py-1 text-xs text-destructive">
                            {check.detail}
                        </p>
                    ))}
            </div>
        </div>
    </div>
)

export const SystemCheckCard: React.FC = () => {
    const [report, setReport] = useState<SystemCheckReport | null>(null)
    const [loading, setLoading] = useState(false)
    // Held inline rather than thrown at a toast. A failure to REACH the checker is
    // itself diagnostic information, and a toast disappears before it can be read
    // alongside the rest of the page.
    const [error, setError] = useState<string | null>(null)

    const run = useCallback(async () => {
        setLoading(true)
        setError(null)
        try {
            setReport((await runSystemCheck()) ?? null)
        } catch (e: unknown) {
            setError(apiErrorMessage(e, "The check could not be run."))
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => {
        void run()
    }, [run])

    const unhealthy = report?.unhealthy ?? 0
    const total = report?.total ?? 0

    const summary = (() => {
        if (loading && !report) return <Badge variant="outline">Checking…</Badge>
        if (error) {
            return (
                <Badge variant="outline" className="border-warning/30 text-warning">
                    Unavailable
                </Badge>
            )
        }
        if (!report) return null
        if (total === 0) return <Badge variant="outline">No checks in this build</Badge>
        if (unhealthy > 0) {
            return (
                <Badge className="border-destructive/30 bg-destructive/10 text-destructive">
                    <AlertTriangle className="mr-1 h-3.5 w-3.5" />
                    {unhealthy} of {total} need attention
                </Badge>
            )
        }
        return (
            <Badge className="border-success/30 bg-success/10 text-success">
                <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
                All {total} healthy
            </Badge>
        )
    })()

    return (
        <Card>
            <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                    <Activity className="h-4 w-4" />
                    Installation health
                    <span className="ml-auto flex items-center gap-2">
                        {summary}
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => void run()}
                            disabled={loading}
                            className="h-7"
                        >
                            {loading ? (
                                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                            ) : (
                                <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                            )}
                            {loading ? "Running" : "Run again"}
                        </Button>
                    </span>
                </CardTitle>
                <CardDescription>
                    Each subsystem is probed for the signature a known failure leaves behind.
                    Nothing here writes to your workspace, so it is safe to run at any time.
                    {report?.checked_at ? ` Last run ${formatCheckedAt(report.checked_at)}.` : ""}
                </CardDescription>
            </CardHeader>

            <CardContent className="space-y-3">
                {error && (
                    <p className="rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-warning">
                        {error}
                    </p>
                )}

                {!error && report && total === 0 && (
                    <p className="text-sm text-muted-foreground">
                        This build registered no checks. Each subsystem announces its own probe, so
                        an empty list means those subsystems are not part of this edition rather
                        than that everything passed.
                    </p>
                )}

                {!error && !report && loading && (
                    <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Probing each subsystem…
                    </div>
                )}

                {!error &&
                    report &&
                    SECTIONS.map(({ kind, title, blurb }) => {
                        const rows = report.checks.filter((c) => c.kind === kind)
                        // A build that registered nothing in this group says so
                        // in the empty-state above; an absent group here is just
                        // an edition without those subsystems.
                        if (rows.length === 0) return null
                        return (
                            <section key={kind} className="space-y-2">
                                <div>
                                    <h3 className="text-sm font-medium">{title}</h3>
                                    <p className="text-xs text-muted-foreground">{blurb}</p>
                                </div>
                                <div className="space-y-2">
                                    {rows.map((check) => (
                                        <CheckRow key={check.name} check={check} />
                                    ))}
                                </div>
                            </section>
                        )
                    })}

                {/* The boundary of this page, stated on the page.
                    
                    Everything above is read-only, which is what makes it safe to press and is exactly
                    why it cannot tell you whether somebody can create a task and then find it again.
                    An admin who does not know that reads a green page as a working product, which is
                    the same false comfort this page was built to stop giving. */}
                {!error && report && report.total > 0 && (
                    <p className="border-t border-border pt-3 text-xs text-muted-foreground">
                        Nothing on this page writes, so it cannot prove that creating something and
                        finding it again works. The <code className="font-mono">journey</code> check does:
                        it signs in, creates a task, reads it back and searches for it. Run it against
                        this server with{" "}
                        <code className="font-mono">go-one-camp journey</code>, giving it an API token
                        and a project you are happy to see a test task in.
                    </p>
                )}
            </CardContent>
        </Card>
    )
}

export default SystemCheckCard
