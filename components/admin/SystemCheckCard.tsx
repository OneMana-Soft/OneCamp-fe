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
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { EmptyState } from "@/components/ui/empty-state"
import { ErrorState } from "@/components/ui/error-state"
import { SettingsSection, sectionActionClass } from "@/components/ui/settingsSection"
import { StatusWord } from "@/components/ui/statusWord"
import { Activity, AlertTriangle, Info, Loader2, RefreshCw } from "@/lib/icons"
import { apiErrorMessage } from "@/lib/utils/apiError"
import { cn } from "@/lib/utils/helpers/cn"
import { shortTime } from "@/lib/utils/date/shortDate"
import { ADMIN_GROUP_HUE } from "@/components/admin/adminHues"
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
    return shortTime(d)
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

/** A list of the group's checks: hairline rows, the admin page's one list. */
const LIST = "divide-y divide-border rounded-lg border border-border"

// One check: a row of its group's list. Each was a bordered card of its own.
// Its state is a word with a dot at the row's end (never colour alone), and a
// note or a failure is a line under its scope, not a tinted box in the row.
const CheckRow: React.FC<{ check: SystemCheckResult }> = ({ check }) => (
    <li className="px-4 py-3">
        <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 space-y-1">
                <p className="font-mono text-sm font-medium">{check.name}</p>
                {/* Always rendered, healthy or not. The scope of a passing check is
                    the part an operator most needs and is most often denied. */}
                <p className="text-xs text-muted-foreground">{check.describe}</p>
                {check.detail &&
                    (check.healthy ? (
                        // A note: true, worth knowing, and not a failure.
                        <p className="flex gap-1.5 text-xs text-warning-ink">
                            <Info className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                            <span>{check.detail}</span>
                        </p>
                    ) : (
                        <p className="flex gap-1.5 text-xs text-danger-ink">
                            <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                            <span>{check.detail}</span>
                        </p>
                    ))}
            </div>
            <div className="flex shrink-0 items-center gap-3 text-xs">
                <StatusWord tone={check.healthy ? "success" : "danger"}>
                    {check.healthy ? "Healthy" : "Needs attention"}
                </StatusWord>
                <span className="w-10 text-right tabular-nums text-muted-foreground">{formatDuration(check.took_ms)}</span>
            </div>
        </div>
    </li>
)

/** A group of checks: its name and what it means, then its rows. */
const CheckGroup: React.FC<{ title: string; blurb: string; children: React.ReactNode }> = ({ title, blurb, children }) => (
    <SettingsSection level={3} title={title} description={blurb}>
        {children}
    </SettingsSection>
)

const SystemCheckCard: React.FC = () => {
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

    // The verdict as a dot and a word on the title's row, the way the task
    // panel says a status. An empty build says so in the body instead.
    const verdict = (() => {
        if (error || !report || total === 0) return null
        if (unhealthy > 0) return <StatusWord tone="danger">{unhealthy} of {total} need attention</StatusWord>
        return <StatusWord tone="success">All {total} healthy</StatusWord>
    })()

    // While a failed read is on the page, its Try again is the one way to run
    // the check again; a second "Run again" beside it would be the same button.
    const action = error ? undefined : (
        <>
            {verdict && <span className="text-sm">{verdict}</span>}
            <Button
                variant="outline"
                size="sm"
                onClick={() => void run()}
                disabled={loading}
                className={cn(sectionActionClass, "gap-1.5")}
            >
                {loading ? <Loader2 className="animate-spin" /> : <RefreshCw />}
                {loading ? "Checking…" : "Run again"}
            </Button>
        </>
    )

    return (
        <SettingsSection
            title="Installation health"
            description={
                <>
                    Each subsystem is probed for the signature a known failure leaves behind. Nothing here writes to your
                    workspace, so it is safe to run at any time.
                    {report?.checked_at ? ` Last run ${formatCheckedAt(report.checked_at)}.` : ""}
                </>
            }
            action={action}
        >
            {error ? (
                <ErrorState compact subject="the health check" detail={error} onRetry={() => void run()} retrying={loading} />
            ) : !report && loading ? (
                // The list's own rows, under the first group's real heading, so
                // nothing moves when the answer lands.
                <CheckGroup title={SECTIONS[0].title} blurb={SECTIONS[0].blurb}>
                    <ul role="status" aria-label="Checking the installation" className={LIST}>
                        {[0, 1, 2, 3].map((i) => (
                            <li key={i} aria-hidden="true" className="px-4 py-3">
                                <div className="flex items-start justify-between gap-4">
                                    <div className="min-w-0 flex-1 space-y-2 py-0.5">
                                        <Skeleton className={cn("h-3.5", i % 2 ? "w-24" : "w-32")} />
                                        <Skeleton className={cn("h-3", i % 2 ? "w-2/3" : "w-3/4")} />
                                    </div>
                                    <Skeleton className="h-3 w-24 shrink-0" />
                                </div>
                            </li>
                        ))}
                    </ul>
                </CheckGroup>
            ) : report && total === 0 ? (
                <EmptyState
                    icon={Activity}
                    hue={ADMIN_GROUP_HUE.system}
                    title="No checks in this build"
                    description="Each subsystem announces its own probe, so an empty list means those subsystems are not part of this edition, not that everything passed."
                />
            ) : report ? (
                <div className="space-y-6">
                    {SECTIONS.map(({ kind, title, blurb }) => {
                        const rows = report.checks.filter((c) => c.kind === kind)
                        // An absent group is an edition without those subsystems.
                        if (rows.length === 0) return null
                        return (
                            <CheckGroup key={kind} title={title} blurb={blurb}>
                                <ul aria-label={title} className={LIST}>
                                    {rows.map((check) => (
                                        <CheckRow key={check.name} check={check} />
                                    ))}
                                </ul>
                            </CheckGroup>
                        )
                    })}

                    {/* The boundary of this page, stated on the page.

                        Everything above is read-only, which is what makes it safe to press and is exactly
                        why it cannot tell you whether somebody can create a task and then find it again.
                        An admin who does not know that reads a green page as a working product, which is
                        the same false comfort this page was built to stop giving. */}
                    <p className="max-w-[65ch] text-xs text-muted-foreground text-pretty">
                        Nothing on this page writes, so it cannot prove that creating something and finding it again
                        works. The <code className="font-mono">journey</code> check does: it signs in, creates a task,
                        reads it back and searches for it. Run it against this server with{" "}
                        <code className="font-mono">go-one-camp journey</code>, giving it an API token and a project you
                        are happy to see a test task in.
                    </p>
                </div>
            ) : null}
        </SettingsSection>
    )
}

export default SystemCheckCard
