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
 * WHAT IS SHOWN. Every check reports what it proves AND what it does not. That
 * sentence is never dropped: it is each tile's tooltip and its accessible
 * description, and an expanded tile shows it. A green tick with no scope is
 * worth less than nothing. The list is registry-driven on the server, so a check
 * that is absent means the subsystem is not installed in this build — which is
 * why an empty result says so instead of rendering as "all clear".
 *
 * DESIGN V3 (admin A21, mock M8). A summary hero: a 72px ring filled moss to
 * the healthy share, "9/10", what needs attention and Run again. Then the
 * services as 64px tiles in two columns, calm when healthy; a tile that needs
 * attention spans both columns with its reason and its fix as a code row. Run
 * again turns each dot into a spinner and the results land 60ms apart.
 */

import React, { useCallback, useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { EmptyState } from "@/components/ui/empty-state"
import { SettingsCard, SettingsCardError, SettingsSection } from "@/components/ui/settingsSection"
import { CodeRow } from "@/components/ui/settingsControls"
import { StatusWord } from "@/components/ui/statusWord"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import {
    Activity,
    Archive,
    Bot,
    Database,
    HardDrive,
    KeyRound,
    Link2,
    Loader2,
    Mail,
    Network,
    Plug,
    RefreshCw,
    Search,
    Server,
    Users,
    Zap,
} from "@/lib/icons"
import { apiErrorMessage } from "@/lib/utils/apiError"
import { cn } from "@/lib/utils/helpers/cn"
import { shortTime } from "@/lib/utils/date/shortDate"
import { ADMIN_GROUP_HUE } from "@/components/admin/adminHues"
import { HealthRing } from "@/components/admin/HealthRing"
import { runSystemCheck, type SystemCheckKind, type SystemCheckReport, type SystemCheckResult } from "@/services/systemCheckService"

/** Whole milliseconds are what an operator compares. Pure. */
export function formatDuration(ms: number): string {
    if (!Number.isFinite(ms) || ms < 0) return ""
    if (ms < 1000) return `${Math.round(ms)} ms`
    return `${(ms / 1000).toFixed(1)} s`
}

function formatCheckedAt(unixSeconds: number): string {
    if (!unixSeconds) return ""
    const d = new Date(unixSeconds * 1000)
    if (Number.isNaN(d.getTime())) return ""
    return shortTime(d)
}

/** A check's name as people say it: "github-sync" reads "GitHub sync". Pure. */
export function checkTitle(name: string): string {
    const words = name.replace(/[-_]+/g, " ").trim()
    const said = words.replace(/\bgithub\b/gi, "GitHub").replace(/\bai\b/gi, "AI")
    return said.charAt(0).toUpperCase() + said.slice(1)
}

/**
 * The command a failing check's reason tells the operator to run, when it
 * names one ("…and on the server run make housekeeping"), so it can be a code
 * row with copy rather than words to retype. A `fix` field from the server
 * wins when there is one. Pure.
 */
export function fixOf(check: SystemCheckResult & { fix?: string }): string | null {
    if (check.fix) return check.fix
    const m = check.detail?.match(/\brun\s+((?:make|go-one-camp|docker compose|docker|sudo)\s[^.;,"\n]+)/i)
    return m ? m[1].trim() : null
}

/** The disk's use as a percentage, when the check says it ("disk 91% used"). Pure. */
export function diskUsed(check: SystemCheckResult): number | null {
    const m = `${check.detail ?? ""}`.match(/(\d{1,3})%\s*used/i)
    return m ? Math.min(100, Number(m[1])) : null
}

/** Whether a tile spans both columns: a failure, or a note worth reading. Pure. */
export function needsAttention(check: SystemCheckResult): "danger" | "warning" | null {
    if (!check.healthy) return "danger"
    return check.detail ? "warning" : null
}

const GLYPH: Record<string, React.ComponentType<{ className?: string }>> = {
    database: Database,
    graph: Network,
    cache: Zap,
    realtime: Activity,
    storage: Archive,
    search: Search,
    email: Mail,
    disk: HardDrive,
    "sign-in": KeyRound,
    accounts: Users,
    "github-sync": Plug,
    "entity-links": Link2,
}
const glyphOf = (name: string) => GLYPH[name.toLowerCase()] ?? (name.startsWith("agent") ? Bot : Server)

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
    { kind: "dependency", title: "Services this install needs", blurb: "Without these, OneCamp can't work at all. Each was checked just now." },
    { kind: "behaviour", title: "Features that can break quietly", blurb: "Each looks for the trace a known failure leaves behind." },
]

/** A 64px service tile; one needing attention spans both columns with its reason and fix. */
const ServiceTile: React.FC<{ check: SystemCheckResult; index: number; running: boolean; run: number }> = ({ check, index, running, run }) => {
    const attention = needsAttention(check)
    const Glyph = glyphOf(check.name)
    const fix = attention ? fixOf(check) : null
    const used = check.name.toLowerCase() === "disk" ? diskUsed(check) : null
    const descId = `check-${check.name}-scope`
    return (
        <li
            data-service-tile=""
            data-attention={attention ?? undefined}
            aria-describedby={descId}
            className={cn("cfg-tile", attention && "sm:col-span-2")}
        >
            <div className="flex min-w-0 items-center gap-3">
                <span aria-hidden="true" className="inline-grid size-7 shrink-0 place-items-center rounded-md bg-sunken text-ink-3 ring-1 ring-inset ring-line">
                    <Glyph className="size-4" />
                </span>
                <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1">
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <span tabIndex={0} className="truncate rounded-sm text-sm font-medium text-foreground focus-visible:outline-2 focus-visible:outline-ring">
                                {checkTitle(check.name)}
                            </span>
                        </TooltipTrigger>
                        <TooltipContent className="max-w-xs">{check.describe}</TooltipContent>
                    </Tooltip>
                    {running ? (
                        <Loader2 className="size-2.5 animate-spin text-ink-3" aria-label="Checking" />
                    ) : (
                        <span key={run} className="cfg-tile-result" style={{ "--i": index } as React.CSSProperties}>
                            {attention === "danger" ? (
                                <StatusWord tone="danger" className="text-xs font-medium">Needs attention</StatusWord>
                            ) : attention === "warning" ? (
                                <StatusWord tone="warning" className="text-xs font-medium">Worth knowing</StatusWord>
                            ) : (
                                <StatusWord tone="success" className="text-xs">
                                    <span className="sr-only">Healthy</span>
                                </StatusWord>
                            )}
                        </span>
                    )}
                    {used !== null && (
                        <span
                            data-disk-bar=""
                            role="img"
                            aria-label={`${used}% used`}
                            className="cfg-bar basis-full sm:basis-auto"
                        >
                            <span
                                className={used < 85 ? "bg-camp-moss" : used <= 95 ? "bg-camp-sun" : "bg-destructive"}
                                style={{ transform: `scaleX(${used / 100})` }}
                            />
                        </span>
                    )}
                </div>
                <span className="shrink-0 text-2xs tabular-nums text-ink-3">
                    {used !== null ? `${used}% used` : formatDuration(check.took_ms)}
                </span>
            </div>
            {/* The scope, always there for assistive tech; shown when the tile is open. */}
            <p id={descId} className={attention ? "pl-10 text-xs text-muted-foreground text-pretty" : "sr-only"}>
                {check.describe}
            </p>
            {attention && check.detail && (
                <div className="space-y-2 pl-10">
                    <p className={cn("text-xs text-pretty", attention === "danger" ? "text-danger-ink" : "text-warning-ink")}>{check.detail}</p>
                    {fix && <CodeRow value={fix} label="fix command" />}
                </div>
            )}
        </li>
    )
}

const TilesSkeleton: React.FC = () => (
    <ul role="status" aria-label="Checking the installation" className="grid gap-2 sm:grid-cols-2">
        {[0, 1, 2, 3].map((i) => (
            <li key={i} aria-hidden="true" className="cfg-tile">
                <div className="flex items-center gap-3">
                    <Skeleton className="size-7 shrink-0 rounded-md" />
                    <Skeleton className={cn("h-3.5", i % 2 ? "w-20" : "w-28")} />
                    <Skeleton className="ml-auto h-3 w-10" />
                </div>
            </li>
        ))}
    </ul>
)

const SystemCheckCard: React.FC = () => {
    const [report, setReport] = useState<SystemCheckReport | null>(null)
    const [loading, setLoading] = useState(false)
    // Held inline rather than thrown at a toast. A failure to REACH the checker is
    // itself diagnostic information, and a toast disappears before it can be read
    // alongside the rest of the page.
    const [error, setError] = useState<string | null>(null)
    // Bumped per result, so the tiles' staggered arrival replays.
    const [runs, setRuns] = useState(0)

    const run = useCallback(async () => {
        setLoading(true)
        setError(null)
        try {
            setReport((await runSystemCheck()) ?? null)
            setRuns((n) => n + 1)
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
    const healthy = report ? report.healthy ?? total - unhealthy : 0
    const depDown = !!report?.checks.some((c) => c.kind === "dependency" && !c.healthy)

    const summary = !report
        ? "Checking the installation…"
        : unhealthy > 0
          ? `${unhealthy} ${unhealthy === 1 ? "needs" : "need"} attention`
          : `All ${total} healthy`

    let body: React.ReactNode
    if (error) {
        body = (
            <SettingsCard>
                <SettingsCardError what="the health check" reason={error} onRetry={() => void run()} retrying={loading} />
            </SettingsCard>
        )
    } else if (report && total === 0) {
        body = (
            <EmptyState
                icon={Activity}
                hue={ADMIN_GROUP_HUE.system}
                title="No checks in this build"
                description="Each subsystem announces its own probe, so an empty list means those subsystems are not part of this edition, not that everything passed."
            />
        )
    } else {
        body = (
            <div className="space-y-6">
                {/* The summary hero. */}
                <SettingsCard>
                    <div data-health-hero="" className="flex flex-wrap items-center gap-x-5 gap-y-3 p-5">
                        {report ? (
                            <HealthRing healthy={healthy} total={total} rest={depDown ? "danger" : "sun"} />
                        ) : (
                            <Skeleton className="cfg-ring size-[72px] rounded-full" />
                        )}
                        <div className="min-w-0 flex-1 space-y-0.5" aria-live="polite">
                            <p data-health-summary="" className="text-heading text-foreground">
                                {summary}
                            </p>
                            <p className="text-xs text-muted-foreground">
                                {report?.checked_at ? `Last run ${formatCheckedAt(report.checked_at)} · ` : ""}nothing here writes to your workspace
                            </p>
                        </div>
                        <Button variant="secondary" size="sm" onClick={() => void run()} disabled={loading}>
                            {loading ? <Loader2 className="animate-spin" aria-hidden="true" /> : <RefreshCw aria-hidden="true" />}
                            {loading ? "Checking…" : "Run again"}
                        </Button>
                    </div>
                </SettingsCard>

                {!report ? (
                    <SettingsSection level={3} title={SECTIONS[0].title}>
                        <TilesSkeleton />
                    </SettingsSection>
                ) : (
                    SECTIONS.map(({ kind, title, blurb }) => {
                        const rows = report.checks.filter((c) => c.kind === kind)
                        // An absent group is an edition without those subsystems.
                        if (rows.length === 0) return null
                        const offset = kind === "behaviour" ? report.checks.filter((c) => c.kind === "dependency").length : 0
                        return (
                            <SettingsSection key={kind} level={3} title={title} description={blurb}>
                                <ul aria-label={title} className="grid gap-2 sm:grid-cols-2">
                                    {rows.map((check, i) => (
                                        <ServiceTile key={check.name} check={check} index={offset + i} running={loading} run={runs} />
                                    ))}
                                </ul>
                            </SettingsSection>
                        )
                    })
                )}

                {/* The boundary of this page, stated on the page: everything above is
                    read-only, which is what makes it safe to press and is exactly why it
                    cannot tell you whether somebody can create a task and find it again. */}
                {report && (
                    <div className="space-y-2">
                        <p className="max-w-[60ch] text-xs text-muted-foreground text-pretty">
                            Nothing here writes, so it cannot prove that creating something and finding it again works.
                            The journey check does: run it on the server with an API token and a test project.
                        </p>
                        <CodeRow value="go-one-camp journey" label="journey command" className="max-w-sm" />
                    </div>
                )}
            </div>
        )
    }

    return (
        <SettingsSection id="health-installation" title="Installation health">
            {body}
        </SettingsSection>
    )
}

export default SystemCheckCard
