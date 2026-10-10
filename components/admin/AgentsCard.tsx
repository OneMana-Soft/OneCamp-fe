"use client"

import React, { useState } from "react"
import dynamic from "next/dynamic"
import { Button } from "@/components/ui/button"
import { SettingsSection, sectionActionClass } from "@/components/ui/settingsSection"
import { StatusWord } from "@/components/ui/statusWord"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { useFetch } from "@/hooks/useFetch"
import { GetEndpointUrl } from "@/services/endPoints"
import { cn } from "@/lib/utils/helpers/cn"
import { useToast } from "@/hooks/use-toast"
import { useConfirm } from "@/hooks/useConfirm"
import { Plus, Trash2, Pencil, Sparkles, History, LayoutTemplate } from "@/lib/icons"
import { EmptyState } from "@/components/ui/empty-state"
import { ErrorState } from "@/components/ui/error-state"
import { SectionListSkeleton } from "@/components/admin/SectionListSkeleton"
import { apiErrorMessage } from "@/lib/utils/apiError"
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
import AgentActivityFeed from "./AgentActivityFeed"
import AgentActiveWorkPanel from "./AgentActiveWorkPanel"
import { PublishTemplateDialog } from "@/components/marketplace/PublishTemplateDialog"
import { ADMIN_GROUP_HUE } from "@/components/admin/adminHues"

// Loaded when opened: the edit dialog is some 1,400 lines and the run history
// some 700, and both came down with the list before anyone opened either.
const AgentEditDialog = dynamic(() => import("./AgentEditDialog").then((m) => m.AgentEditDialog), { ssr: false })
const AgentRunsDialog = dynamic(() => import("./AgentRunsDialog").then((m) => m.AgentRunsDialog), { ssr: false })

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
//
// One sentence, as Home's glance line says its counts: it was six tiles with
// uppercase labels, three of them often an em dash, for what reads as a line.
// Parts with nothing to say are left out rather than shown as a dash.
const AgentOverviewStrip: React.FC<{ stats: WorkspaceAgentStats; outcomes?: Record<string, AgentOutcome> }> = ({
  stats,
  outcomes,
}) => {
  const completed = stats.succeeded + stats.failed + stats.stopped
  const successRate = completed > 0 ? Math.round((stats.succeeded / completed) * 100) : null

  // "Finished without an error" is completion, not usefulness: an agent can
  // succeed every time at producing something nobody wanted. Proposals kept is
  // the other question, and the two sit together on purpose so neither is
  // mistaken for the other.
  const kept = sumOutcomes(outcomes)

  const parts = [
    `${stats.active_agents} of ${stats.total_agents} agents running`,
    `${stats.total_runs.toLocaleString()} ${stats.total_runs === 1 ? "run" : "runs"}` +
      (successRate === null ? "" : `, ${successRate}% finished without an error`),
    kept.decided > 0 ? `${kept.approved} of ${kept.decided} proposals kept` : null,
    `${stats.last_7d_runs.toLocaleString()} ${stats.last_7d_runs === 1 ? "run" : "runs"} and ${fmtTokens(stats.last_7d_tokens)} tokens this week`,
  ].filter(Boolean)
  return <p className="mb-1 text-sm text-muted-foreground">{parts.join(" · ")}</p>
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
    color = rate >= 90 ? "bg-success" : rate >= 70 ? "bg-warning" : "bg-destructive"
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
      <Badge variant="secondary" className="text-2xs" title={`${summary.scenario_count} test(s), not run yet`}>
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
        className="text-2xs text-muted-foreground"
        title={`Was ${summary.passed}/${summary.scored} passing before this agent was edited. Tests rerun automatically.`}
      >
        {rate}% · rechecking
      </Badge>
    )
  }

  const tone = rate >= 90 ? "text-success-ink" : rate >= 70 ? "text-warning-ink" : "text-danger-ink"
  return (
    <Badge variant="secondary" className={cn("text-2xs", tone)} title={`${summary.passed}/${summary.scored} tests passing`}>
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
        className="text-2xs text-muted-foreground"
        title={`${outcome.expired} proposal${outcome.expired === 1 ? "" : "s"} expired with nobody deciding. This agent may not be worth running.`}
      >
        proposals ignored
      </Badge>
    )
  }
  const rate = Math.round(outcome.acceptance_rate * 100)
  const tone = rate >= 80 ? "text-success-ink" : rate >= 50 ? "text-warning-ink" : "text-danger-ink"
  return (
    <Badge
      variant="secondary"
      className={cn("text-2xs", tone)}
      title={`People approved ${outcome.approved} of ${outcome.decided} thing${outcome.decided === 1 ? "" : "s"} this agent proposed`}
    >
      {outcome.approved}/{outcome.decided} kept
    </Badge>
  )
}

