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
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { useToast } from "@/hooks/use-toast"
import { Loader2, ChevronDown, ChevronRight, History, Activity, Clock, Zap, CheckCircle, Terminal, RefreshCw, Trash2, AlertTriangle, ShieldAlert } from "@/lib/icons"
import {
  AgentRun,
  AgentRunStep,
  AgentRunStats,
  AgentRoutine,
  GOVERNANCE_BADGE,
  listAgentRuns,
  getAgentStats,
  listAgentRoutines,
  setAgentRoutineEnabled,
  deleteAgentRoutine,
  parseRunSteps,
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
    <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
      {icon}
      {label}
    </div>
    <div className="mt-1 text-lg font-semibold text-foreground">{value}</div>
    {hint && <div className="text-[11px] text-muted-foreground">{hint}</div>}
  </div>
)

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
        {(stats.max_daily_tokens ? stats.max_daily_tokens > 0 : false) || (stats.tokens_today ?? 0) > 0 ? (
          <StatTile
            icon={<Zap className="h-3 w-3" />}
            label="AI today"
            value={
              stats.max_daily_tokens && stats.max_daily_tokens > 0
                ? `${formatTokens(stats.tokens_today ?? 0)} / ${formatTokens(stats.max_daily_tokens)}`
                : `${formatTokens(stats.tokens_today ?? 0)} tok`
            }
            hint={
              stats.max_daily_tokens && stats.max_daily_tokens > 0
                ? "daily cap (resets 00:00 UTC)"
                : "no daily cap"
            }
          />
        ) : null}
        {/* Sandbox today — shown only when the agent has used the execution
            sandbox today or has a per-agent cap set (the backend populates
            these only while the sandbox feature is enabled). */}
        {(stats.sandbox_daily_runs ?? 0) > 0 ||
        (stats.sandbox_daily_seconds ?? 0) > 0 ||
        (stats.sandbox_runs_today ?? 0) > 0 ? (
          <StatTile
            icon={<Terminal className="h-3 w-3" />}
            label="Sandbox today"
            value={
              stats.sandbox_daily_runs && stats.sandbox_daily_runs > 0
                ? `${stats.sandbox_runs_today ?? 0} / ${stats.sandbox_daily_runs} runs`
                : `${stats.sandbox_runs_today ?? 0} run${(stats.sandbox_runs_today ?? 0) === 1 ? "" : "s"}`
            }
            hint={
              stats.sandbox_daily_seconds && stats.sandbox_daily_seconds > 0
                ? `${stats.sandbox_seconds_today ?? 0}s / ${stats.sandbox_daily_seconds}s runner time`
                : `${stats.sandbox_seconds_today ?? 0}s runner time`
            }
          />
        ) : null}
      </div>

      {/* Outcome distribution bar — green succeeded / red failed / amber stopped. */}
      {done > 0 && (
        <div>
          <div className="flex h-1.5 overflow-hidden rounded-full bg-muted">
            <div className="bg-emerald-500" style={{ width: `${pct(stats.succeeded)}%` }} title={`${stats.succeeded} succeeded`} />
            <div className="bg-destructive" style={{ width: `${pct(stats.failed)}%` }} title={`${stats.failed} failed`} />
            <div className="bg-amber-500" style={{ width: `${pct(stats.stopped)}%` }} title={`${stats.stopped} stopped`} />
          </div>
          <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
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
          <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Working notes</div>
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
          <summary className="cursor-pointer select-none text-[11px] text-muted-foreground hover:text-foreground">
            Code ({code.split("\n").length} line{code.split("\n").length === 1 ? "" : "s"})
          </summary>
          <pre className="mt-1 max-h-64 overflow-auto whitespace-pre rounded bg-muted/50 p-2 font-mono text-[11px] text-foreground">
            {code}
          </pre>
        </details>
      )}
      {restKeys.length > 0 && (
        <pre className="mt-1 overflow-x-auto whitespace-pre-wrap break-words text-[11px] text-muted-foreground">
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
      <div className="mb-2 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        <RefreshCw className="h-3 w-3" /> Routines
      </div>
      <div className="space-y-1.5">
        {routines.map((r) => (
          <div key={r.id} className="flex items-center gap-2 rounded-md border border-border/60 bg-card/50 p-2">
            <div className="min-w-0 flex-1">
              <div className="truncate text-xs font-medium text-foreground">{r.name || "Routine"}</div>
              <div className="truncate text-[11px] text-muted-foreground">
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
              onClick={() => remove(r)}
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

const StepView: React.FC<{ step: AgentRunStep }> = ({ step }) => (
  <div className="space-y-1.5 border-l-2 border-border/60 pl-3">
    <div className="text-[11px] font-medium text-muted-foreground">Step {step.iteration}</div>
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
            <Badge variant="outline" className="text-[10px]">{toolLabel(tc.tool)}</Badge>
            {gov ? (
              <Badge
                variant="outline"
                className="gap-1 border-amber-500/40 bg-amber-500/10 text-[10px] text-amber-600 dark:text-amber-400"
              >
                {gov.tone === "approval" ? <AlertTriangle size={10} /> : <ShieldAlert size={10} />}
                {gov.label}
              </Badge>
            ) : (
              <>
                {tc.skipped && <Badge variant="secondary" className="text-[10px]">skipped</Badge>}
                {tc.error && <Badge variant="destructive" className="text-[10px]">error</Badge>}
              </>
            )}
          </div>
          <ToolParamsView params={tc.params} />
          {tc.result && <p className="mt-1 whitespace-pre-wrap break-words text-[11px] text-foreground">{tc.result}</p>}
          {tc.error && !gov && <p className="mt-1 whitespace-pre-wrap break-words text-[11px] text-destructive">{tc.error}</p>}
          {tc.skipped && (
            <p className={"mt-1 text-[11px] " + (gov ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground")}>
              {gov ? gov.label + ": " : "Skipped: "}{tc.skipped}
            </p>
          )}
        </div>
      )
    })}
  </div>
)

const RunRow: React.FC<{ run: AgentRun }> = ({ run }) => {
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
          <Badge variant={STATUS_VARIANT[run.status]} className="text-[10px] capitalize">{run.status}</Badge>
          <span className="truncate text-xs text-muted-foreground">
            {run.trigger_source} · {formatWhen(run.started_at)}
          </span>
        </span>
        <span className="shrink-0 text-[11px] text-muted-foreground">
          {run.step_count} step{run.step_count === 1 ? "" : "s"}
          {run.tokens > 0 && ` · ${run.tokens.toLocaleString()} tok`}
          {formatDuration(run.started_at, run.ended_at) && ` · ${formatDuration(run.started_at, run.ended_at)}`}
        </span>
      </button>
      {open && (
        <div className="space-y-3 border-t border-border/60 p-3">
          {run.error && (
            <p className="rounded-md bg-destructive/10 p-2 text-xs text-destructive">{run.error}</p>
          )}
          {steps.length === 0 ? (
            <p className="text-xs text-muted-foreground">No transcript recorded for this run.</p>
          ) : (
            steps.map((s, i) => <StepView key={i} step={s} />)
          )}
          {run.result && (
            <div className="rounded-md border border-border/60 bg-muted/30 p-2">
              <div className="mb-1 text-[11px] font-medium text-muted-foreground">Final result</div>
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
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : runs && runs.length > 0 ? (
            runs.map((r) => <RunRow key={r.id} run={r} />)
          ) : (
            <p className="px-1 py-8 text-center text-sm text-muted-foreground">
              This agent hasn&apos;t run yet. Trigger it or run it manually to see its activity here.
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
