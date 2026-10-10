"use client"

/**
 * AgentLearningSection — what this agent's own history suggests.
 *
 * The loop everything else was already built for. Runs recorded their prompt,
 * their tools, their failures and their governance refusals; scenarios scored
 * runs deterministically; skills carried revisions. Nothing read any of it, so
 * an agent that failed the same way every week failed the same way every week.
 *
 * NOTHING HERE IS APPLIED AUTOMATICALLY. A proposal becomes a scenario when a
 * person accepts it, through the same endpoint a hand-written scenario uses, so
 * an accepted proposal is indistinguishable from a typed one afterwards. A
 * product whose case is that agent behaviour is governed and reviewable cannot
 * be the product that rewrites its own instructions while nobody is looking.
 *
 * The patterns propose attention rather than prose. A count is evidence that
 * something needs saying; it is not evidence of what to say, and inventing the
 * wording from a count is the confident guess this whole codebase avoids.
 */

import React, { useCallback, useEffect, useState } from "react"

import {
    createEvalScenario,
    reviewAgentLearning,
    type FailurePattern,
    type LearningReview,
    type ScenarioProposal,
} from "@/services/agentService"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Loader2, Sparkles } from "@/lib/icons"
import { useToast } from "@/hooks/use-toast"
import { SkeletonRows } from "@/components/ui/skeletonRows"
import { Tile } from "@/components/ui/graphics/Tile"
import { ADMIN_GROUP_HUE } from "@/components/admin/adminHues"
import { apiErrorMessage } from "@/lib/utils/apiError"
import { shortDate } from "@/lib/utils/date/shortDate"

/** The assertion a proposal would create, in words rather than JSON. */
function assertionOf(p: ScenarioProposal): string {
    const parts: string[] = []
    if (p.expectations.expected_tools?.length) {
        parts.push(`${p.expectations.expected_tools.join(", ")} must succeed`)
    }
    if (p.expectations.expected_status) {
        parts.push(`the run must end ${p.expectations.expected_status}`)
    }
    return parts.length ? parts.join(", and ") : "the run must not fail"
}

export const AgentLearningSection: React.FC<{ agentId: string }> = ({ agentId }) => {
    const [review, setReview] = useState<LearningReview | null>(null)
    const [loading, setLoading] = useState(true)
    const [accepting, setAccepting] = useState<string | null>(null)
    // Accepted run ids, so a row that is now a scenario stops offering itself
    // without needing a refetch the operator did not ask for.
    const [accepted, setAccepted] = useState<Set<string>>(new Set())
    // A failed read used to leave nothing to show, and the copy for nothing to
    // show is "Nothing to suggest from the last 0 runs. That means they went
    // well." A claim about the agent, from a request that failed.
    const [failed, setFailed] = useState(false)
    const { toast } = useToast()

    const load = useCallback(async () => {
        setLoading(true)
        try {
            setReview(await reviewAgentLearning(agentId))
            setFailed(false)
        } catch {
            setFailed(true)
        } finally {
            setLoading(false)
        }
    }, [agentId])

    useEffect(() => {
        void load()
    }, [load])

    const accept = async (p: ScenarioProposal) => {
        if (accepting) return
        setAccepting(p.run_id)
        try {
            await createEvalScenario(agentId, {
                name: p.name,
                prompt: p.prompt,
                expectations: p.expectations,
                is_active: true,
            })
            setAccepted((prev) => new Set(prev).add(p.run_id))
            toast({ title: "Added to this agent's saved tests" })
        } catch (e) {
            toast({ title: "Couldn't add the test", description: apiErrorMessage(e, "Try again in a moment."), variant: "destructive" })
        } finally {
            setAccepting(null)
        }
    }

    const proposals = (review?.scenario_proposals ?? []).filter((p) => !accepted.has(p.run_id))
    const patterns: FailurePattern[] = review?.failure_patterns ?? []
    const nothingToShow = !loading && !failed && review !== null && proposals.length === 0 && patterns.length === 0

    return (
        <Card>
            <CardHeader>
                {/* The title's icon on the AI and automation group's tile. */}
                <CardTitle as="h3" className="flex items-center gap-2.5 text-base font-semibold">
                    <Tile hue={ADMIN_GROUP_HUE.ai} size="sm">
                        <Sparkles />
                    </Tile>
                    What this agent&apos;s history suggests
                </CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
                {loading && !review && (
                    <div role="status" aria-label="Reading recent runs">
                        <SkeletonRows rows={2} avatar={false} />
                    </div>
                )}

                {failed && !loading && (
                    <div className="flex flex-wrap items-center gap-2">
                        <p role="alert" className="text-sm text-muted-foreground">
                            Couldn&apos;t read this agent&apos;s recent runs.
                        </p>
                        <Button variant="outline" size="sm" className="h-8" onClick={() => void load()}>
                            Try again
                        </Button>
                    </div>
                )}

                {nothingToShow && (
                    <p className="text-sm text-muted-foreground">
                        {review && review.runs_considered === 0
                            ? "No runs in the last 30 days, so there is nothing to learn from yet."
                            : `Nothing to suggest from the last ${review?.runs_considered ?? 0} runs. That means they went well.`}
                    </p>
                )}

                {proposals.length > 0 && (
                    <div className="space-y-2">
                        <h4 className="text-xs font-medium text-muted-foreground">
                            Runs that went wrong, as tests that would catch them
                        </h4>
                        {proposals.map((p) => (
                            <div key={p.run_id} className="rounded-lg border p-3 text-sm">
                                <p className="font-medium text-foreground">{p.why}</p>
                                <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                                    Asked: {p.prompt}
                                </p>
                                <p className="mt-1 text-xs text-muted-foreground">
                                    Would assert: {assertionOf(p)}
                                </p>
                                <div className="mt-2 flex items-center gap-2">
                                    {/* Outline: there is one of these per suggestion,
                                        and the dialog's one primary action is Save. */}
                                    <Button size="sm" variant="outline" onClick={() => void accept(p)} disabled={accepting === p.run_id}>
                                        {accepting === p.run_id && <Loader2 className="mr-2 size-3.5 animate-spin" />}
                                        Add as a test
                                    </Button>
                                    <span className="text-xs text-muted-foreground">
                                        {shortDate(new Date(p.ran_at))}
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {patterns.length > 0 && (
                    <div className="space-y-2">
                        <h4 className="text-xs font-medium text-muted-foreground">
                            Things that keep happening
                        </h4>
                        {patterns.map((f) => (
                            <div key={`${f.kind}:${f.subject}`} className="rounded-lg border p-3 text-sm">
                                <p className="font-medium text-foreground">
                                    {f.subject}
                                    <span className="ml-2 font-normal text-muted-foreground">
                                        {f.count} {f.count === 1 ? "run" : "runs"}
                                    </span>
                                </p>
                                <p className="mt-1 text-xs text-muted-foreground">{f.suggestion}</p>
                            </div>
                        ))}
                    </div>
                )}

                {/* The sample, so an empty screen is distinguishable from a broken one. */}
                {!loading && review && review.runs_without_prompt > 0 && (
                    <p className="text-xs text-muted-foreground">
                        {review.runs_without_prompt} of {review.runs_considered} runs are from before prompts were
                        recorded, so they can&apos;t become tests.
                    </p>
                )}
            </CardContent>
        </Card>
    )
}

