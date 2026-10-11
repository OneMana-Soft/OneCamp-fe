"use client"

/**
 * UpdatesCard: which OneCamp this server runs, and whether a newer one exists.
 *
 * A self-hosted workspace updates only when its admin re-runs the installer,
 * and nothing here used to say a newer release existed, so fixes shipped and
 * sat unused. This asks only when the admin clicks: the server then makes one
 * plain request for the current releases, carrying nothing about this
 * workspace. The host and the command come from the server.
 *
 * Design v3 (admin A21, mock M8): a version row ("OneCamp 2.71.0", a moss dot,
 * "You're up to date · checked 2 m ago"); when a release is out the row
 * becomes a release card with a New tag, its top changes when the server
 * sends them, the notes link when it sends one, and the update command as a
 * code row with copy. The refresh glyph turns once per check, not for as
 * long as the check runs.
 */

import React, { useCallback, useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { SettingsCard, SettingsSection } from "@/components/ui/settingsSection"
import { CodeRow } from "@/components/ui/settingsControls"
import { StatusWord, type StatusTone } from "@/components/ui/statusWord"
import { ArrowRight, RefreshCw } from "@/lib/icons"
import { apiErrorMessage } from "@/lib/utils/apiError"
import { shortDate } from "@/lib/utils/date/shortDate"
import { checkForUpdates, updateSummary, type UpdateStatus, type UpdateTone } from "@/services/updatesService"

/**
 * What a release may carry beyond today's answer: its top changes and a link
 * to its notes. The server sends neither yet; the card shows them when it does.
 */
type Release = UpdateStatus & { highlights?: string[]; notes_url?: string }

const TONE: Record<UpdateTone, StatusTone> = { current: "success", available: "success", unknown: "neutral" }

/** "just now", "2 m ago", "3 h ago", then the date. Pure. */
export function checkedAgo(at: Date, now: Date = new Date()): string {
    const s = Math.max(0, Math.round((now.getTime() - at.getTime()) / 1000))
    if (s < 45) return "just now"
    const m = Math.round(s / 60)
    if (m < 60) return `${m} m ago`
    const h = Math.round(m / 60)
    if (h < 24) return `${h} h ago`
    return shortDate(at)
}

/** "v2.71.0" reads "2.71.0" after the product's name. Pure. */
const bare = (tag: string) => tag.replace(/^v(?=\d)/, "")

const UpdatesCard: React.FC = () => {
    const [status, setStatus] = useState<Release | null>(null)
    const [checkedAt, setCheckedAt] = useState<Date | null>(null)
    const [checking, setChecking] = useState(false)
    const [error, setError] = useState("")
    // Bumped per check, so the glyph's one turn replays.
    const [turns, setTurns] = useState(0)
    // Re-renders "2 m ago" as the minutes pass.
    const [, setTick] = useState(0)
    useEffect(() => {
        if (!checkedAt) return
        const t = window.setInterval(() => setTick((n) => n + 1), 30_000)
        return () => window.clearInterval(t)
    }, [checkedAt])

    const check = useCallback(async () => {
        setChecking(true)
        setTurns((n) => n + 1)
        setError("")
        try {
            setStatus(await checkForUpdates())
            setCheckedAt(new Date())
        } catch (e) {
            setError(apiErrorMessage(e, "Couldn't check for updates."))
        } finally {
            setChecking(false)
        }
    }, [])

    const summary = status ? updateSummary(status) : null
    const available = summary?.tone === "available"

    const checkButton = (
        <Button variant="secondary" size="sm" onClick={() => void check()} disabled={checking} className="shrink-0">
            <RefreshCw key={turns} className={turns ? "cfg-spin-once" : undefined} aria-hidden="true" />
            {checking ? "Checking…" : status ? "Check again" : "Check for updates"}
        </Button>
    )

    let row: React.ReactNode
    if (available && status && summary) {
        const highlights = (status.highlights ?? []).slice(0, 3)
        row = (
            <div data-release-card="" className="space-y-3 p-4">
                <div className="flex flex-wrap items-start gap-x-4 gap-y-2">
                    <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                            <h3 className="text-heading text-foreground">OneCamp {bare(status.latest)} is out</h3>
                            <span data-new-tag="" className="chip h-5 bg-[color-mix(in_oklab,var(--success)_14%,transparent)] text-success-ink shadow-none">
                                New
                            </span>
                        </div>
                        <p className="text-xs text-muted-foreground text-pretty" data-update-tone={summary.tone}>
                            {summary.body}
                        </p>
                    </div>
                    {status.notes_url ? (
                        <Button asChild variant="secondary" size="sm" className="shrink-0">
                            <a href={status.notes_url} target="_blank" rel="noopener noreferrer">
                                Read the notes <ArrowRight aria-hidden="true" />
                            </a>
                        </Button>
                    ) : (
                        checkButton
                    )}
                </div>
                {highlights.length > 0 && (
                    <ul className="list-disc space-y-0.5 pl-5 text-xs leading-5 text-foreground marker:text-ink-3">
                        {highlights.map((h) => (
                            <li key={h}>{h}</li>
                        ))}
                    </ul>
                )}
                {summary.command && <CodeRow value={summary.command} label="update command" />}
                {checkedAt && <p className="text-2xs text-ink-3">Checked {checkedAgo(checkedAt)}</p>}
            </div>
        )
    } else {
        const title = status?.running ? `OneCamp ${bare(status.running)}` : summary ? summary.title : "OneCamp"
        const line = error
            ? error
            : !summary
              ? "Not checked yet. It asks only when you press Check, and sends nothing about this workspace."
              : summary.tone === "current"
                ? `You're up to date · checked ${checkedAgo(checkedAt ?? new Date())}`
                : summary.body
        row = (
            <div data-version-row="" className="set-row flex flex-wrap items-center gap-x-4 gap-y-2">
                <div className="min-w-0 flex-1 space-y-0.5">
                    <h3 className="text-heading text-foreground">{title}</h3>
                    <p className="text-xs text-muted-foreground text-pretty" aria-live="polite" data-update-tone={summary?.tone}>
                        <StatusWord tone={error ? "danger" : summary ? TONE[summary.tone] : "neutral"} className="text-muted-foreground">
                            {line}
                        </StatusWord>
                    </p>
                </div>
                {checkButton}
            </div>
        )
    }

    return (
        <SettingsSection id="health-updates" title="Updates">
            <SettingsCard>{row}</SettingsCard>
        </SettingsSection>
    )
}

export default UpdatesCard
