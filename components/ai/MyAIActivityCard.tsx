"use client"

/**
 * What the AI did for you — including when it was stopped.
 *
 * WHY THIS EXISTS. The product's central claim is that an agent can only do what
 * the person behind it could, and that a denied call leaves a row naming the
 * reason. Until now the only place that row could be read was the admin audit
 * screen, so the person an agent acts FOR could not see that it had been stopped
 * on their behalf. They had to take the guarantee on trust, which is exactly the
 * trust this product exists to replace.
 *
 * SCOPED BY THE SERVER, not by this component. The endpoint returns the caller's
 * own agent runs and the decisions recorded against them as the actor; the
 * workspace-wide log stays on the admin route. Nothing here filters anything,
 * because a client-side filter over a wider payload would be a privacy control
 * that the network tab defeats.
 *
 * It renders the same row as the admin feed, so a refusal looks the same to the
 * person it happened to as it does to the admin reviewing it.
 */

import * as React from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { useFetch } from "@/hooks/useFetch"
import { GetEndpointUrl } from "@/services/endPoints"
import { Loader2, Play, ShieldCheck } from "@/lib/icons"
import { SkeletonRows } from "@/components/ui/skeletonRows"
import { AIActivityRow } from "@/components/admin/AIActivityCard"
import { StepRow, AuditRowLine } from "@/components/admin/GovernanceDrillCard"
import type { AIActivityItem } from "@/services/aiActivityService"
import { apiErrorMessage } from "@/lib/utils/apiError"
import {
  getMyDrillStatus,
  runMyDrill,
  type DrillResult,
  type DrillStatus,
} from "@/services/governanceDrillService"
import { withAI } from "@/components/common/withFeature"

function MyAIActivityCard() {
  const { data, isLoading, mutate } = useFetch<{ data: AIActivityItem[] }>(
    `${GetEndpointUrl.MyAIActivity}?limit=25`,
  )
  const items = data?.data ?? []

  /* The drill, offered to the person rather than only to an admin. Status is
     read once: it answers whether the fixture exists, which changes about as
     often as a workspace is set up. */
  const [status, setStatus] = React.useState<DrillStatus>()
  const [result, setResult] = React.useState<DrillResult>()
  const [running, setRunning] = React.useState(false)
  const [error, setError] = React.useState("")

  React.useEffect(() => {
    let live = true
    getMyDrillStatus()
      .then((s) => {
        if (live) setStatus(s)
      })
      /* A workspace without the fixture simply has no button. It is not worth
         an error: nothing the reader can do about it belongs on this card. */
      .catch(() => undefined)
    return () => {
      live = false
    }
  }, [])

  const run = React.useCallback(async () => {
    setRunning(true)
    setError("")
    try {
      const res = await runMyDrill()
      setResult(res)
      /* The run writes the rows this list shows, so the evidence appears below
         the proof rather than after a reload. */
      await mutate()
    } catch (e) {
      setError(apiErrorMessage(e, "The drill could not run."))
    } finally {
      setRunning(false)
    }
  }, [mutate])

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="flex items-center gap-2 text-lg font-semibold">
              <ShieldCheck className="h-4 w-4 text-muted-foreground" />
              What the AI did for you
            </CardTitle>
            <CardDescription>
              Every action an agent took as you, and every one it was refused. Your own
              record: an admin sees the whole workspace, you see yourself.
            </CardDescription>
          </div>
          {status?.seeded ? (
            <Button size="sm" variant="outline" onClick={run} disabled={running} className="shrink-0">
              {running ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Play className="mr-1.5 h-3.5 w-3.5" />
              )}
              {running ? "Running" : "Prove it"}
            </Button>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {error ? (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}

        {result ? (
          <div className="space-y-3 rounded-lg border border-border bg-muted/20 p-3">
            <p className="text-sm font-medium">
              {result.passed
                ? `An agent acting as you tried to post in #${status?.forbidden_channel} and was refused.`
                : "The drill did not pass. The steps below say which part."}
            </p>
            {result.refusal_reason ? (
              /* The permission layer's own sentence, quoted rather than
                 paraphrased: a demo that rewords the refusal invites the
                 question of whether the refusal was real. */
              <p className="text-sm text-muted-foreground">“{result.refusal_reason}”</p>
            ) : null}
            <ol className="space-y-1.5">
              {result.steps.map((step, i) => (
                <StepRow key={step.name} step={step} index={i} />
              ))}
            </ol>
            {result.rows?.length ? (
              <div className="rounded-md border border-border bg-card">
                {result.rows.map((row) => (
                  <AuditRowLine key={row.id} row={row} />
                ))}
              </div>
            ) : null}
          </div>
        ) : null}

        {isLoading ? (
          <div role="status" aria-label="Loading your AI activity" className="py-1">
            <SkeletonRows rows={3} />
          </div>
        ) : items.length === 0 ? (
          /* An empty feed is a fact, not a failure: nothing has acted as you yet.
             Saying what WOULD appear is what stops it reading as broken, and
             where the drill exists the reader can stop waiting and make one
             happen. */
          <p className="py-6 text-sm text-muted-foreground">
            {status?.seeded
              ? "Nothing yet. Press Prove it and an agent acting as you will try to post in a channel you are not in."
              : "Nothing yet. When an agent acts as you, or is stopped from acting, it appears here with the reason."}
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-border/60">
            {items.map((it, i) => (
              <AIActivityRow key={i} item={it} />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

/**
 * Gated on AI availability, not left to the page that mounts it.
 *
 * The repo's own guard caught this: an AI component rendered from outside
 * components/ai has to defend itself, because on the AI-free edition — and on v2
 * with AI switched off — it would otherwise render a card whose every call fails.
 * The agents page already checks availability before reaching here; relying on
 * that would make this component correct only from one call site.
 */
export default withAI(MyAIActivityCard)
