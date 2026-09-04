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
    const { toast } = useToast()

    const load = useCallback(async () => {
        setLoading(true)
        try {
            setReview(await reviewAgentLearning(agentId))
        } catch {
            setReview(null)
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
            toast({ title: "Added to this agent's evaluation suite" })
        } catch {
            toast({ title: "Could not create the scenario", variant: "destructive" })
        } finally {
            setAccepting(null)
        }
    }

    const proposals = (review?.scenario_proposals ?? []).filter((p) => !accepted.has(p.run_id))
    const patterns: FailurePattern[] = review?.failure_patterns ?? []
    const nothingToShow = !loading && proposals.length === 0 && patterns.length === 0

    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <Sparkles className="size-4" />
                    What this agent&apos;s history suggests
                </CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
                {loading && <p className="text-sm text-muted-foreground">Reading recent runs…</p>}

                {nothingToShow && (
                    <p className="text-sm text-muted-foreground">
                        {review && review.runs_considered === 0
                            ? "No runs in the last 30 days, so there is nothing to learn from yet."
                            : `Nothing to suggest from the last ${review?.runs_considered ?? 0} runs. That means they went well.`}
                    </p>
                )}

                {proposals.length > 0 && (
                    <div className="space-y-2">
                        <p className="text-xs uppercase tracking-wide text-muted-foreground">
                            Runs that went wrong, as tests that would catch them
                        </p>
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
                                    <Button size="sm" onClick={() => void accept(p)} disabled={accepting === p.run_id}>
                                        {accepting === p.run_id && <Loader2 className="mr-2 size-3.5 animate-spin" />}
                                        Add as a scenario
                                    </Button>
                                    <span className="text-2xs text-muted-foreground">
                                        {new Date(p.ran_at).toLocaleDateString()}
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {patterns.length > 0 && (
                    <div className="space-y-2">
                        <p className="text-xs uppercase tracking-wide text-muted-foreground">
                            Things that keep happening
                        </p>
                        {patterns.map((f) => (
                            <div key={`${f.kind}:${f.subject}`} className="rounded-lg border p-3 text-sm">
                                <p className="font-medium text-foreground">
                                    {f.subject}
                                    <span className="ml-2 font-normal text-muted-foreground">
                                        {f.count} runs
                                    </span>
                                </p>
                                <p className="mt-1 text-xs text-muted-foreground">{f.suggestion}</p>
                            </div>
                        ))}
                    </div>
                )}

                {/* The sample, so an empty screen is distinguishable from a broken one. */}
                {!loading && review && review.runs_without_prompt > 0 && (
                    <p className="text-2xs text-muted-foreground">
                        {review.runs_without_prompt} of {review.runs_considered} runs predate prompts being
                        recorded, so they cannot become scenarios.
                    </p>
                )}
            </CardContent>
        </Card>
    )
}

export default AgentLearningSection
