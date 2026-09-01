"use client"

import React, { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { useFetch } from "@/hooks/useFetch"
import { GetEndpointUrl } from "@/services/endPoints"
import { cn } from "@/lib/utils/helpers/cn"
import { formatTimeForReplyCount } from "@/lib/utils/date/formatTimeForReplyCount"
import { useToast } from "@/hooks/use-toast"
import { useConfirm } from "@/hooks/useConfirm"
import { Plus, Trash2, Pencil, Sparkles, Rocket, History } from "@/lib/icons"
import { SkeletonRows } from "@/components/ui/skeletonRows"
import { EmptyState } from "@/components/ui/empty-state"
import { ErrorState } from "@/components/ui/error-state"
import {
  Agent,
  WorkspaceAgentStats,
  AgentHealth,
  AgentEvalSummary,
  AgentOutcome,
  outcomeBadgeState,
  sumOutcomes,
  parseEnabledTools,
  parseScope,
  parseTriggerConfig,
  toolLabel,
  setAgentActive,
  deleteAgent,
} from "@/services/agentService"
import { AgentEditDialog } from "./AgentEditDialog"
import { AgentRunsDialog } from "./AgentRunsDialog"
import AgentActivityFeed from "./AgentActivityFeed"
import AgentActiveWorkPanel from "./AgentActiveWorkPanel"
import { PublishTemplateDialog } from "@/components/marketplace/PublishTemplateDialog"

const TRIGGER_LABEL: Record<string, string> = {
  manual: "Manual",
  mention: "On mention",
  schedule: "Scheduled",
  event: "On event",
}

function fmtTokens(n: number): string {
  if (!n) return "0"
  if (n < 1000) return `${n}`
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0)}K`
  return `${(n / 1_000_000).toFixed(1)}M`
}

// AgentOverviewStrip is the fleet-level summary above the agent list: how many
// agents are active, aggregate run health (success rate over completed runs),
// total AI spend, and recent activity. The admin's "is the fleet healthy and
// worth the cost" glance.
const AgentOverviewStrip: React.FC<{ stats: WorkspaceAgentStats; outcomes?: Record<string, AgentOutcome> }> = ({
  stats,
  outcomes,
}) => {
  const completed = stats.succeeded + stats.failed + stats.stopped
  const successRate = completed > 0 ? Math.round((stats.succeeded / completed) * 100) : null

  // "Success rate" is runs that finished without erroring. That is completion,
  // not usefulness: an agent can succeed every time at producing something
  // nobody wanted. This tile is the other question, and the two sit together on
  // purpose so neither is mistaken for the other.
  const kept = sumOutcomes(outcomes)

  const tiles = [
    { label: "Active agents", value: `${stats.active_agents}/${stats.total_agents}` },
    { label: "Total runs", value: stats.total_runs.toLocaleString() },
    { label: "Success rate", value: successRate === null ? "—" : `${successRate}%` },
    { label: "Proposals kept", value: kept.decided === 0 ? "—" : `${kept.approved}/${kept.decided}` },
    { label: "AI spend (7d)", value: `${fmtTokens(stats.last_7d_tokens)} tok` },
    { label: "Runs (7d)", value: stats.last_7d_runs.toLocaleString() },
  ]
  return (
    <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
      {tiles.map((t) => (
        <div key={t.label} className="rounded-lg border border-border/60 bg-muted/20 p-2.5">
          <div className="text-2xs font-medium uppercase tracking-wide text-muted-foreground">{t.label}</div>
          <div className="mt-0.5 text-base font-semibold text-foreground">{t.value}</div>
        </div>
      ))}
    </div>
  )
}

// AgentHealthDot is the at-a-glance per-row reliability signal: a colored dot
// (green/amber/red by success rate over completed runs, grey when there are no
// runs yet) with a tooltip, so an admin scanning the list sees which agents are
// healthy without opening each one. Complements the aggregate overview strip.
const AgentHealthDot: React.FC<{ health?: AgentHealth }> = ({ health }) => {
  if (!health || health.total_runs === 0) {
    return (
      <span
        className="inline-block h-2 w-2 shrink-0 rounded-full bg-muted-foreground/30"
        title="No runs yet"
        aria-label="Agent health: no runs yet"
      />
    )
  }
  const completed = health.succeeded + health.failed + health.stopped
  const rate = completed > 0 ? Math.round((health.succeeded / completed) * 100) : null
  let color = "bg-muted-foreground/30"
  let label = `${health.total_runs} run${health.total_runs === 1 ? "" : "s"}, none completed yet`
  if (rate !== null) {
    color = rate >= 90 ? "bg-emerald-500" : rate >= 70 ? "bg-amber-500" : "bg-red-500"
    label = `${rate}% success over ${completed} completed run${completed === 1 ? "" : "s"}`
  }
  return (
    <span
      className={cn("inline-block h-2 w-2 shrink-0 rounded-full", color)}
      title={label}
      aria-label={`Agent health: ${label}`}
    />
  )
}

// AgentEvalBadge shows the agent's latest test-suite pass-rate at a glance
// (green/amber/red), so an owner sees which agents are proven vs untested while
// scanning the list. Absent when the agent has no active tests.
const AgentEvalBadge: React.FC<{ summary?: AgentEvalSummary }> = ({ summary }) => {
  if (!summary || summary.scenario_count === 0) return null
  if (summary.scored === 0) {
    return (
      <Badge variant="secondary" className="text-3xs" title={`${summary.scenario_count} test(s), not run yet`}>
        {summary.scenario_count} test{summary.scenario_count === 1 ? "" : "s"}
      </Badge>
    )
  }
  const rate = Math.round((summary.passed / summary.scored) * 100)

  // STALE BEATS THE SCORE. The agent has been edited since these numbers were
  // measured, so the rate is true about a version that no longer exists. Showing
  // a confident green 100% next to an agent whose instructions were rewritten a
  // minute ago is worse than showing nothing: it answers a question nobody
  // asked, in a way the reader has no way to tell is out of date.
  //
  // Deliberately not alarming. Nothing is wrong, the measurement is simply
  // behind, and the server reruns it without anyone pressing a thing.
  if (summary.stale) {
    return (
      <Badge
        variant="secondary"
        className="text-3xs text-muted-foreground"
        title={`Was ${summary.passed}/${summary.scored} passing before this agent was edited. Tests rerun automatically.`}
      >
        {rate}% · rechecking
      </Badge>
    )
  }

  const tone = rate >= 90 ? "text-success" : rate >= 70 ? "text-amber-600" : "text-red-600"
  return (
    <Badge variant="secondary" className={cn("text-3xs", tone)} title={`${summary.passed}/${summary.scored} tests passing`}>
      {rate}% tests
    </Badge>
  )
}

// AgentOutcomeBadge shows what people did with what this agent proposed.
//
// SEPARATE FROM THE TEST BADGE ON PURPOSE. The pass rate beside it scores the
// agent against scenarios its own author wrote, which says whether it behaves
// as intended, not whether anybody wanted the result. This is the second
// question, answered with decisions people already made: an approve or a deny
// on a real proposal, on the way to doing real work.
//
// Absent until somebody has actually decided. An agent whose writes all run
// unattended proposes nothing and correctly shows no badge here.
const AgentOutcomeBadge: React.FC<{ outcome?: AgentOutcome }> = ({ outcome }) => {
  // IGNORED BEATS THE RATE, for the same reason stale beats the score above.
  // "3 of 4 kept" is a fine number to print next to an agent whose proposals
  // nobody is answering any more, and it tells the reader the opposite of what
  // is happening.
  const state = outcomeBadgeState(outcome)
  if (state === "none" || !outcome) return null
  if (state === "ignored") {
    return (
      <Badge
        variant="secondary"
        className="text-3xs text-muted-foreground"
        title={`${outcome.expired} proposal${outcome.expired === 1 ? "" : "s"} expired with nobody deciding. This agent may not be worth running.`}
      >
        mostly ignored
      </Badge>
    )
  }
  const rate = Math.round(outcome.acceptance_rate * 100)
  const tone = rate >= 80 ? "text-success" : rate >= 50 ? "text-warning" : "text-destructive"
  return (
    <Badge
      variant="secondary"
      className={cn("text-3xs", tone)}
      title={`People approved ${outcome.approved} of ${outcome.decided} thing${outcome.decided === 1 ? "" : "s"} this agent proposed`}
    >
      {outcome.approved}/{outcome.decided} kept
    </Badge>
  )
}

const AgentsCard = () => {
  const { data, isLoading, isError, mutate } = useFetch<{ data: Agent[] }>(GetEndpointUrl.GetAgents)
  const { data: overview } = useFetch<{ data: WorkspaceAgentStats }>(`${GetEndpointUrl.GetAgents}/overview`)
  const { data: health } = useFetch<{ data: Record<string, AgentHealth> }>(`${GetEndpointUrl.GetAgents}/health`)
  const { data: evalSummary } = useFetch<{ data: Record<string, AgentEvalSummary> }>(`${GetEndpointUrl.GetAgents}/eval/summary`)
  const { data: outcomes } = useFetch<{ data: Record<string, AgentOutcome> }>(`${GetEndpointUrl.GetAgents}/outcomes`)
  const { toast } = useToast()
  const confirm = useConfirm()
  const [editing, setEditing] = useState<Agent | null>(null)
  const [creating, setCreating] = useState(false)
  const [publishing, setPublishing] = useState<Agent | null>(null)
  const [viewingRuns, setViewingRuns] = useState<Agent | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const agents = data?.data || []

  const handleToggle = async (a: Agent, next: boolean) => {
    setBusyId(a.id)
    try {
      await setAgentActive(a.id, next)
      toast({ title: next ? "Agent enabled" : "Agent paused" })
      mutate()
    } catch {
      // interceptor surfaces the error
    } finally {
      setBusyId(null)
    }
  }

  const handleDelete = async (a: Agent) => {
    confirm({
      title: "Delete agent",
      description: `Delete agent "${a.name}"? This can't be undone.`,
      confirmText: "Delete",
      onConfirm: async () => {
        setBusyId(a.id)
        try {
          await deleteAgent(a.id)
          toast({ title: "Agent deleted" })
          mutate()
        } catch {
          // interceptor surfaces the error
        } finally {
          setBusyId(null)
        }
      },
    })
  }

  // Build the portable template payload (the agent's create-input) the
  // templates gallery replays on install.
  const agentTemplatePayload = (a: Agent) => ({
    name: a.name,
    description: a.description || undefined,
    avatar_key: a.avatar_key || undefined,
    instructions: a.instructions,
    model_pref: a.model_pref || undefined,
    enabled_tools: parseEnabledTools(a),
    trigger_type: a.trigger_type,
    trigger_config: parseTriggerConfig(a),
    scope: parseScope(a),
    max_steps: a.max_steps,
    is_active: false,
  })

  return (
    <Card className="border-border/60">
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
        <div className="space-y-1">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Sparkles className="h-5 w-5 text-primary" />
            AI Agents
          </CardTitle>
          <CardDescription className="max-w-xl">
            Build agents that do real work for you. Give one instructions and a few tools, and it
            acts in your workspace, only ever within your own permissions.
          </CardDescription>
        </div>
        <Button onClick={() => setCreating(true)} className="shrink-0">
          <Plus className="h-4 w-4 mr-1.5" />
          New agent
        </Button>
      </CardHeader>

      <CardContent>
        {isLoading ? (
          // Agent rows are avatar + name + description, so the placeholder is too.
          <div role="status" aria-label="Loading agents">
            <SkeletonRows rows={3} />
          </div>
        ) : isError ? (
          <ErrorState subject="the agents" onRetry={() => void mutate()} />
        ) : agents.length === 0 ? (
          <EmptyState
            tone="accent"
            icon={Sparkles}
            title="No agents yet"
            description="Try: a standup agent that summarizes #standup each morning and opens a task for any blocker."
            action={
              <Button variant="outline" onClick={() => setCreating(true)}>
                <Plus className="h-4 w-4 mr-1.5" />
                Create your first agent
              </Button>
            }
          />
        ) : (
          <div className="space-y-3">
            {overview?.data && overview.data.total_runs > 0 && (
              <AgentOverviewStrip stats={overview.data} outcomes={outcomes?.data} />
            )}
            <AgentActiveWorkPanel />
            <AgentActivityFeed />
            {agents.map((a) => {
              const tools = parseEnabledTools(a)
              return (
                <div
                  key={a.id}
                  className="flex items-start justify-between gap-4 rounded-xl border border-border/60 p-4 transition-colors hover:border-border"
                >
                  <div className="min-w-0 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <AgentHealthDot health={health?.data?.[a.id]} />
                      <span className="truncate font-medium">{a.name}</span>
                      <Badge variant="outline" className="text-3xs">{TRIGGER_LABEL[a.trigger_type] || a.trigger_type}</Badge>
                      {!a.is_active && <Badge variant="secondary" className="text-3xs">Paused</Badge>}
                      {a.dm_able && <Badge variant="secondary" className="text-3xs text-primary">DM</Badge>}
                      {a.run_in_background && <Badge variant="secondary" className="text-3xs" title="Answers mentions & DMs as durable background runs with live status">Background</Badge>}
                      {a.autonomy === "approval" && <Badge variant="secondary" className="text-3xs text-amber-600">Approval</Badge>}
                      {a.autonomy === "plan" && <Badge variant="secondary" className="text-3xs text-amber-600">Plan-approve</Badge>}
                      {(a.max_daily_tokens ?? 0) > 0 && (
                        <Badge variant="secondary" className="text-3xs">{fmtTokens(a.max_daily_tokens as number)}/day</Badge>
                      )}
                      <AgentEvalBadge summary={evalSummary?.data?.[a.id]} />
                      <AgentOutcomeBadge outcome={outcomes?.data?.[a.id]} />
                      {a.last_error && <Badge variant="destructive" className="text-3xs">Last run failed</Badge>}
                    </div>
                    {a.description && <p className="text-xs text-muted-foreground">{a.description}</p>}
                    <div className="flex flex-wrap items-center gap-1.5">
                      {tools.slice(0, 5).map((t) => (
                        <Badge key={t} variant="outline" className="text-2xs font-normal">{toolLabel(t)}</Badge>
                      ))}
                      {tools.length > 5 && <span className="text-2xs text-muted-foreground">+{tools.length - 5} more</span>}
                      <span className="text-2xs text-muted-foreground">· ran {a.run_count} {a.run_count === 1 ? "time" : "times"}</span>
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-1">
                    <Switch
                      checked={a.is_active}
                      disabled={busyId === a.id}
                      onCheckedChange={(v) => handleToggle(a, v)}
                      aria-label="Toggle agent"
                    />
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setEditing(a)} title="Edit">
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => setViewingRuns(a)}
                      title="Run history"
                    >
                      <History className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => setPublishing(a)}
                      title="Save as template"
                    >
                      <Rocket className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive hover:text-destructive"
                      disabled={busyId === a.id}
                      onClick={() => handleDelete(a)}
                      title="Delete"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </CardContent>

      {(creating || editing) && (
        <AgentEditDialog
          agent={editing}
          open={creating || !!editing}
          onClose={() => {
            setCreating(false)
            setEditing(null)
          }}
          onSaved={() => {
            setCreating(false)
            setEditing(null)
            mutate()
          }}
        />
      )}

      {publishing && (
        <PublishTemplateDialog
          open={!!publishing}
          onOpenChange={(o) => !o && setPublishing(null)}
          kind="agent"
          payload={agentTemplatePayload(publishing)}
          defaultName={publishing.name}
        />
      )}

      {viewingRuns && (
        <AgentRunsDialog
          agentId={viewingRuns.id}
          agentName={viewingRuns.name}
          open={!!viewingRuns}
          onClose={() => setViewingRuns(null)}
        />
      )}
    </Card>
  )
}

export default AgentsCard
