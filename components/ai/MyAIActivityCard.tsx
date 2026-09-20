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
import { Download, Loader2, Play, ShieldCheck } from "@/lib/icons"
import { SkeletonRows } from "@/components/ui/skeletonRows"
import { AIActivityRow } from "@/components/admin/AIActivityCard"
import { StepRow, AuditRowLine } from "@/components/admin/GovernanceDrillCard"
import type { AIActivityItem } from "@/services/aiActivityService"
import { apiErrorMessage } from "@/lib/utils/apiError"
import { downloadMyAIRecord } from "@/services/aiActivityService"
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

  // Saving the record is a fetch, so it can fail, and failing silently on a
  // button labelled "download" is the worst version of this. Reported inline
  // beside the drill's errors rather than as a toast, because this card
  // already has one place where it says what went wrong.
  const [saving, setSaving] = React.useState(false)
  const saveRecord = React.useCallback(async () => {
    setSaving(true)
    setError("")
    try {
      await downloadMyAIRecord()
    } catch (e) {
      setError(apiErrorMessage(e, "The record could not be saved."))
    } finally {
      setSaving(false)
    }
  }, [])

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

  /**
   * Arriving from the marketing site's "Run the drill" link.
   *
   * That button used to sign a visitor in and leave them on the home screen,
   * several clicks from the thing it named. The link now lands here and says
   * what it came for, and this runs it once so the promise on the button is
   * the thing that happens.
   *
   * GATED ON THE FIXTURE, not on the parameter. status.seeded comes from the
   * server and is only true where the drill's demo fixture exists, so a
   * customer's own install ignores the parameter entirely and a link cannot
   * make somebody's workspace do work by being clicked.
   *
   * One shot, and the parameter is cleared, so a refresh does not run it
   * again and a copied URL is just a link to this card.
   */
  const autoRan = React.useRef(false)
  /**
   * Whether this visit asked for the drill.
   *
   * Somebody arriving from the marketing button pressed something called "run
   * the drill" and lands on a card titled "What the AI did for you", written
   * for an employee of a company already using this. Nothing connected the two,
   * and the run itself is a small button briefly reading "Running": fast
   * enough that a visitor can meet the finished result without seeing anything
   * happen, which is the opposite of what they came to watch.
   */
  const [asked, setAsked] = React.useState(false)

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

  React.useEffect(() => {
    if (autoRan.current || running) return
    if (!status?.seeded) return
    const params = new URLSearchParams(window.location.search)
    if (params.get("run") !== "drill") return
    autoRan.current = true
    setAsked(true)
    // Clear it first: a refresh mid-run must not start a second one, and a URL
    // somebody copies out of the bar should be a link, not an instruction.
    params.delete("run")
    const qs = params.toString()
    window.history.replaceState({}, "", window.location.pathname + (qs ? `?${qs}` : ""))
    void run()
  }, [status?.seeded, running, run])


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
              record: an admin sees the whole workspace, you see yourself. The download
              carries the steps for checking it, so anyone can, without this workspace.
            </CardDescription>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {/* The record, as a file. A row on a screen is something this
                workspace is telling you; the same row with the recipe for
                recomputing its hash is something you can check, and check
                somewhere else, which is the difference between a claim and
                evidence. */}
            {/* The file carries its own instructions rather than a link to a
                verifier. This is a self-hosted product: naming a hostname here
                would point a customer's staff at somebody else's server, which
                is what noHardcodedDeployment.test.ts exists to stop. The
                vendor's page is for a stranger holding the file, and belongs on
                the vendor's site. */}
            {items.length > 0 && (
              <Button size="sm" variant="outline" onClick={saveRecord} disabled={saving}>
                {saving ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Download className="mr-1.5 h-3.5 w-3.5" />
                )}
                Download the record
              </Button>
            )}
            {status?.seeded ? (
              <Button size="sm" variant="outline" onClick={run} disabled={running}>
                {running ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Play className="mr-1.5 h-3.5 w-3.5" />
                )}
                {running ? "Running" : "Prove it"}
              </Button>
            ) : null}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {asked ? (
          <p className="rounded-lg border border-border bg-muted/30 p-3 text-sm" role="status" aria-live="polite">
            {running ? (
              "Running the governance drill you asked for. An agent acting as you is about to try something you are not allowed to do."
            ) : result?.passed ? (
              <>
                That is the drill you asked for, and the refusal is on the record below with its position in
                the chain. Download it and anyone can check it without this workspace.
              </>
            ) : (
              "The governance drill you asked for is below."
            )}
          </p>
        ) : null}

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
