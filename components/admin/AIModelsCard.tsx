"use client"

/**
 * AIModelsCard — admin panel for OneCamp's model-agnostic AI.
 *
 * Lets an admin:
 *  - Toggle AI on/off and set the per-user rate limit.
 *  - Pick the active chat model and embedding model (from any provider).
 *  - Manage providers: built-in Ollama / OpenAI / Anthropic plus custom
 *    OpenAI-compatible endpoints (vLLM, LM Studio, OpenRouter, ...).
 *  - For local Ollama: install (pull, with live progress) and delete
 *    models, and see server disk/RAM headroom + Ollama version status.
 *
 * Single-tenant: one global config. Everything is wired to /admin/ai/*.
 */

import React, { useCallback, useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useToast } from "@/hooks/use-toast"
import { Sparkles, RefreshCw, Save, Plus, Lightbulb } from "@/lib/icons"
import {
  AIConfig,
  ModelView,
  ProviderView,
  SystemStats,
  ReindexStatus,
  MemoryBackfillStatus,
  getAIConfig,
  getAISystemStats,
  getReindexStatus,
  listProviderModels,
  setAIEnabled,
  setAIRateLimit,
  setAIContextWindow,
  setAICodeAnalysisMaxFiles,
  setAIReasoning,
  setMeetingRecapEnabled,
  setMemoryLayerEnabled,
  setTeamReportEnabled,
  runTeamReportNow,
  sendTestDigest,
  setNudgesEnabled,
  setCoworkerEnabled,
  setIssueTriageEnabled,
  rebuildAIMemory,
  getMemoryBackfillStatus,
  setChatModel,
  setVisionModel,
  setEmbeddingModel,
  deleteModel,
} from "@/services/aiModelService"
import { ProviderEditor } from "@/components/admin/ai/ProviderEditor"
import { SystemStatsBar } from "@/components/admin/ai/SystemStatsBar"
import { ModelCombobox } from "@/components/admin/ai/ModelCombobox"
import AuthorizedModelsSection from "@/components/admin/ai/AuthorizedModelsSection"
import AISelfTestSection from "@/components/admin/ai/AISelfTestSection"