/**
 * The agents a person builds and sponsors: a flat section of the settings
 * Agents page (it was a bordered Card with its own tile and title).
 *
 * "New agent" is the page's one primary action. When the page holds it (the
 * settings page puts it in its header, beside the h1), it passes `creating`
 * and `onCreatingChange` and the section draws no button of its own; on its
 * own, the section offers it on its title's row.
 */
const AgentsCard = ({
  creating: creatingProp,
  onCreatingChange,
}: { creating?: boolean; onCreatingChange?: (open: boolean) => void } = {}) => {
  const { data, isLoading, isError, mutate } = useFetch<{ data: Agent[] }>(GetEndpointUrl.GetAgents)
  const { data: overview } = useFetch<{ data: WorkspaceAgentStats }>(`${GetEndpointUrl.GetAgents}/overview`)
  const { data: health } = useFetch<{ data: Record<string, AgentHealth> }>(`${GetEndpointUrl.GetAgents}/health`)
  const { data: evalSummary } = useFetch<{ data: Record<string, AgentEvalSummary> }>(`${GetEndpointUrl.GetAgents}/eval/summary`)
  const { data: outcomes } = useFetch<{ data: Record<string, AgentOutcome> }>(`${GetEndpointUrl.GetAgents}/outcomes`)
  const { toast } = useToast()
  const confirm = useConfirm()
  const [editing, setEditing] = useState<Agent | null>(null)
  const [creatingHere, setCreatingHere] = useState(false)
  const heldByPage = onCreatingChange !== undefined
  const creating = heldByPage ? !!creatingProp : creatingHere
  const setCreating = (open: boolean) => (heldByPage ? onCreatingChange(open) : setCreatingHere(open))
  const [publishing, setPublishing] = useState<Agent | null>(null)
  const [viewingRuns, setViewingRuns] = useState<Agent | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const agents = data?.data || []

  const handleToggle = async (a: Agent, next: boolean) => {
    setBusyId(a.id)
    try {
      await setAgentActive(a.id, next)
      toast({ title: next ? `${a.name} is running` : `${a.name} is paused` })
      mutate()
    } catch {
      // interceptor surfaces the error
    } finally {
      setBusyId(null)
    }
  }

  const handleDelete = async (a: Agent) => {
    confirm({
      title: `Delete the agent "${a.name}"?`,
      description: "It stops working right away and is removed for everyone. This can't be undone.",
      confirmText: "Delete agent",
      destructive: true,
      onConfirm: async () => {
        setBusyId(a.id)
        try {
          await deleteAgent(a.id)
          toast({ title: `${a.name} deleted` })
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
    <SettingsSection
      title="Agents"
      description="Give an agent instructions and a few tools, and it does real work in your workspace, only ever within your own permissions."
      action={
        heldByPage ? undefined : (
          <Button size="sm" className={sectionActionClass} onClick={() => setCreating(true)}>
            <Plus />
            New agent
          </Button>
        )
      }
    >
        {isLoading ? (
          // Agent rows are a name with its badges, who it acts as, and its tools.
          <SectionListSkeleton label="Loading agents" rows={2} lines={3} trailing="switch" />
        ) : isError ? (
          <ErrorState compact subject="the agents" detail={apiErrorMessage(isError, "Try again in a moment.")} onRetry={() => void mutate()} />
        ) : agents.length === 0 ? (
          <div className="rounded-lg border border-border">
            <EmptyState
              icon={Sparkles}
              hue={ADMIN_GROUP_HUE.ai}
              title="No agents yet"
              description="For example: a standup agent that sums up #standup each morning and opens a task for any blocker."
              className="py-6"
            />
          </div>
        ) : (
          <div className="space-y-3">
            {overview?.data && overview.data.total_runs > 0 && (
              <AgentOverviewStrip stats={overview.data} outcomes={outcomes?.data} />
            )}
            <AgentActiveWorkPanel />
            <AgentActivityFeed />
            {/* One hairline list of rows, where each agent was a card. */}
            <ul className="divide-y divide-border rounded-lg border border-border">
            {agents.map((a) => {
              const tools = parseEnabledTools(a)
              return (
                <li key={a.id} className="flex items-start justify-between gap-4 px-4 py-3">
                  <div className="min-w-0 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <AgentHealthDot health={health?.data?.[a.id]} />
                      <span className="truncate text-sm font-medium">{a.name}</span>
                      <span className="text-xs text-muted-foreground">{TRIGGER_LABEL[a.trigger_type] || a.trigger_type}</span>
                      {!a.is_active && <StatusWord className="text-xs">Paused</StatusWord>}
                      {a.dm_able && <Badge variant="secondary" className="text-2xs">DM</Badge>}
                      {a.agui_endpoint && (
                        <Badge variant="secondary" className="text-2xs" title={"Reasons at " + a.agui_endpoint + ". This workspace supplies the tools, the rules and the record."}>
                          Remote
                        </Badge>
                      )}
                      {a.run_in_background && <Badge variant="secondary" className="text-2xs" title="Answers mentions & DMs as durable background runs with live status">Background</Badge>}
                      {a.autonomy === "approval" && <Badge variant="secondary" className="text-2xs text-warning-ink">Approval</Badge>}
                      {a.autonomy === "plan" && <Badge variant="secondary" className="text-2xs text-warning-ink">Plan-approve</Badge>}
                      {(a.max_daily_tokens ?? 0) > 0 && (
                        <Badge variant="secondary" className="text-2xs">{fmtTokens(a.max_daily_tokens as number)}/day</Badge>
                      )}
                      <AgentEvalBadge summary={evalSummary?.data?.[a.id]} />
                      <AgentOutcomeBadge outcome={outcomes?.data?.[a.id]} />
                      {a.last_error && <StatusWord tone="danger" className="text-xs">Last run failed</StatusWord>}
                    </div>
                    {/* Whose permissions bound it. Every other badge on this row
                        says what the agent may do; this is the only line that
                        says who it may do it as, and that is the sentence the
                        product is sold on. */}
                    <p className="text-xs text-muted-foreground">
                      {a.created_by_name ? (
                        <>Acts as <span className="text-foreground/80">{a.created_by_name}</span>, and can do no more than they can.</>
                      ) : (
                        <>The person who authorised this agent is no longer in the workspace.</>
                      )}
                    </p>
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
                      aria-label={`Run ${a.name}`}
                    />
                    <Button variant="ghost" size="icon" aria-label={`Edit ${a.name}`} className="h-8 w-8" onClick={() => setEditing(a)} title="Edit">
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Runs of ${a.name}`}
                      className="h-8 w-8"
                      onClick={() => setViewingRuns(a)}
                      title="Run history"
                    >
                      <History className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Save ${a.name} as a template`}
                      className="h-8 w-8"
                      onClick={() => setPublishing(a)}
                      title="Save as a template"
                    >
                      <LayoutTemplate className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Delete ${a.name}`}
                      className="h-8 w-8 text-danger-ink hover:text-danger-ink"
                      disabled={busyId === a.id}
                      onClick={() => handleDelete(a)}
                      title="Delete"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </li>
              )
            })}
            </ul>
          </div>
        )}

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
    </SettingsSection>
  )
}

export default AgentsCard
