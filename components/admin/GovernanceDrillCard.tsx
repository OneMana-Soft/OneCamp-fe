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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
    AlertTriangle,
    CheckCircle2,
    Fingerprint,
    Loader2,
    Lock,
    Play,
    ShieldAlert,
    ShieldCheck,
} from "@/lib/icons"
import { apiErrorMessage } from "@/lib/utils/apiError"
import {
    getDrillStatus,
    runDrill,
    setupDrill,
    type DrillAuditRow,
    type DrillResult,
    type DrillStatus,
    type DrillStep,
} from "@/services/governanceDrillService"

/**
 * Where the audit log lives in this admin page. One definition, so the link and
 * the tab cannot drift apart: the log is a card inside the Settings tab, and the
 * anchor scrolls past the cards above it.
 */
const AUDIT_LOG_HREF = "/app/admin?tab=settings#audit-log"

/** A hash is identified by its ends; the middle is noise at this size. */
function shortHash(hash?: string): string {
    if (!hash || hash.length <= 16) return hash || ""
    return `${hash.slice(0, 8)}…${hash.slice(-8)}`
}

function formatWhen(iso: string): string {
    if (!iso) return ""
    const d = new Date(iso)
    return Number.isNaN(d.getTime()) ? "" : d.toLocaleTimeString()
}

