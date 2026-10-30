"use client"

/**
 * GovernanceDrillCard — prove the limit holds, on this install, right now.
 *
 * WHY THIS EXISTS. The product's central claim is that an agent can only do what
 * the person behind it could, that the decision is written before the tool runs,
 * and that refusals are on the record in a hash chain. All of it is implemented.
 * NONE OF IT IS VISIBLE. A buyer can finish the entire demo without seeing a
 * single refusal, so the one thing a competitor cannot copy next month is also the
 * one thing nobody is ever shown — and an admin who has to take a permission
 * model on faith is being asked for exactly the trust this product exists to
 * replace.
 *
 * IT CAN FAIL, AND A FAILURE IS NOT A FAILED TEST. If the forbidden post
 * succeeds, this install wrote a message into a private channel on behalf of
 * somebody who is not in it. That is an incident, and it is rendered as one: not a
 * red chip beside a green one, but a statement of what happened and what to do.
 * Colour alone never carries it — every state has an icon and a sentence.
 *
 * SETUP IS EXPLICIT AND NAMESPACED. The drill needs two channels and it creates
 * them only when asked, as #drill-engineering and #drill-finance. The story says
 * "#finance"; the product must never create that, because a customer's finance
 * team may already have it.
 */

import React, { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { busyWith } from "@/lib/ui/busyWith"
import { SkeletonRows } from "@/components/ui/skeletonRows"
import { ErrorState } from "@/components/ui/error-state"
import { SettingsSection, sectionActionClass } from "@/components/ui/settingsSection"
import {
    AlertTriangle,
    CheckCircle2,
    Fingerprint,
    Loader2,
    Play,
    ShieldAlert,
    ShieldX,
} from "@/lib/icons"
import { apiErrorMessage } from "@/lib/utils/apiError"
import { ChainPair } from "@/components/admin/ChainPair"
import { Spark } from "@/components/ui/graphics/motifs"
import { useStagger } from "@/components/admin/ai/useStagger"
import {
    getDrillStatus,
    runDrill,
    setupDrill,
    type DrillAuditRow,
    type DrillResult,
    type DrillStatus,
    type DrillStep,
} from "@/services/governanceDrillService"
import { clockTime } from "@/lib/utils/date/clock"

/**
 * Where the audit log lives in this admin page. One definition, so the link and
 * the tab cannot drift apart: the log is a card inside the Settings tab, and the
 * anchor scrolls past the cards above it.
 */
const AUDIT_LOG_HREF = "/app/admin?tab=audit#audit-log"

function formatWhen(iso: string): string {
    if (!iso) return ""
    const d = new Date(iso)
    return Number.isNaN(d.getTime()) ? "" : clockTime(d)
}

// One row of the steps list: the list draws the border, each row a hairline,
// where every step used to be a bordered card of its own.
export const StepRow: React.FC<{ step: DrillStep; index: number }> = ({ step, index }) => (
    <li className="flex items-start gap-3 px-4 py-3">
        {step.ok ? (
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success-ink" />
        ) : (
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-danger-ink" />
        )}
        <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-2">
                {/* Numbered because this genuinely is a sequence: each step only
                    means something given the one above it. */}
                <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{index + 1}</span>
                <span className="text-sm font-medium">{step.name}</span>
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">{step.explain}</p>
            {step.detail ? (
                <p className="mt-1.5 text-xs font-medium text-danger-ink">{step.detail}</p>
            ) : null}
        </div>
    </li>
)

export const AuditRowLine: React.FC<{ row: DrillAuditRow }> = ({ row }) => (
    <div className="border-t border-border px-3 py-2 text-xs first:border-t-0">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="shrink-0 font-mono tabular-nums text-muted-foreground">#{row.seq}</span>
            <span className="shrink-0 font-mono font-medium">{row.action}</span>
            <span className="min-w-0 flex-1 text-muted-foreground">{row.summary}</span>
        </div>
        {/* The same component the activity feed uses, so one event reads the same
            way wherever it is shown. */}
        {row.entry_hash ? (
            <ChainPair prevHash={row.prev_hash} entryHash={row.entry_hash} className="mt-1" />
        ) : null}
    </div>
)

/** The gap between the drill's three rows (admin §A15b). Presentation only. */
export const DRILL_STAGGER_MS = 400

/**
 * The drill as a short sequence (design v3, admin §A15b): the ask, the check
 * against the access of the person behind the agent, and the verdict, one
 * row every 400ms, the refusal's shield springing in; then where it is on the
 * record. Every word of the verdict is the server's: the refusal quoted is
 * the permission layer's own. Under reduced motion the rows appear together.
 */
export const DrillSequence: React.FC<{ result: DrillResult; forbidden: string }> = ({ result, forbidden }) => {
    const shown = useStagger(3, DRILL_STAGGER_MS)
    const refused = result.passed || !!result.refusal_reason
    const rows: { key: string; tone?: "refused" | "incident"; glyph: React.ReactNode; text: React.ReactNode; detail?: React.ReactNode }[] = [
        {
            key: "ask",
            glyph: <Spark className="size-3.5 text-agent" />,
            text: (
                <>
                    An agent acting for you asks to post in <span className="font-mono">#{forbidden}</span>
                </>
            ),
        },
        { key: "check", glyph: <Fingerprint className="size-3.5" />, text: "Checked against your access before the tool runs" },
        refused
            ? {
                  key: "verdict",
                  tone: "refused",
                  glyph: <ShieldX className="size-3.5" />,
                  text: <span className="font-medium text-danger-ink">Refused</span>,
                  detail: result.refusal_reason,
              }
            : {
                  key: "verdict",
                  tone: "incident",
                  glyph: <ShieldAlert className="size-3.5" />,
                  text: <span className="font-medium text-danger-ink">It went through. Treat this as an incident.</span>,
              },
    ]
    return (
        <div data-settings-card="" data-drill-sequence="" className="set-card" aria-live="polite">
            <ol>
                {rows.slice(0, shown).map((r) => (
                    <li key={r.key} data-drill-row={r.key} data-tone={r.tone} className="ai-drill-row">
                        <span className="ai-drill-glyph" aria-hidden="true">
                            {r.glyph}
                        </span>
                        <span className="min-w-0 flex-1 text-sm">
                            {r.text}
                            {r.detail ? <span className="mt-0.5 block font-mono text-2xs text-muted-foreground">{r.detail}</span> : null}
                        </span>
                    </li>
                ))}
            </ol>
            {shown === 3 ? (
                <p data-drill-recorded="" className="px-4 pb-3 pt-1 text-xs">
                    <Link className="font-medium text-brand-text underline-offset-2 hover:underline" href={AUDIT_LOG_HREF}>
                        Recorded in the audit log →
                    </Link>
                </p>
            ) : null}
        </div>
    )
}

const GovernanceDrillCard: React.FC = () => {
    const [status, setStatus] = useState<DrillStatus | undefined>(undefined)
    const [result, setResult] = useState<DrillResult | undefined>(undefined)
    const [loading, setLoading] = useState(true)
    const [busy, setBusy] = useState<"setup" | "run" | undefined>(undefined)
    // Two different failures, said in two different places. A failed READ means
    // the card doesn't know whether the drill is set up, so it offers neither
    // action and shows the section's error state with Try again. A failed
    // ACTION (setting up, running) is said in a line beside the action, which
    // stays. Both used to be one red banner, and a failed read went on
    // offering "Set it up" as if it knew.
    const [loadError, setLoadError] = useState("")
    const [actionError, setActionError] = useState<{ what: string; why: string } | null>(null)

    const loadStatus = useCallback(async () => {
        setLoading(true)
        setLoadError("")
        try {
            setStatus(await getDrillStatus())
        } catch (e) {
            setLoadError(apiErrorMessage(e, "Try again in a moment."))
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => {
        void loadStatus()
    }, [loadStatus])

    const onSetup = useCallback(async () => {
        setBusy("setup")
        setActionError(null)
        try {
            setStatus(await setupDrill())
        } catch (e) {
            setActionError({ what: "Couldn't set up the drill", why: apiErrorMessage(e, "Try again in a moment.") })
        } finally {
            setBusy(undefined)
        }
    }, [])

    const onRun = useCallback(async () => {
        setBusy("run")
        setActionError(null)
        // Cleared first: a stale PASSED sitting above a spinner is the one thing
        // this card must never show.
        setResult(undefined)
        try {
            setResult(await runDrill())
        } catch (e) {
            setActionError({ what: "Couldn't run the drill", why: apiErrorMessage(e, "Try again in a moment.") })
        } finally {
            setBusy(undefined)
        }
    }, [])

    const seeded = status?.seeded === true
    const forbidden = status?.forbidden_channel || "drill-finance"
    const allowed = status?.allowed_channel || "drill-engineering"
    const known = !loading && !loadError

    // A section of the AI tab like the others: its heading and one line, with
    // the tab's one primary action on the title's row.
    return (
        <SettingsSection
            title="Governance drill"
            description="Ask an agent to post where the person behind it cannot, and watch what this install does. The attempt is recorded before it is tried, so the refusal is evidence rather than a claim."
            action={
                // Nothing to offer until the card knows whether the drill is set up.
                loadError ? undefined : seeded ? (
                    <Button size="sm" className={sectionActionClass} onClick={onRun} {...busyWith(busy, "run")}>
                        <Play />
                        Run the drill
                    </Button>
                ) : (
                    <Button size="sm" variant="outline" className={sectionActionClass} onClick={onSetup} disabled={loading || busy !== undefined}>
                        Set it up
                    </Button>
                )
            }
        >
            <div className="space-y-4">
                {loading ? (
                    <div role="status" aria-label="Checking whether the drill is set up">
                        <SkeletonRows rows={2} avatar={false} lines={1} />
                    </div>
                ) : null}

                {loadError ? (
                    <ErrorState compact subject="the governance drill" detail={loadError} onRetry={() => void loadStatus()} />
                ) : null}

                {actionError ? (
                    <p role="alert" className="flex items-start gap-2 text-sm text-danger-ink">
                        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                        <span>
                            <span className="font-medium">{actionError.what}.</span> {actionError.why}
                        </span>
                    </p>
                ) : null}

                {known && !seeded ? (
                    <p className="text-sm text-muted-foreground">
                        Setting up creates two private channels, <span className="font-mono">#{allowed}</span> and{" "}
                        <span className="font-mono">#{forbidden}</span>, and removes you from the second one so there is
                        something real to be refused. Nothing else in the workspace is touched, and the names are
                        prefixed so they cannot collide with channels you already use.
                    </p>
                ) : null}

                {known && seeded && !result && busy !== "run" ? (
                    <p className="text-sm text-muted-foreground">
                        Ready. The drill will ask an agent acting for you to post in{" "}
                        <span className="font-mono">#{forbidden}</span>, which you are not a member of. It runs through
                        the same executor a real agent tool call goes through, so nothing here is a simulation.
                    </p>
                ) : null}

                {result ? (
                    <>
                        <DrillSequence key={result.ran_at} result={result} forbidden={forbidden} />
                        {/* The verdict in words, under the sequence. An admin who
                            reads one line should read the right one. */}
                        <p className={`text-sm ${result.passed ? "text-foreground" : "font-medium text-danger-ink"}`}>
                            {result.passed
                                ? "The limit held, and the attempt is on the record."
                                : "This install did not do what it promises. Read the failing step below."}{" "}
                            <span className="text-xs text-muted-foreground">
                                Checked at {formatWhen(result.ran_at)}. The chain was recomputed over{" "}
                                <span className="tabular-nums">{result.chain_checked.toLocaleString()}</span>{" "}
                                {result.chain_partial ? "recent entries" : "entries, the whole log"}.
                            </span>
                        </p>

                        <ol data-settings-card="" className="set-card divide-y divide-border">
                            {result.steps.map((step, i) => (
                                <StepRow key={step.name} step={step} index={i} />
                            ))}
                        </ol>

                        {result.refusal_reason ? (
                            <div>
                                <p className="mb-1.5 text-xs font-medium text-muted-foreground">
                                    What the permission layer said, word for word
                                </p>
                                <p className="ai-sunken-note rounded-lg px-3 py-2 font-mono text-xs">
                                    {result.refusal_reason}
                                </p>
                            </div>
                        ) : null}

                        {result.rows && result.rows.length > 0 ? (
                            <div>
                                <p className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                                    <Fingerprint className="h-3.5 w-3.5" />
                                    The rows this run wrote, read back from the log
                                </p>
                                <div data-settings-card="" className="set-card overflow-x-auto">
                                    <div className="min-w-[32rem]">
                                        {result.rows.map((row) => (
                                            <AuditRowLine key={row.id} row={row} />
                                        ))}
                                    </div>
                                </div>
                                <p className="mt-1.5 text-xs text-muted-foreground">
                                    Sequence numbers and hashes are the ones in the database, not rendered from this
                                    result.{" "}
                                    {/* In-app: a plain <a> reloaded the whole app to open a tab of it. */}
                                    <Link className="underline underline-offset-2 hover:text-foreground" href={AUDIT_LOG_HREF}>
                                        Open the audit log
                                    </Link>{" "}
                                    to find these rows, verify the whole chain, or export it and check the hashes
                                    somewhere that is not this page.
                                </p>
                            </div>
                        ) : null}

                        {!result.chain_ok && result.chain_message ? (
                            <p className="text-xs font-medium text-danger-ink">{result.chain_message}</p>
                        ) : null}

                        {/* Stated, not buried. A window proves the links inside it and
                            seeds from one stored hash it takes on trust, so it cannot
                            see an edit made before it. Letting "the last 500 verify"
                            read as "the log is intact" would be the exact overstatement
                            this feature exists to prevent. */}
                        {result.chain_ok && result.chain_partial ? (
                            <p className="text-xs text-muted-foreground">
                                This checked the most recent entries
                                {result.chain_from_seq ? ` (from #${result.chain_from_seq} onwards)` : ""}, not the
                                whole log, so it runs fast enough to click. For the full chain from its first entry,
                                use Verify in the audit log.
                            </p>
                        ) : null}

                        <div className="flex items-center gap-2">
                            <Button size="sm" variant="outline" onClick={onRun} disabled={busy !== undefined}>
                                {busy === "run" ? <Loader2 className="animate-spin" /> : <Play />}
                                Run it again
                            </Button>
                            <p className="text-xs text-muted-foreground">Each run writes its own rows.</p>
                        </div>
                    </>
                ) : null}
            </div>
        </SettingsSection>
    )
}

export default GovernanceDrillCard
