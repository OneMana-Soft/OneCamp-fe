"use client"

// AgentRunsDialog — run transparency for one agent. Lists recent runs (status,
// trigger, duration, tokens) and lets the admin expand any run to see the full
// transcript: each step's assistant turn and the tool calls it made, with
// results / errors / skips. This is what makes an autonomous agent trustworthy
// enough to leave running: you can always see exactly what it did and why.

import React, { useCallback, useEffect, useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { sha256Hex } from "@/lib/sha256"
import { cn } from "@/lib/utils/helpers/cn"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { SkeletonRows } from "@/components/ui/skeletonRows"
import { EmptyState } from "@/components/ui/empty-state"
import { useToast } from "@/hooks/use-toast"
import { useConfirm } from "@/hooks/useConfirm"
import { ChevronDown, ChevronRight, History, Activity, Clock, Zap, CheckCircle, RefreshCw, Trash2, AlertTriangle, ShieldAlert, Layers, MessageSquare } from "@/lib/icons"
import {
  AgentRun,
  AgentRunStep,
  AgentRunCompaction,
  AgentRunStats,
  AgentRoutine,
  GOVERNANCE_BADGE,
  compactionSummary,
  listAgentRuns,
  getAgentStats,
  listAgentRoutines,
  setAgentRoutineEnabled,
  deleteAgentRoutine,
  parseRunSteps,
  parseRunSkills,
  listAgentSkills,
  toolLabel,
} from "@/services/agentService"

const STATUS_VARIANT: Record<AgentRun["status"], "default" | "secondary" | "destructive" | "outline"> = {
  succeeded: "default",
  running: "secondary",
  stopped: "outline",
  failed: "destructive",
}

function formatWhen(iso?: string | null): string {
  if (!iso) return ""
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ""
  return d.toLocaleString()
}

function formatDuration(start?: string | null, end?: string | null): string {
  if (!start || !end) return ""
  const ms = new Date(end).getTime() - new Date(start).getTime()
  if (!Number.isFinite(ms) || ms < 0) return ""
  if (ms < 1000) return `${ms}ms`
  const s = ms / 1000
  if (s < 60) return `${s.toFixed(1)}s`
  return `${Math.floor(s / 60)}m ${Math.round(s % 60)}s`
}

function formatMs(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return "—"
  if (ms < 1000) return `${Math.round(ms)}ms`
  const s = ms / 1000
  if (s < 60) return `${s.toFixed(1)}s`
  return `${Math.floor(s / 60)}m ${Math.round(s % 60)}s`
}

function formatTokens(n: number): string {
  if (!n) return "0"
  if (n < 1000) return `${n}`
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0)}K`
  return `${(n / 1_000_000).toFixed(1)}M`
}

// completedRuns counts runs that reached a terminal state (success rate is over
// these, so an in-progress run never drags the rate down).
function completedRuns(s: AgentRunStats): number {
  return s.succeeded + s.failed + s.stopped
}

// StatTile is one Notion-like metric cell.
const StatTile: React.FC<{ icon: React.ReactNode; label: string; value: string; hint?: string }> = ({
  icon,
  label,
  value,
  hint,
}) => (
  <div className="rounded-lg border border-border/60 bg-muted/20 p-3">
    <div className="flex items-center gap-1.5 text-2xs font-medium uppercase tracking-wide text-muted-foreground">
      {icon}
      {label}
    </div>
    <div className="mt-1 text-lg font-semibold text-foreground">{value}</div>
    {hint && <div className="text-2xs text-muted-foreground">{hint}</div>}
  </div>
)

// todayUsageParts renders today's consumption as short phrases — AI tokens
// against the agent's cap, and sandbox runs/seconds against theirs — including
// only the parts that actually apply to this agent. Pure and additive: a new
// daily meter is one more entry, not another tile competing with the headline
// numbers above.
function todayUsageParts(stats: AgentRunStats): string[] {
  const parts: string[] = []
  const tokensToday = stats.tokens_today ?? 0
  const tokenCap = stats.max_daily_tokens ?? 0
  if (tokenCap > 0) {
    parts.push(`${formatTokens(tokensToday)} / ${formatTokens(tokenCap)} tokens (resets 00:00 UTC)`)
  } else if (tokensToday > 0) {
    parts.push(`${formatTokens(tokensToday)} tokens`)
  }

  const sandboxRuns = stats.sandbox_runs_today ?? 0
  const sandboxRunCap = stats.sandbox_daily_runs ?? 0
  if (sandboxRunCap > 0) {
    parts.push(`${sandboxRuns} / ${sandboxRunCap} sandbox runs`)
  } else if (sandboxRuns > 0) {
    parts.push(`${sandboxRuns} sandbox run${sandboxRuns === 1 ? "" : "s"}`)
  }

  const sandboxSeconds = stats.sandbox_seconds_today ?? 0
  const sandboxSecondCap = stats.sandbox_daily_seconds ?? 0
  if (sandboxSecondCap > 0) {
    parts.push(`${sandboxSeconds}s / ${sandboxSecondCap}s runner time`)
  } else if (sandboxSeconds > 0) {
    parts.push(`${sandboxSeconds}s runner time`)
  }
  return parts
}

// ReliabilityPanel renders the agent's at-a-glance reliability + activity:
// success rate (with an outcome-distribution bar), spend, latency, and recent
// activity. This is the "trust + ROI" surface — proof of what the agent does at
// volume, not just one run's transcript.
const ReliabilityPanel: React.FC<{ stats: AgentRunStats }> = ({ stats }) => {
  const done = completedRuns(stats)
  const successRate = done > 0 ? Math.round((stats.succeeded / done) * 100) : null
  const pct = (n: number) => (done > 0 ? (n / done) * 100 : 0)

  return (
    <div className="space-y-3 rounded-xl border border-border/60 p-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <StatTile
          icon={<CheckCircle className="h-3 w-3" />}
          label="Success rate"
          value={successRate === null ? "—" : `${successRate}%`}
          hint={done > 0 ? `${stats.succeeded}/${done} completed` : "no completed runs"}
        />
        <StatTile
          icon={<Activity className="h-3 w-3" />}
          label="Total runs"
          value={stats.total_runs.toLocaleString()}
          hint={stats.running > 0 ? `${stats.running} running now` : `avg ${stats.avg_steps.toFixed(1)} steps`}
        />
        <StatTile
          icon={<Zap className="h-3 w-3" />}
          label="AI spend"
          value={`${formatTokens(stats.total_tokens)} tok`}
          hint={`${formatTokens(stats.last_7d_tokens)} in 7d`}
        />
        <StatTile
          icon={<Clock className="h-3 w-3" />}
          label="Avg run time"
          value={formatMs(stats.avg_duration_ms)}
          hint={`${stats.last_7d_runs} run${stats.last_7d_runs === 1 ? "" : "s"} in 7d`}
        />
      </div>

      {/* Today's usage reads as ONE line, not two more tiles. Four tiles fill the
          grid exactly; a fifth and sixth wrapped onto a ragged second row and gave
          equal visual weight to numbers an operator glances at rather than reads.
          Each part appears only when it applies, so a workspace with no caps and
          no sandbox sees nothing here at all. */}
      {(todayUsageParts(stats).length > 0) && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-2xs text-muted-foreground">
          <span className="font-medium uppercase tracking-wide text-muted-foreground/80">Today</span>
          {todayUsageParts(stats).map((part) => (
            <span key={part}>{part}</span>
          ))}
        </div>
      )}

      {/* Outcome distribution bar — green succeeded / red failed / amber stopped. */}
      {done > 0 && (
        <div>
          <div className="flex h-1.5 overflow-hidden rounded-full bg-muted">
            <div className="bg-emerald-500" style={{ width: `${pct(stats.succeeded)}%` }} title={`${stats.succeeded} succeeded`} />
            <div className="bg-destructive" style={{ width: `${pct(stats.failed)}%` }} title={`${stats.failed} failed`} />
            <div className="bg-amber-500" style={{ width: `${pct(stats.stopped)}%` }} title={`${stats.stopped} stopped`} />
          </div>
          <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-2xs text-muted-foreground">
            <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-emerald-500" /> {stats.succeeded} succeeded</span>
            <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-destructive" /> {stats.failed} failed</span>
            <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-amber-500" /> {stats.stopped} stopped</span>
          </div>
        </div>
      )}

      {/* Continue-the-work notes the agent carries across runs (read-only),
          surfaced for transparency into what long-running work it's advancing. */}
      {stats.working_notes && stats.working_notes.trim() !== "" && (
        <div className="rounded-lg border border-border/60 bg-muted/20 p-3">
          <div className="mb-1 text-2xs font-medium uppercase tracking-wide text-muted-foreground">Working notes</div>
          <p className="whitespace-pre-wrap break-words text-xs text-foreground/80">{stats.working_notes}</p>
        </div>
      )}
    </div>
  )
}

// ToolParamsView renders a tool call's params for the transcript. A multi-line
// "code" param (e.g. run_analysis' Python) is shown as a collapsible monospace
// block with newlines preserved — never a one-line escaped JSON blob — so the
// executed code is actually readable; the remaining params render as compact
// JSON. Fully generic: any tool that carries a "code" param benefits.
const ToolParamsView: React.FC<{ params?: Record<string, string> }> = ({ params }) => {
  if (!params || Object.keys(params).length === 0) return null
  const { code, ...rest } = params
  const restKeys = Object.keys(rest)
  return (
    <>
      {typeof code === "string" && code.trim() !== "" && (
        <details className="mt-1">
          <summary className="cursor-pointer select-none text-2xs text-muted-foreground hover:text-foreground">
            Code ({code.split("\n").length} line{code.split("\n").length === 1 ? "" : "s"})
          </summary>
          <pre className="mt-1 max-h-64 overflow-auto whitespace-pre rounded bg-muted/50 p-2 font-mono text-2xs text-foreground">
            {code}
          </pre>
        </details>
      )}
      {restKeys.length > 0 && (
        <pre className="mt-1 overflow-x-auto whitespace-pre-wrap break-words text-2xs text-muted-foreground">
          {JSON.stringify(rest, null, 0)}
        </pre>
      )}
    </>
  )
}

// cadenceLabel renders a routine's recurrence + fire time as a short human
// phrase ("daily at 09:00 UTC", "weekly on MO,WE,FR at 14:30 UTC"), mirroring
// the backend describeCadence so the UI and chat replies read the same.
function cadenceLabel(recurrence: string, atMinuteUTC: number): string {
  const hh = String(Math.floor(atMinuteUTC / 60)).padStart(2, "0")
  const mm = String(atMinuteUTC % 60).padStart(2, "0")
  const at = `${hh}:${mm} UTC`
  const rule = (recurrence || "").toUpperCase()
  if (rule.includes("FREQ=HOURLY")) {
    const m = rule.match(/INTERVAL=(\d+)/)
    const n = m ? parseInt(m[1], 10) : 1
    return n <= 1 ? "every hour" : `every ${n} hours`
  }
  if (rule.includes("FREQ=WEEKLY")) {
    const m = rule.match(/BYDAY=([A-Z,]+)/)
    return m ? `weekly on ${m[1]} at ${at}` : `weekly at ${at}`
  }
  return `daily at ${at}`
}

// RoutinesPanel lists an agent's recurring routines (created conversationally)
// and lets an owner/admin pause/resume or cancel each — the manage surface for
// standing work, so it isn't only controllable from chat.
const RoutinesPanel: React.FC<{
  agentId: string
  routines: AgentRoutine[]
  onChanged: () => Promise<void> | void
}> = ({ agentId, routines, onChanged }) => {
  const { toast } = useToast()
  const confirm = useConfirm()
  const [busyId, setBusyId] = useState<string | null>(null)

  const toggle = async (r: AgentRoutine) => {
    setBusyId(r.id)
    try {
      await setAgentRoutineEnabled(agentId, r.id, !r.enabled)
      await onChanged()
    } catch (e) {
      toast({
        title: "Error",
        description: e instanceof Error ? e.message : "Failed to update routine",
        variant: "destructive",
      })
    } finally {
      setBusyId(null)
    }
  }

  // Confirmed: cancelling a routine stops recurring work permanently, and the only
  // way back is recreating the schedule from memory. The toggle beside this button
  // already offers the reversible option (pause), so the destructive one should be
  // the deliberate choice of the two.
  const confirmRemove = (r: AgentRoutine) => {
    confirm({
      title: r.name ? `Cancel "${r.name}"?` : "Cancel this routine?",
      description:
        "It stops running for good. To pause it temporarily instead, use the toggle next to it.",
      confirmText: "Cancel routine",
      onConfirm: () => {
        void remove(r)
      },
    })
  }

  const remove = async (r: AgentRoutine) => {
    setBusyId(r.id)
    try {
      await deleteAgentRoutine(agentId, r.id)
      await onChanged()
      toast({ title: "Routine cancelled" })
    } catch (e) {
      toast({
        title: "Error",
        description: e instanceof Error ? e.message : "Failed to cancel routine",
        variant: "destructive",
      })
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="rounded-lg border border-border/60 bg-muted/20 p-3">
      <div className="mb-2 flex items-center gap-1.5 text-2xs font-medium uppercase tracking-wide text-muted-foreground">
        <RefreshCw className="h-3 w-3" /> Routines
      </div>
      <div className="space-y-1.5">
        {routines.map((r) => (
          <div key={r.id} className="flex items-center gap-2 rounded-md border border-border/60 bg-card/50 p-2">
            <div className="min-w-0 flex-1">
              <div className="truncate text-xs font-medium text-foreground">{r.name || "Routine"}</div>
              <div className="truncate text-2xs text-muted-foreground">
                {cadenceLabel(r.recurrence, r.at_minute_utc)}
                {!r.enabled && " · paused"}
              </div>
            </div>
            <Switch
              checked={r.enabled}
              disabled={busyId === r.id}
              onCheckedChange={() => toggle(r)}
              aria-label={r.enabled ? "Pause routine" : "Resume routine"}
            />
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-destructive"
              disabled={busyId === r.id}
              onClick={() => confirmRemove(r)}
              aria-label="Cancel routine"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        ))}
      </div>
    </div>
  )
}

// CompactionDivider marks the point where the agent's conversation was folded
// into a summary so the run could continue inside the model's context window.
// A quiet rule-with-a-label (Notion-style) rather than an alert: it explains a
// gap the reader would otherwise notice in the transcript, and it is not a
// problem — unless it was a rescue after the provider refused the prompt, which
// reads in amber so an operator can spot a chronically oversized agent.
const CompactionDivider: React.FC<{ compaction: AgentRunCompaction }> = ({ compaction }) => {
  const rule = "h-px flex-1 " + (compaction.rescue ? "bg-amber-500/40" : "bg-border/60")
  return (
    // The detail is a tooltip on a pointer device and a tap-to-open line on
    // touch: a title attribute alone is unreadable on a phone, and this
    // transcript gets read on one as often as not. The expanded text drops BELOW
    // the rule so opening it doesn't stretch the divider.
    <details className="py-0.5" role="note">
      <summary
        className="flex cursor-pointer select-none list-none items-center gap-2 [&::-webkit-details-marker]:hidden"
        title={compactionSummary(compaction)}
      >
        <span className={rule} />
        <span
          className={
            "inline-flex items-center gap-1 text-3xs uppercase tracking-wide " +
            (compaction.rescue ? "text-warning" : "text-muted-foreground")
          }
        >
          <Layers className="h-3 w-3" />
          Context compacted
        </span>
        <span className={rule} />
      </summary>
      <p className="mt-1 text-center text-2xs text-muted-foreground">{compactionSummary(compaction)}</p>
    </details>
  )
}

// SteeringNote shows the instructions a person sent while the run was working,
// at the point they were folded in. Without it the transcript reads as the agent
// inexplicably changing plan mid-run; with it, the human's words are right where
// they took effect. Rendered in the accent colour a human turn deserves — this is
// the one thing in a transcript that isn't the agent's own doing.
const SteeringNote: React.FC<{ steering: string[] }> = ({ steering }) => (
  <div className="rounded-md border-l-2 border-primary/50 bg-primary/5 px-2 py-1.5">
    <div className="flex items-center gap-1 text-3xs font-medium uppercase tracking-wide text-primary/80">
      <MessageSquare className="h-3 w-3" />
      New instruction while working
    </div>
    <ul className="mt-1 space-y-0.5">
      {steering.map((s, i) => (
        <li key={i} className="whitespace-pre-wrap break-words text-2xs text-foreground/90">
          {s}
        </li>
      ))}
    </ul>
  </div>
)

const StepView: React.FC<{ step: AgentRunStep }> = ({ step }) => (
  <div className="space-y-1.5 border-l-2 border-border/60 pl-3">
    {step.compaction && <CompactionDivider compaction={step.compaction} />}
    {step.steering && step.steering.length > 0 && <SteeringNote steering={step.steering} />}
    <div className="text-2xs font-medium text-muted-foreground">Step {step.iteration}</div>
    {step.assistant && (
      <p className="whitespace-pre-wrap text-xs text-foreground">{step.assistant}</p>
    )}
    {(step.tool_calls || []).map((tc, i) => {
      // A policy-gated call (awaiting approval / blocked) is a governance
      // decision, not a plain skip/failure — badge it distinctly in amber so
      // the transcript reads honestly. Falls back to the neutral skip/error
      // rendering for ordinary calls or unknown categories.
      const gov = tc.governance ? GOVERNANCE_BADGE[tc.governance] : undefined
      return (
        <div key={i} className="rounded-md border border-border/60 bg-muted/30 p-2 text-xs">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant="outline" className="text-3xs">{toolLabel(tc.tool)}</Badge>
            {gov ? (
              <Badge
                variant="outline"
                className="gap-1 border-amber-500/40 bg-amber-500/10 text-3xs text-warning"
              >
                {gov.tone === "approval" ? <AlertTriangle size={10} /> : <ShieldAlert size={10} />}
                {gov.label}
              </Badge>
            ) : (
              <>
                {tc.skipped && <Badge variant="secondary" className="text-3xs">skipped</Badge>}
                {tc.error && <Badge variant="destructive" className="text-3xs">error</Badge>}
              </>
            )}
          </div>
          <ToolParamsView params={tc.params} />
          {tc.result && <p className="mt-1 whitespace-pre-wrap break-words text-2xs text-foreground">{tc.result}</p>}
          {tc.error && !gov && <p className="mt-1 whitespace-pre-wrap break-words text-2xs text-destructive">{tc.error}</p>}
          {tc.skipped && (
            <p className={"mt-1 text-2xs " + (gov ? "text-warning" : "text-muted-foreground")}>
              {gov ? gov.label + ": " : "Skipped: "}{tc.skipped}
            </p>
          )}
        </div>
      )
    })}
  </div>
)

/**
 * RunProvenance — what the agent was told, as opposed to what it did.
 *
 * Rendered above the transcript rather than below it, and rendered even when the
 * transcript is gone. That is the whole point of storing fingerprints instead of
 * copies: after retention clears a run's content, this strip still answers which
 * model read the prompt and which version of each skill was in it.
 *
 * "Changed since" is the line an admin actually acts on. A skill is shared and
 * editable, so a run that looks wrong today may have been given different
 * instructions than the ones now in the library, and without this you would
 * debug the agent instead of reading the edit.
 */
const RunProvenance: React.FC<{ run: AgentRun; current: Map<string, string> }> = ({ run, current }) => {
  const skills = parseRunSkills(run)
  if (!run.model && !run.prompt_sha256 && skills.length === 0) return null

  return (
    <div className="space-y-1.5 rounded-md border border-border/60 bg-muted/20 p-2">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-2xs text-muted-foreground">
        {run.model && (
          <span>
            Model <span className="font-medium text-foreground">{run.model}</span>
          </span>
        )}
        {run.prompt_sha256 && (
          <span title={`Full fingerprint: ${run.prompt_sha256}`}>
            Instructions{" "}
            <code className="font-mono text-foreground">{run.prompt_sha256.slice(0, 12)}</code>
          </span>
        )}
      </div>
      {skills.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {skills.map((sk) => {
            // Absent from the map means the skill was deleted after this run,
            // which is a different statement from "it was edited" and worth
            // making separately.
            const now = current.get(sk.id)
            const changed = now !== undefined && now !== sk.sha256
            const removed = current.size > 0 && now === undefined
            return (
              <span
                key={sk.id}
                title={changed ? "This skill has been edited since this run" : undefined}
                className={cn(
                  "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-3xs",
                  // The semantic warning token rather than a raw hue: this chip
                  // means the same thing as every other "needs a second look"
                  // mark in the product, and it has to keep meaning it in both
                  // themes.
                  changed || removed
                    ? "border-warning/40 bg-warning/10 text-warning"
                    : "border-border bg-background text-muted-foreground",
                )}
              >
                {sk.name}
                {changed && <span className="opacity-80">edited since</span>}
                {removed && <span className="opacity-80">deleted since</span>}
              </span>
            )
          })}
        </ul>
      )}
    </div>
  )
}

const RunRow: React.FC<{ run: AgentRun; currentSkills: Map<string, string> }> = ({ run, currentSkills }) => {
  const [open, setOpen] = useState(false)
  const steps = parseRunSteps(run)
  return (
    <div className="rounded-lg border border-border/60">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-3 p-3 text-left"
      >
        <span className="flex min-w-0 items-center gap-2">
          {open ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
          <Badge variant={STATUS_VARIANT[run.status]} className="text-3xs capitalize">{run.status}</Badge>
          <span className="truncate text-xs text-muted-foreground">
            {run.trigger_source} · {formatWhen(run.started_at)}
          </span>
        </span>
        <span className="shrink-0 text-2xs text-muted-foreground">
          {run.step_count} step{run.step_count === 1 ? "" : "s"}
          {run.tokens > 0 && ` · ${run.tokens.toLocaleString()} tok`}
          {formatDuration(run.started_at, run.ended_at) && ` · ${formatDuration(run.started_at, run.ended_at)}`}
        </span>
      </button>
      {open && (
        <div className="space-y-3 border-t border-border/60 p-3">
          <RunProvenance run={run} current={currentSkills} />
          {run.error && (
            <p className="rounded-md bg-destructive/10 p-2 text-xs text-destructive">{run.error}</p>
          )}
          {steps.length === 0 ? (
            // Two very different reasons for an empty transcript, and saying the
            // wrong one sends an admin looking for a bug. A redacted run DID
            // record its steps; the retention window cleared them, which is the
            // policy working. The counts in the header are still the real ones.
            run.redacted_at ? (
              <p className="rounded-md border border-border/60 bg-muted/30 p-2 text-xs text-muted-foreground">
                The transcript and result of this run were cleared on{" "}
                {formatWhen(run.redacted_at)} by the workspace retention policy. The status, step
                count and token usage above are unchanged.
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">No transcript recorded for this run.</p>
            )
          ) : (
            steps.map((s, i) => <StepView key={i} step={s} />)
          )}
          {run.result && (
            <div className="rounded-md border border-border/60 bg-muted/30 p-2">
              <div className="mb-1 text-2xs font-medium text-muted-foreground">Final result</div>
              <p className="whitespace-pre-wrap text-xs text-foreground">{run.result}</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export const AgentRunsDialog: React.FC<{
  agentId: string
  agentName: string
  open: boolean
  onClose: () => void
}> = ({ agentId, agentName, open, onClose }) => {
  const [runs, setRuns] = useState<AgentRun[] | null>(null)
  const [stats, setStats] = useState<AgentRunStats | null>(null)
  const [routines, setRoutines] = useState<AgentRoutine[]>([])
  const [loading, setLoading] = useState(false)
  // Fingerprints of the skill library as it stands NOW, so a run can say which
  // of the skills it used have been edited since. Empty when the browser has no
  // SubtleCrypto, in which case the viewer shows no "edited since" marks rather
  // than wrong ones.
  const [currentSkills, setCurrentSkills] = useState<Map<string, string>>(new Map())

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [runsRes, statsRes, routinesRes] = await Promise.all([
        listAgentRuns(agentId, 25),
        getAgentStats(agentId),
        listAgentRoutines(agentId).catch(() => [] as AgentRoutine[]),
      ])
      setRuns(runsRes)
      setStats(statsRes)
      setRoutines(routinesRes)

      // Deliberately after the runs are set: the transcript is what somebody
      // opened the dialog for, and the comparison is an enrichment that should
      // never delay it or fail it.
      try {
        const library = await listAgentSkills()
        const pairs = await Promise.all(
          library.map(async (sk) => [sk.id, await sha256Hex(sk.instructions.trim())] as const),
        )
        setCurrentSkills(new Map(pairs.filter((p): p is [string, string] => p[1] !== null)))
      } catch {
        setCurrentSkills(new Map())
      }
    } catch {
      setRuns([])
    } finally {
      setLoading(false)
    }
  }, [agentId])

  useEffect(() => {
    if (open) load()
  }, [open, load])

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="h-5 w-5 text-primary" />
            Run history — {agentName}
          </DialogTitle>
          <DialogDescription>
            Every run this agent made: what triggered it, the tools it called, and what it changed.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-end">
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            {loading ? "Refreshing…" : "Refresh"}
          </Button>
        </div>

        {stats && stats.total_runs > 0 && <ReliabilityPanel stats={stats} />}

        {routines.length > 0 && (
          <RoutinesPanel agentId={agentId} routines={routines} onChanged={load} />
        )}

        <div className="max-h-[60vh] space-y-2 overflow-y-auto">
          {loading && !runs ? (
            // Run rows are collapsed headers, so one line each is the honest
            // shape — and the panel keeps its height while they load.
            <div role="status" aria-label="Loading run history">
              <SkeletonRows rows={4} lines={1} avatar={false} />
            </div>
          ) : runs && runs.length > 0 ? (
            runs.map((r) => <RunRow key={r.id} run={r} currentSkills={currentSkills} />)
          ) : (
            <EmptyState
              icon={History}
              title="No runs yet"
              description="Trigger this agent or run it manually to see its activity here."
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