const AIModelsCard = () => {
  const { toast } = useToast()

  const [config, setConfig] = useState<AIConfig | null>(null)
  const [stats, setStats] = useState<SystemStats | null>(null)
  const [reindex, setReindex] = useState<ReindexStatus | null>(null)
  const [backfill, setBackfill] = useState<MemoryBackfillStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // Per-provider model catalogs, lazily fetched.
  const [modelsByProvider, setModelsByProvider] = useState<Record<string, ModelView[]>>({})
  const [modelsLoading, setModelsLoading] = useState<Record<string, boolean>>({})

  const refreshConfig = useCallback(async () => {
    try {
      const cfg = await getAIConfig()
      setConfig(cfg)
      return cfg
    } catch {
      toast({ title: "Error", description: "Failed to load AI configuration", variant: "destructive" })
      return null
    }
  }, [toast])

  const refreshStats = useCallback(async () => {
    try {
      setStats(await getAISystemStats())
    } catch {
      // Non-fatal; the stats bar simply won't render.
    }
  }, [])

  // Poll the reindex status while a dimension-change reindex is running so
  // the admin can watch progress. Stops polling once it completes.
  const pollReindex = useCallback(async () => {
    try {
      const st = await getReindexStatus()
      setReindex(st.total > 0 || st.running ? st : null)
      return st.running
    } catch {
      return false
    }
  }, [])

  useEffect(() => {
    if (!reindex?.running) return
    const t = setInterval(async () => {
      const stillRunning = await pollReindex()
      if (!stillRunning) clearInterval(t)
    }, 2000)
    return () => clearInterval(t)
  }, [reindex?.running, pollReindex])

  // Poll the memory backfill status while a rebuild is running so the admin
  // can watch progress. Stops once it reaches a terminal state.
  const pollBackfill = useCallback(async () => {
    try {
      const st = await getMemoryBackfillStatus()
      setBackfill(st && st.state !== "idle" ? st : null)
      return st?.state === "running"
    } catch {
      return false
    }
  }, [])

  useEffect(() => {
    if (backfill?.state !== "running") return
    const t = setInterval(async () => {
      const stillRunning = await pollBackfill()
      if (!stillRunning) clearInterval(t)
    }, 3000)
    return () => clearInterval(t)
  }, [backfill?.state, pollBackfill])

  const loadModels = useCallback(
    async (providerId: string, refresh = false) => {
      if (!providerId) return
      setModelsLoading((m) => ({ ...m, [providerId]: true }))
      try {
        const models = await listProviderModels(providerId, refresh)
        setModelsByProvider((m) => ({ ...m, [providerId]: models }))
      } catch (e: any) {
        toast({
          title: "Could not list models",
          description: e?.response?.data?.msg || e?.message || "Provider unreachable",
          variant: "destructive",
        })
      } finally {
        setModelsLoading((m) => ({ ...m, [providerId]: false }))
      }
    },
    [toast],
  )

  useEffect(() => {
    ;(async () => {
      setLoading(true)
      const cfg = await refreshConfig()
      await refreshStats()
      await pollReindex()
      await pollBackfill()
      setLoading(false)
      // Eagerly load catalogs for the active chat + embedding providers.
      if (cfg?.chat_provider_id) loadModels(cfg.chat_provider_id)
      if (cfg?.embedding_provider_id && cfg.embedding_provider_id !== cfg.chat_provider_id) {
        loadModels(cfg.embedding_provider_id)
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleToggleEnabled = async (enabled: boolean) => {
    setSaving(true)
    try {
      await setAIEnabled(enabled)
      setConfig((c) => (c ? { ...c, enabled } : c))
      toast({ title: enabled ? "AI enabled" : "AI disabled" })
    } catch {
      toast({ title: "Error", description: "Failed to toggle AI", variant: "destructive" })
    } finally {
      setSaving(false)
    }
  }

  const handleToggleRecap = async (enabled: boolean) => {
    setSaving(true)
    try {
      await setMeetingRecapEnabled(enabled)
      setConfig((c) => (c ? { ...c, meeting_recap_enabled: enabled } : c))
      toast({ title: enabled ? "Meeting Recap enabled" : "Meeting Recap disabled" })
    } catch {
      toast({ title: "Error", description: "Failed to toggle Meeting Recap", variant: "destructive" })
    } finally {
      setSaving(false)
    }
  }

  const handleToggleReasoning = async (enabled: boolean) => {
    setSaving(true)
    try {
      await setAIReasoning(enabled)
      setConfig((c) => (c ? { ...c, reasoning_enabled: enabled } : c))
      toast({
        title: enabled ? "Reasoning enabled" : "Reasoning disabled",
        description: enabled
          ? "Reasoning models will think before answering (higher quality, slower)."
          : "Faster responses; reasoning models skip their chain-of-thought.",
      })
    } catch {
      toast({ title: "Error", description: "Failed to update reasoning", variant: "destructive" })
    } finally {
      setSaving(false)
    }
  }


  const handleToggleMemory = async (enabled: boolean) => {
    setSaving(true)
    try {
      await setMemoryLayerEnabled(enabled)
      setConfig((c) => (c ? { ...c, memory_layer_enabled: enabled } : c))
      toast({ title: enabled ? "Workspace Memory enabled" : "Workspace Memory disabled" })
    } catch {
      toast({ title: "Error", description: "Failed to toggle Workspace Memory", variant: "destructive" })
    } finally {
      setSaving(false)
    }
  }

  const handleToggleTeamReport = async (enabled: boolean) => {
    setSaving(true)
    try {
      await setTeamReportEnabled(enabled)
      setConfig((c) => (c ? { ...c, team_report_enabled: enabled } : c))
      toast({ title: enabled ? "Team Report enabled" : "Team Report disabled" })
    } catch {
      toast({ title: "Error", description: "Failed to toggle Team Report", variant: "destructive" })
    } finally {
      setSaving(false)
    }
  }

  // Admin verify: run the weekly team report now (posts into active channels),
  // bypassing the Monday/hour schedule + idempotency lock.
  const [runningReport, setRunningReport] = useState(false)
  const handleRunTeamReport = async () => {
    setRunningReport(true)
    try {
      const res = await runTeamReportNow()
      toast({ title: "Team report run", description: res.msg || `Posted ${res.posted} report(s).` })
    } catch (e: any) {
      toast({ title: "Could not run team report", description: e?.response?.data?.msg || e?.message || "failed", variant: "destructive" })
    } finally {
      setRunningReport(false)
    }
  }

  // Admin verify: email the calling admin a one-off open-items digest now.
  const [sendingDigest, setSendingDigest] = useState(false)
  const handleSendTestDigest = async () => {
    setSendingDigest(true)
    try {
      const msg = await sendTestDigest()
      toast({ title: "Test digest sent", description: msg })
    } catch (e: any) {
      toast({ title: "Could not send test digest", description: e?.response?.data?.msg || e?.message || "failed", variant: "destructive" })
    } finally {
      setSendingDigest(false)
    }
  }

  const handleToggleNudges = async (enabled: boolean) => {
    setSaving(true)
    try {
      await setNudgesEnabled(enabled)
      setConfig((c) => (c ? { ...c, nudges_enabled: enabled } : c))
      toast({ title: enabled ? "Proactive Nudges enabled" : "Proactive Nudges disabled" })
    } catch {
      toast({ title: "Error", description: "Failed to toggle Proactive Nudges", variant: "destructive" })
    } finally {
      setSaving(false)
    }
  }

  const handleToggleCoworker = async (enabled: boolean) => {
    setSaving(true)
    try {
      await setCoworkerEnabled(enabled)
      setConfig((c) => (c ? { ...c, coworker_enabled: enabled } : c))
      toast({ title: enabled ? "AI Coworker enabled" : "AI Coworker disabled" })
    } catch {
      toast({ title: "Error", description: "Failed to toggle AI Coworker", variant: "destructive" })
    } finally {
      setSaving(false)
    }
  }

  const handleToggleIssueTriage = async (enabled: boolean) => {
    setSaving(true)
    try {
      await setIssueTriageEnabled(enabled)
      setConfig((c) => (c ? { ...c, issue_triage_enabled: enabled } : c))
      toast({ title: enabled ? "GitHub auto-review enabled" : "GitHub auto-review disabled" })
    } catch {
      toast({ title: "Error", description: "Failed to toggle GitHub auto-review", variant: "destructive" })
    } finally {
      setSaving(false)
    }
  }

  const handleRebuildMemory = async () => {
    try {
      await rebuildAIMemory()
      toast({
        title: "Memory rebuild started",
        description: "Extracting knowledge from historical content. This runs in the background.",
      })
      // Optimistically reflect running state; the poller takes over.
      setBackfill({ state: "running", started_at: Math.floor(Date.now() / 1000) })
      pollBackfill()
    } catch (e: any) {
      const msg = e?.response?.data?.msg || e?.message || "Failed to start rebuild"
      toast({ title: "Could not start rebuild", description: msg, variant: "destructive" })
    }
  }

  if (loading) {
    return (
      <Card className="w-full h-full border-none shadow-none bg-transparent">
        <CardContent className="p-0 pt-10 text-sm text-muted-foreground animate-pulse">
          Loading AI configuration…
        </CardContent>
      </Card>
    )
  }

  if (!config) {
    return (
      <Card className="w-full h-full border-none shadow-none bg-transparent">
        <CardContent className="p-0 pt-10 text-sm text-muted-foreground">
          AI configuration unavailable.
          <Button variant="link" onClick={refreshConfig}>Retry</Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="w-full h-full flex flex-col border-none shadow-none bg-transparent">
      <CardHeader className="px-0 pt-0 pb-6 flex-shrink-0">
        <div className="flex items-center gap-2 mb-1">
          <div className="bg-primary/10 p-1.5 rounded-md">
            <Sparkles className="h-4 w-4 text-primary" />
          </div>
          <CardTitle className="text-lg sm:text-xl font-semibold tracking-tight">AI Models</CardTitle>
          <Badge variant={config.enabled ? "default" : "secondary"} className="ml-2">
            {config.enabled ? "Enabled" : "Disabled"}
          </Badge>
          {config.circuit_state && config.circuit_state !== "closed" && (
            <Badge variant="destructive">circuit: {config.circuit_state}</Badge>
          )}
        </div>
        <CardDescription className="text-sm text-muted-foreground">
          Run local models with Ollama, bring your own OpenAI / Anthropic key, or connect any
          OpenAI-compatible endpoint. Everything stays on your server.
        </CardDescription>
      </CardHeader>

      <CardContent className="px-0 flex-1 overflow-y-auto pr-2 custom-scrollbar pb-10 min-h-0 space-y-8">
        {/* Global toggles */}
        <section className="space-y-4">
          <div className="flex items-center justify-between rounded-lg border border-border bg-card/50 p-4">
            <div>
              <h3 className="text-sm font-semibold">Workspace AI</h3>
              <p className="text-xs text-muted-foreground">Turn the AI assistant and RAG on or off for everyone.</p>
            </div>
            <Switch checked={config.enabled} disabled={saving} onCheckedChange={handleToggleEnabled} />
          </div>

          <RateLimitRow
            initial={config.rate_limit_per_min}
            onSave={async (n) => {
              await setAIRateLimit(n)
              setConfig((c) => (c ? { ...c, rate_limit_per_min: n } : c))
              toast({ title: "Rate limit updated" })
            }}
          />

          <ContextWindowRow
            initial={config.context_window_tokens}
            effective={config.effective_context_window}
            onSave={async (n) => {
              await setAIContextWindow(n)
              setConfig((c) => (c ? { ...c, context_window_tokens: n } : c))
              toast({ title: "Context window updated" })
            }}
          />

          <CodeAnalysisRow
            initial={config.code_analysis_max_files}
            effective={config.effective_code_analysis_max_files}
            onSave={async (n) => {
              await setAICodeAnalysisMaxFiles(n)
              setConfig((c) => (c ? { ...c, code_analysis_max_files: n } : c))
              toast({ title: "Code analysis budget updated" })
            }}
          />

          <div className="flex items-center justify-between rounded-lg border border-border bg-card/50 p-4">
            <div className="pr-4">
              <h3 className="text-sm font-semibold">Reasoning mode</h3>
              <p className="text-xs text-muted-foreground">
                Let reasoning models (gemma4, DeepSeek-R1, Qwen3, …) think before answering.
                Better answers on hard questions, but noticeably slower — especially on CPU-only
                servers. Leave off for fastest responses. Other models ignore this.
              </p>
            </div>
            <Switch
              checked={config.reasoning_enabled}
              disabled={saving || !config.enabled}
              onCheckedChange={handleToggleReasoning}
            />
          </div>
        </section>

        {/* Server resources + Ollama version awareness */}
        {stats && <SystemStatsBar stats={stats} onRefresh={refreshStats} />}

        {/* Background embedding reindex progress (after a dimension change) */}
        {reindex && (reindex.running || reindex.total > 0) && (
          <ReindexBanner status={reindex} />
        )}

        <Separator />

        {/* Active model selection */}
        <ActiveModelSection
          config={config}
          modelsByProvider={modelsByProvider}
          modelsLoading={modelsLoading}
          onEnsureModels={loadModels}
          onChanged={async () => {
            await refreshConfig()
            await pollReindex()
          }}
        />

        <Separator />

        {/* Ambient agents */}
        <section className="space-y-4">
          <div>
            <h3 className="text-sm font-semibold flex items-center gap-2">Ambient agents</h3>
            <p className="text-xs text-muted-foreground">
              Automations that run in the background using the active models.
            </p>
          </div>
          <div className="flex items-center justify-between rounded-lg border border-border bg-card/50 p-4">
            <div className="pr-4">
              <h4 className="text-sm font-medium">Meeting Recap</h4>
              <p className="text-xs text-muted-foreground">
                When a call ends, post a recap (summary, decisions, action items) from the transcript to the
                channel or chat where the call happened. Requires call recording/transcription.
              </p>
            </div>
            <Switch
              checked={config.meeting_recap_enabled}
              disabled={saving || !config.enabled}
              onCheckedChange={handleToggleRecap}
            />
          </div>

          <div className="rounded-lg border border-border bg-card/50 p-4">
            <div className="flex items-center justify-between">
              <div className="pr-4">
                <h4 className="text-sm font-medium">Workspace Memory</h4>
                <p className="text-xs text-muted-foreground">
                  Continuously extract durable decisions, commitments, and open questions from meetings, channels,
                  DMs, and project threads into a structured, searchable memory. Powers precise answers like
                  &quot;what did we decide / who owns it / what&apos;s still open&quot; and the workspace knowledge view.
                </p>
              </div>
              <Switch
                checked={config.memory_layer_enabled}
                disabled={saving || !config.enabled}
                onCheckedChange={handleToggleMemory}
              />
            </div>

            {/* Rebuild memory: backfill over historical content. Only useful
                once the layer is enabled (live worker handles new content). */}
            {config.memory_layer_enabled && (
              <div className="mt-3 flex items-center justify-between gap-3 border-t border-border/60 pt-3">
                <div className="min-w-0">
                  <p className="text-xs font-medium">Rebuild from history</p>
                  <p className="text-xs text-muted-foreground">
                    {backfill?.state === "running"
                      ? `Scanning… ${backfill.scopes_done ?? 0}/${backfill.scopes_total ?? 0} scopes · ${backfill.items_extracted ?? 0} items`
                      : backfill?.state === "completed"
                        ? `Last rebuild: ${backfill.items_extracted ?? 0} items from ${backfill.scopes_done ?? 0} scopes${backfill.error ? " (partial — re-run to continue)" : ""}`
                        : backfill?.state === "failed"
                          ? `Last rebuild failed: ${backfill.error || "unknown error"}`
                          : "Extract knowledge from existing channels, DMs, and projects (one-time)."}
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="shrink-0"
                  disabled={backfill?.state === "running" || !config.enabled}
                  onClick={handleRebuildMemory}
                >
                  <Lightbulb className="h-3.5 w-3.5 mr-1.5" />
                  {backfill?.state === "running" ? "Rebuilding…" : "Rebuild"}
                </Button>
              </div>
            )}
          </div>

          <div className="rounded-lg border border-border bg-card/50 p-4">
            <div className="flex items-center justify-between">
              <div className="pr-4">
                <h4 className="text-sm font-medium">Weekly Team Report</h4>
                <p className="text-xs text-muted-foreground">
                  Post a weekly &quot;state of the channel&quot; report — open decisions, commitments (with owners),
                  and unresolved questions — into each active channel, grounded in workspace memory. Requires
                  Workspace Memory.
                </p>
              </div>
              <Switch
                checked={config.team_report_enabled}
                disabled={saving || !config.enabled || !config.memory_layer_enabled}
                onCheckedChange={handleToggleTeamReport}
              />
            </div>

            {/* Verify: the report POSTS INTO CHANNELS on a weekly schedule; the
                email path is the opt-in per-user digest. These buttons let an
                admin confirm both now instead of waiting for the schedule. */}
            <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border/60 pt-3">
              <Button
                variant="outline"
                size="sm"
                disabled={runningReport || !config.enabled || !config.memory_layer_enabled}
                onClick={handleRunTeamReport}
              >
                <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${runningReport ? "animate-spin" : ""}`} />
                {runningReport ? "Running…" : "Run now (post to channels)"}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={sendingDigest || !config.enabled || !config.memory_layer_enabled}
                onClick={handleSendTestDigest}
              >
                <Lightbulb className="h-3.5 w-3.5 mr-1.5" />
                {sendingDigest ? "Sending…" : "Email me a test digest"}
              </Button>
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground">
              The report posts into channels (not email). The only email is the per-user open-items digest, which
              each member opts into under their notification settings — &quot;Email me a test digest&quot; sends one to you now.
            </p>
          </div>

          <div className="flex items-center justify-between rounded-lg border border-border bg-card/50 p-4">
            <div className="pr-4">
              <h4 className="text-sm font-medium">Proactive Nudges</h4>
              <p className="text-xs text-muted-foreground">
                Surface short, actionable nudges to the right person without being asked — overdue commitments
                and stale open questions appear in their bell in real time. The &quot;push&quot; arm of the
                workspace AI. Requires Workspace Memory.
              </p>
            </div>
            <Switch
              checked={config.nudges_enabled}
              disabled={saving || !config.enabled || !config.memory_layer_enabled}
              onCheckedChange={handleToggleNudges}
            />
          </div>

          <div className="flex items-center justify-between rounded-lg border border-border bg-card/50 p-4">
            <div className="pr-4">
              <h4 className="text-sm font-medium">AI Coworker (@mention)</h4>
              <p className="text-xs text-muted-foreground">
                Let members @mention the AI in a channel to get an answer posted right there, grounded only in
                that channel&apos;s recent messages and the asker&apos;s access. It only ever replies when
                explicitly mentioned, so it stays quiet otherwise.
              </p>
            </div>
            <Switch
              checked={config.coworker_enabled}
              disabled={saving || !config.enabled}
              onCheckedChange={handleToggleCoworker}
            />
          </div>

          <div className="flex items-center justify-between rounded-lg border border-border bg-card/50 p-4">
            <div className="pr-4">
              <h4 className="text-sm font-medium">GitHub auto-review (issues &amp; PRs)</h4>
              <p className="text-xs text-muted-foreground">
                When a new issue or pull request is opened on a linked repo, the AI reviews it against the repo
                code and posts its findings (a proposed fix for issues, a review for PRs) as a comment on the
                linked task. Read-only: nothing is pushed back to GitHub. Off by default since it uses one AI
                call per opened issue or PR.
              </p>
            </div>
            <Switch
              checked={config.issue_triage_enabled}
              disabled={saving || !config.enabled}
              onCheckedChange={handleToggleIssueTriage}
            />
          </div>
        </section>

        <Separator />

        {/* Providers + local model install */}
        <ProvidersSection
          config={config}
          modelsByProvider={modelsByProvider}
          modelsLoading={modelsLoading}
          stats={stats}
          onEnsureModels={loadModels}
          onChanged={async () => {
            await refreshConfig()
            await refreshStats()
          }}
        />

        <Separator />

        {/* Member-selectable model allowlist */}
        <AuthorizedModelsSection config={config} />

        <Separator />

        {/* Admin "Test AI" — real-model validation from the dashboard */}
        <AISelfTestSection config={config} />
      </CardContent>
    </Card>
  )
}

// ─── Reindex progress banner ──────────────────────────────────────────

const ReindexBanner: React.FC<{ status: ReindexStatus }> = ({ status }) => {
  const pct = status.total > 0 ? Math.round(((status.processed + status.failed) / status.total) * 100) : 0
  return (
    <section className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-amber-700 dark:text-amber-400">
          {status.running ? "Rebuilding AI search index…" : "AI search index rebuilt"}
        </h3>
        <span className="text-xs text-muted-foreground">
          {status.processed + status.failed} / {status.total} (dim {status.dimension})
        </span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
        <div className="h-full bg-amber-500 transition-all" style={{ width: `${pct}%` }} />
      </div>
      <p className="text-xs text-muted-foreground">
        {status.running
          ? "Semantic search returns partial results until this completes. You can keep using the workspace."
          : status.message || "Done."}
        {status.failed > 0 ? ` ${status.failed} item(s) failed.` : ""}
      </p>
    </section>
  )
}

// ─── Rate limit inline editor ─────────────────────────────────────────
const RateLimitRow: React.FC<{ initial: number; onSave: (n: number) => Promise<void> }> = ({ initial, onSave }) => {
  const [value, setValue] = useState(initial)
  const [busy, setBusy] = useState(false)
  const dirty = value !== initial
  return (
    <div className="flex items-end gap-3 rounded-lg border border-border bg-card/50 p-4">
      <div className="flex-1">
        <Label htmlFor="ai-rate" className="text-sm font-semibold">Per-user rate limit</Label>
        <p className="text-xs text-muted-foreground mb-2">Max AI requests per user per minute.</p>
        <Input
          id="ai-rate"
          type="number"
          min={1}
          max={10000}
          value={value}
          onChange={(e) => setValue(parseInt(e.target.value || "0", 10))}
          className="w-32"
        />
      </div>
      <Button
        size="sm"
        disabled={!dirty || busy || value < 1}
        onClick={async () => {
          setBusy(true)
          try {
            await onSave(value)
          } finally {
            setBusy(false)
          }
        }}
      >
        <Save className="h-4 w-4 mr-1" /> Save
      </Button>
    </div>
  )
}

// ContextWindowRow lets an admin set the model's context window (tokens).
// 0 means "use the server default". The resolved/effective value (after the
// env + 8192 fallback and the 2048 floor) is shown so the admin always sees
// what's actually in force. The value drives BOTH the model's num_ctx and
// the prompt token budget, kept in lockstep server-side.
const ContextWindowRow: React.FC<{
  initial: number
  effective: number
  onSave: (n: number) => Promise<void>
}> = ({ initial, effective, onSave }) => {
  const [value, setValue] = useState(initial)
  const [busy, setBusy] = useState(false)
  const dirty = value !== initial
  const invalid = value !== 0 && (value < 2048 || value > 1_000_000)
  return (
    <div className="flex items-end gap-3 rounded-lg border border-border bg-card/50 p-4">
      <div className="flex-1">
        <Label htmlFor="ai-ctx" className="text-sm font-semibold">Context window</Label>
        <p className="text-xs text-muted-foreground mb-2">
          Max tokens the chat model can use per request. Set to match your model
          (e.g. 8192, 32768). <span className="font-medium">0</span> uses the server default.
          {" "}Currently in force: <span className="tabular-nums font-medium">{effective.toLocaleString()}</span> tokens.
        </p>
        <Input
          id="ai-ctx"
          type="number"
          min={0}
          max={1_000_000}
          step={1024}
          value={value}
          onChange={(e) => setValue(parseInt(e.target.value || "0", 10))}
          className="w-40"
        />
        {invalid && (
          <p className="text-xs text-destructive mt-1">Use 0 (default) or a value between 2048 and 1000000.</p>
        )}
      </div>
      <Button
        size="sm"
        disabled={!dirty || busy || invalid}
        onClick={async () => {
          setBusy(true)
          try {
            await onSave(value)
          } finally {
            setBusy(false)
          }
        }}
      >
        <Save className="h-4 w-4 mr-1" /> Save
      </Button>
    </div>
  )
}

// CodeAnalysisRow lets an admin choose how thorough the code-aware bug agent
// is, as a simple Quick / Balanced / Thorough preset rather than a raw file
// count. The presets map to a file budget under the hood; cost is ultimately
// bounded by the model context window, so this only trades breadth vs speed.
const CODE_DEPTH_PRESETS: { label: string; value: number; hint: string }[] = [
  { label: "Quick", value: 3, hint: "Fewer files, fastest" },
  { label: "Balanced", value: 6, hint: "Recommended" },
  { label: "Thorough", value: 12, hint: "More files, slower" },
]

const CodeAnalysisRow: React.FC<{
  initial: number
  effective: number
  onSave: (n: number) => Promise<void>
}> = ({ initial, effective, onSave }) => {
  const [busy, setBusy] = useState(false)
  // Map the stored/effective file budget to the nearest preset for display.
  const current = (() => {
    const v = initial > 0 ? initial : effective
    let best = CODE_DEPTH_PRESETS[1].value
    let bestDist = Infinity
    for (const p of CODE_DEPTH_PRESETS) {
      const d = Math.abs(p.value - v)
      if (d < bestDist) {
        bestDist = d
        best = p.value
      }
    }
    return best
  })()

  const pick = async (value: number) => {
    if (busy || value === current) return
    setBusy(true)
    try {
      await onSave(value)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rounded-lg border border-border bg-card/50 p-4">
      <Label className="text-sm font-semibold">Code analysis depth</Label>
      <p className="text-xs text-muted-foreground mb-3">
        How many repo files the bug-analysis agent reviews per run. More is better grounded but slower. Cost stays
        bounded by your model&apos;s context window.
      </p>
      <div className="inline-flex rounded-md border border-border overflow-hidden">
        {CODE_DEPTH_PRESETS.map((p) => (
          <button
            key={p.value}
            type="button"
            disabled={busy}
            onClick={() => pick(p.value)}
            title={p.hint}
            className={
              "px-3 py-1.5 text-xs font-medium transition-colors border-r border-border last:border-r-0 " +
              (p.value === current
                ? "bg-primary text-primary-foreground"
                : "bg-transparent text-muted-foreground hover:text-foreground hover:bg-muted/50")
            }
          >
            {p.label}
          </button>
        ))}
      </div>
    </div>
  )
}

// ─── Active model selection ───────────────────────────────────────────

interface SectionProps {
  config: AIConfig
  modelsByProvider: Record<string, ModelView[]>
  modelsLoading: Record<string, boolean>
  onEnsureModels: (providerId: string, refresh?: boolean) => Promise<void>
  onChanged: () => Promise<AIConfig | null> | Promise<void>
}

const ActiveModelSection: React.FC<SectionProps> = ({
  config,
  modelsByProvider,
  modelsLoading,
  onEnsureModels,
  onChanged,
}) => {
  const { toast } = useToast()
  const enabledProviders = config.providers.filter((p) => p.enabled)

  // Chat selection state.
  const [chatProvider, setChatProvider] = useState(config.chat_provider_id)
  const [chatModel, setChatModelState] = useState(config.chat_model)
  // Embedding selection state.
  const [embProvider, setEmbProvider] = useState(config.embedding_provider_id)
  const [embModel, setEmbModel] = useState(config.embedding_model)
  const [embDim, setEmbDim] = useState(config.embedding_dimension)
  // Vision selection state (optional multimodal model for image analysis).
  const [visionProvider, setVisionProvider] = useState(config.vision_provider_id)
  const [visionModel, setVisionModelState] = useState(config.vision_model)
  const [savingChat, setSavingChat] = useState(false)
  const [savingEmb, setSavingEmb] = useState(false)
  const [savingVision, setSavingVision] = useState(false)

  useEffect(() => {
    if (chatProvider) onEnsureModels(chatProvider)
  }, [chatProvider, onEnsureModels])
  useEffect(() => {
    if (embProvider) onEnsureModels(embProvider)
  }, [embProvider, onEnsureModels])
  useEffect(() => {
    if (visionProvider) onEnsureModels(visionProvider)
  }, [visionProvider, onEnsureModels])

  const saveVision = async () => {
    setSavingVision(true)
    try {
      // Empty provider+model clears the selection (image analysis off).
      await setVisionModel(visionProvider || "", visionModel || "")
      toast({
        title: visionProvider && visionModel ? "Vision model updated" : "Vision turned off",
        description: visionProvider && visionModel ? `${visionModel} will analyze images.` : "Image analysis is disabled.",
      })
      await onChanged()
    } catch (e: any) {
      toast({ title: "Failed", description: e?.response?.data?.msg || e?.message, variant: "destructive" })
    } finally {
      setSavingVision(false)
    }
  }

  const turnOffVision = async () => {
    setVisionProvider("")
    setVisionModelState("")
    setSavingVision(true)
    try {
      await setVisionModel("", "")
      toast({ title: "Vision turned off", description: "Image analysis is disabled." })
      await onChanged()
    } catch (e: any) {
      toast({ title: "Failed", description: e?.response?.data?.msg || e?.message, variant: "destructive" })
    } finally {
      setSavingVision(false)
    }
  }

  const saveChat = async () => {
    if (!chatProvider || !chatModel) {
      toast({ title: "Pick a provider and model", variant: "destructive" })
      return
    }
    setSavingChat(true)
    try {
      await setChatModel(chatProvider, chatModel)
      toast({ title: "Chat model updated", description: `${chatModel} is now active.` })
      await onChanged()
    } catch (e: any) {
      toast({ title: "Failed", description: e?.response?.data?.msg || e?.message, variant: "destructive" })
    } finally {
      setSavingChat(false)
    }
  }

  const saveEmbedding = async (reindex: boolean) => {
    if (!embProvider || !embModel || embDim < 1) {
      toast({ title: "Pick a provider, model and dimension", variant: "destructive" })
      return
    }
    setSavingEmb(true)
    try {
      await setEmbeddingModel(embProvider, embModel, embDim, reindex)
      toast({ title: "Embedding model updated", description: reindex ? "Reindex started in the background." : `${embModel} is now active.` })
      await onChanged()
    } catch (e: any) {
      const status = e?.response?.status
      if (status === 409) {
        // Dimension change requires reindex confirmation.
        const ok = window.confirm(
          `Changing the embedding dimension to ${embDim} will rebuild the entire AI search index ` +
            `and re-embed all content. AI search results will be partial until it completes. Continue?`,
        )
        if (ok) {
          await saveEmbedding(true)
          return
        }
      } else {
        toast({ title: "Failed", description: e?.response?.data?.msg || e?.message, variant: "destructive" })
      }
    } finally {
      setSavingEmb(false)
    }
  }

  return (
    <section className="space-y-6">
      <div>
        <h3 className="text-sm font-semibold flex items-center gap-2">Active models</h3>
        <p className="text-xs text-muted-foreground">Chat and embeddings can use different providers.</p>
      </div>

      {/* Chat model */}
      <ModelSelectorRow
        title="Chat / completion model"
        hint="Powers Q&A, summaries, and the document assistant."
        providers={enabledProviders}
        providerId={chatProvider}
        model={chatModel}
        models={modelsByProvider[chatProvider] ?? []}
        loading={!!modelsLoading[chatProvider]}
        onProviderChange={(id) => {
          setChatProvider(id)
          setChatModelState("")
        }}
        onModelChange={setChatModelState}
        onRefreshModels={() => onEnsureModels(chatProvider, true)}
        onSave={saveChat}
        saving={savingChat}
      />

      {/* Embedding model */}
      <div className="space-y-2">
        <ModelSelectorRow
          title="Embedding model"
          hint="Powers semantic search (RAG). Changing the vector dimension triggers a reindex."
          providers={enabledProviders}
          providerId={embProvider}
          model={embModel}
          models={(modelsByProvider[embProvider] ?? []).filter((m) => m.embedding || true)}
          loading={!!modelsLoading[embProvider]}
          onProviderChange={(id) => {
            setEmbProvider(id)
            setEmbModel("")
          }}
          onModelChange={setEmbModel}
          onRefreshModels={() => onEnsureModels(embProvider, true)}
          onSave={() => saveEmbedding(false)}
          saving={savingEmb}
          extra={
            <div className="flex items-end gap-2">
              <div>
                <Label htmlFor="emb-dim" className="text-xs">Dimension</Label>
                <Input
                  id="emb-dim"
                  type="number"
                  min={1}
                  value={embDim}
                  onChange={(e) => setEmbDim(parseInt(e.target.value || "0", 10))}
                  className="w-28"
                />
              </div>
            </div>
          }
        />
        <p className="text-xs text-amber-600 dark:text-amber-500">
          Current index dimension: {config.embedding_dimension}. Switching to a model with a different
          dimension rebuilds the search index.
        </p>
      </div>

      {/* Vision model (optional) */}
      <div className="space-y-2">
        <ModelSelectorRow
          title="Vision model (optional)"
          hint="Lets the AI analyze images and GIFs. Pick a multimodal model (e.g. gpt-4o, a Claude vision model, or local llava / llama3.2-vision). Leave unset to keep image analysis off. Text documents do not need this."
          providers={enabledProviders}
          providerId={visionProvider}
          model={visionModel}
          models={modelsByProvider[visionProvider] ?? []}
          loading={!!modelsLoading[visionProvider]}
          onProviderChange={(id) => {
            setVisionProvider(id)
            setVisionModelState("")
          }}
          onModelChange={setVisionModelState}
          onRefreshModels={() => onEnsureModels(visionProvider, true)}
          onSave={saveVision}
          saving={savingVision}
          extra={
            config.vision_model ? (
              <Button variant="outline" className="h-9" onClick={turnOffVision} disabled={savingVision}>
                Turn off
              </Button>
            ) : undefined
          }
        />
        {config.vision_model ? (
          <p className="text-xs text-muted-foreground">
            Active vision model: <span className="font-medium text-foreground">{config.vision_model}</span>.
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">No vision model set. Image analysis is unavailable.</p>
        )}
      </div>
    </section>
  )
}

// ─── A single provider+model picker row ───────────────────────────────

const ModelSelectorRow: React.FC<{
  title: string
  hint: string
  providers: ProviderView[]
  providerId: string
  model: string
  models: ModelView[]
  loading: boolean
  onProviderChange: (id: string) => void
  onModelChange: (m: string) => void
  onRefreshModels: () => void
  onSave: () => void
  saving: boolean
  extra?: React.ReactNode
}> = ({
  title,
  hint,
  providers,
  providerId,
  model,
  models,
  loading,
  onProviderChange,
  onModelChange,
  onRefreshModels,
  onSave,
  saving,
  extra,
}) => {
  return (
    <div className="rounded-lg border border-border bg-card/50 p-4 space-y-3">
      <div>
        <h4 className="text-sm font-medium">{title}</h4>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[180px]">
          <Label className="text-xs">Provider</Label>
          <Select value={providerId} onValueChange={onProviderChange}>
            <SelectTrigger className="h-9"><SelectValue placeholder="Select provider" /></SelectTrigger>
            <SelectContent>
              {providers.map((p) => (
                <SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="min-w-[220px] flex-1">
          <div className="flex items-center justify-between">
            <Label className="text-xs">Model</Label>
            <button
              type="button"
              onClick={onRefreshModels}
              className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
            >
              <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} /> refresh
            </button>
          </div>
          {/* Real combobox: a clickable dropdown of available models plus a
              free-text path so any unlisted model id can still be entered.
              (Replaced a flaky native <datalist> that didn't render reliably.) */}
          <ModelCombobox
            value={model}
            models={models}
            loading={loading}
            disabled={!providerId}
            onChange={onModelChange}
          />
        </div>

        {extra}

        <Button size="sm" onClick={onSave} disabled={saving || !providerId || !model}>
          <Save className="h-4 w-4 mr-1" /> {saving ? "Saving…" : "Set active"}
        </Button>
      </div>
    </div>
  )
}

// ─── Providers section (CRUD + local install) ─────────────────────────

const ProvidersSection: React.FC<SectionProps & { stats: SystemStats | null }> = ({
  config,
  modelsByProvider,
  modelsLoading,
  stats,
  onEnsureModels,
  onChanged,
}) => {
  const { toast } = useToast()
  const [showAdd, setShowAdd] = useState(false)

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold">Providers</h3>
          <p className="text-xs text-muted-foreground">Built-in providers plus your custom endpoints.</p>
        </div>
        <Button size="sm" variant="secondary" onClick={() => setShowAdd(true)}>
          <Plus className="h-4 w-4 mr-1" /> Add custom endpoint
        </Button>
      </div>

      <div className="space-y-3">
        {config.providers.map((p) => (
          <ProviderEditor
            key={p.id}
            provider={p}
            models={modelsByProvider[p.id] ?? []}
            modelsLoading={!!modelsLoading[p.id]}
            stats={stats}
            onEnsureModels={onEnsureModels}
            onChanged={onChanged}
            onDeleteModel={async (model) => {
              try {
                await deleteModel(p.id, model)
                toast({ title: "Model deleted", description: model })
                await onEnsureModels(p.id, true)
                await onChanged()
              } catch (e: any) {
                toast({ title: "Failed", description: e?.response?.data?.msg || e?.message, variant: "destructive" })
              }
            }}
          />
        ))}
      </div>

      {showAdd && (
        <ProviderEditor
          createMode
          onClose={() => setShowAdd(false)}
          onChanged={onChanged}
        />
      )}
    </section>
  )
}

export default AIModelsCard