export const StepRow: React.FC<{ step: DrillStep; index: number }> = ({ step, index }) => (
    <li className="flex items-start gap-3 rounded-lg border border-border bg-card px-3 py-2.5">
        {step.ok ? (
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />
        ) : (
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
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
                <p className="mt-1.5 text-xs font-medium text-destructive">{step.detail}</p>
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
        {/* Both hashes, never just one. A single fingerprint demonstrates nothing;
            the LINK is the claim, so the row shows what it carried forward and what
            it produced. */}
        {row.entry_hash ? (
            <div className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-0.5 font-mono text-[0.7rem] text-muted-foreground">
                <span title={row.prev_hash || "nothing: this is the first entry in the chain"}>
                    prev {row.prev_hash ? shortHash(row.prev_hash) : "— first entry"}
                </span>
                <span aria-hidden>→</span>
                <span title={row.entry_hash}>this {shortHash(row.entry_hash)}</span>
            </div>
        ) : null}
    </div>
)

const GovernanceDrillCard: React.FC = () => {
    const [status, setStatus] = useState<DrillStatus | undefined>(undefined)
    const [result, setResult] = useState<DrillResult | undefined>(undefined)
    const [loading, setLoading] = useState(true)
    const [busy, setBusy] = useState<"setup" | "run" | undefined>(undefined)
    const [error, setError] = useState("")

    const loadStatus = useCallback(async () => {
        setLoading(true)
        try {
            setStatus(await getDrillStatus())
            setError("")
        } catch (e) {
            setError(apiErrorMessage(e))
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => {
        void loadStatus()
    }, [loadStatus])

    const onSetup = useCallback(async () => {
        setBusy("setup")
        setError("")
        try {
            setStatus(await setupDrill())
        } catch (e) {
            setError(apiErrorMessage(e))
        } finally {
            setBusy(undefined)
        }
    }, [])

    const onRun = useCallback(async () => {
        setBusy("run")
        setError("")
        // Cleared first: a stale PASSED sitting above a spinner is the one thing
        // this card must never show.
        setResult(undefined)
        try {
            setResult(await runDrill())
        } catch (e) {
            setError(apiErrorMessage(e))
        } finally {
            setBusy(undefined)
        }
    }, [])

    const seeded = status?.seeded === true
    const forbidden = status?.forbidden_channel || "drill-finance"
    const allowed = status?.allowed_channel || "drill-engineering"

    return (
        <Card>
            <CardHeader>
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                        <CardTitle className="flex items-center gap-2">
                            <Lock className="h-4 w-4 text-muted-foreground" />
                            Governance drill
                        </CardTitle>
                        <CardDescription>
                            Ask an agent to post where the person behind it cannot, and watch what this
                            install does. The attempt is recorded before it is tried, so the refusal is
                            evidence rather than a claim.
                        </CardDescription>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                        {seeded ? (
                            <Button size="sm" onClick={onRun} disabled={busy !== undefined}>
                                {busy === "run" ? (
                                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                                ) : (
                                    <Play className="mr-1.5 h-3.5 w-3.5" />
                                )}
                                Run the drill
                            </Button>
                        ) : (
                            <Button size="sm" variant="outline" onClick={onSetup} disabled={loading || busy !== undefined}>
                                {busy === "setup" ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
                                Set it up
                            </Button>
                        )}
                    </div>
                </div>
            </CardHeader>

            <CardContent className="space-y-4">
                {loading ? (
                    <p className="text-sm text-muted-foreground">Checking whether the drill is set up…</p>
                ) : null}

                {error ? (
                    <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2">
                        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                        <p className="text-sm text-destructive">{error}</p>
                    </div>
                ) : null}

                {!loading && !seeded && !error ? (
                    <p className="text-sm text-muted-foreground">
                        Setting up creates two private channels, <span className="font-mono">#{allowed}</span> and{" "}
                        <span className="font-mono">#{forbidden}</span>, and removes you from the second one so there is
                        something real to be refused. Nothing else in the workspace is touched, and the names are
                        prefixed so they cannot collide with channels you already use.
                    </p>
                ) : null}

                {seeded && !result && busy !== "run" ? (
                    <p className="text-sm text-muted-foreground">
                        Ready. The drill will ask an agent acting for you to post in{" "}
                        <span className="font-mono">#{forbidden}</span>, which you are not a member of. It runs through
                        the same executor a real agent tool call goes through, so nothing here is a simulation.
                    </p>
                ) : null}

                {result ? (
                    <>
                        {/* The verdict, stated before the detail. An admin who reads one
                            line should read the right one. */}
                        {result.passed ? (
                            <div className="flex items-start gap-2 rounded-lg border border-success/30 bg-success/10 px-3 py-2.5">
                                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                                <div className="min-w-0">
                                    <p className="text-sm font-medium text-success">
                                        The limit held, and the attempt is on the record.
                                    </p>
                                    <p className="mt-0.5 text-xs text-muted-foreground">
                                        Checked at {formatWhen(result.ran_at)}. The chain was recomputed over{" "}
                                        <span className="tabular-nums">{result.chain_checked.toLocaleString()}</span>{" "}
                                        {result.chain_partial ? "recent entries" : "entries, the whole log"}.
                                    </p>
                                </div>
                            </div>
                        ) : (
                            <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2.5">
                                <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                                <div className="min-w-0">
                                    <p className="text-sm font-medium text-destructive">
                                        This install did not do what it promises. Read the failing step below.
                                    </p>
                                    <p className="mt-0.5 text-xs text-muted-foreground">
                                        Checked at {formatWhen(result.ran_at)}. Treat a post that went through as an
                                        incident rather than a failed test.
                                    </p>
                                </div>
                            </div>
                        )}

                        <ol className="space-y-2">
                            {result.steps.map((step, i) => (
                                <StepRow key={step.name} step={step} index={i} />
                            ))}
                        </ol>

                        {result.refusal_reason ? (
                            <div>
                                <p className="mb-1.5 text-xs font-medium text-muted-foreground">
                                    What the permission layer said, word for word
                                </p>
                                <p className="rounded-lg border border-border bg-muted/40 px-3 py-2 font-mono text-xs">
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
                                <div className="overflow-x-auto rounded-lg border border-border">
                                    <div className="min-w-[32rem]">
                                        {result.rows.map((row) => (
                                            <AuditRowLine key={row.id} row={row} />
                                        ))}
                                    </div>
                                </div>
                                <p className="mt-1.5 text-xs text-muted-foreground">
                                    Sequence numbers and hashes are the ones in the database, not rendered from this
                                    result.{" "}
                                    <a className="underline underline-offset-2 hover:text-foreground" href={AUDIT_LOG_HREF}>
                                        Open the audit log
                                    </a>{" "}
                                    to find these rows, verify the whole chain, or export it and check the hashes
                                    somewhere that is not this page.
                                </p>
                            </div>
                        ) : null}

                        {!result.chain_ok && result.chain_message ? (
                            <p className="text-xs font-medium text-destructive">{result.chain_message}</p>
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
                                {busy === "run" ? (
                                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                                ) : (
                                    <Play className="mr-1.5 h-3.5 w-3.5" />
                                )}
                                Run it again
                            </Button>
                            <Badge variant="outline" className="font-normal">
                                every run writes its own rows
                            </Badge>
                        </div>
                    </>
                ) : null}
            </CardContent>
        </Card>
    )
}

export default GovernanceDrillCard
