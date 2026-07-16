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
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useToast } from "@/hooks/use-toast"
import { useConfirm } from "@/hooks/useConfirm"
import { Sparkles, RefreshCw, Save, Plus, Lightbulb } from "@/lib/icons"
import {
  AIConfig,
  ModelView,
  ProviderView,
  SystemStats,
  ReindexStatus,
  MemoryBackfillStatus,
  CodePRScorecard as CodePRScorecardData,
  CodePRRunView,
  getAIConfig,
  getAISystemStats,
  getReindexStatus,
  getAIUsage,
  AIUsage,
  getAIUserUsage,
  AIUserUsageRow,
  getAIChannelUsage,
  AIChannelUsageRow,
  listProviderModels,
  setAIEnabled,
  setAIRateLimit,
  setAIContextWindow,
  setAIWorkspaceTokenBudget,
  setAIUserTokenBudget,
  setAICodeAnalysisMaxFiles,
  setAIReasoning,
  setAILocalOnly,
  setAIPIIRedaction,
  setAIPIIPatterns,
  setMeetingRecapEnabled,
  setMeetingRecapInstructions,
  setWebSearch,
  setSandboxConfig,
  setSandboxEnabled,
  testSandbox,
  setCodePRConfig,
  setCodePREnabled,
  setCodePRModel,
  getCodePRScorecard,
  testCodePRRunner,
  getCodePRRuns,
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
import McpServersCard from "@/components/admin/McpServersCard"

const AIModelsCard = () => {
  const { toast } = useToast()

  const [config, setConfig] = useState<AIConfig | null>(null)
  const [stats, setStats] = useState<SystemStats | null>(null)
  const [reindex, setReindex] = useState<ReindexStatus | null>(null)
  const [usage, setUsage] = useState<AIUsage | null>(null)
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
      try {
        setUsage(await getAIUsage())
      } catch {
        // Non-fatal; the usage row simply won't render.
      }
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

  const handleSaveRecapInstructions = async (instructions: string) => {
    setSaving(true)
    try {
      await setMeetingRecapInstructions(instructions)
      setConfig((c) => (c ? { ...c, meeting_recap_instructions: instructions } : c))
      toast({ title: "Recap instructions saved" })
    } catch {
      toast({ title: "Error", description: "Failed to save recap instructions", variant: "destructive" })
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


  const handleToggleLocalOnly = async (enabled: boolean) => {
    setSaving(true)
    try {
      await setAILocalOnly(enabled)
      setConfig((c) => (c ? { ...c, local_only_mode: enabled } : c))
      toast({
        title: enabled ? "Local-only AI enabled" : "Local-only AI disabled",
        description: enabled
          ? "No workspace content will leave this server. Cloud providers are blocked at the network layer."
          : "Cloud AI providers (OpenAI, Anthropic, …) can be used again.",
      })
    } catch (e: any) {
      toast({
        title: "Error",
        description: e?.response?.data?.msg || "Failed to update local-only mode",
        variant: "destructive",
      })
    } finally {
      setSaving(false)
    }
  }


  const handleTogglePIIRedaction = async (enabled: boolean) => {
    setSaving(true)
    try {
      await setAIPIIRedaction(enabled)
      setConfig((c) => (c ? { ...c, pii_redaction_enabled: enabled } : c))
      toast({
        title: enabled ? "PII redaction enabled" : "PII redaction disabled",
        description: enabled
          ? "Detected PII is scrubbed from prompts before they reach any cloud model."
          : "Prompts are sent to cloud models without PII redaction.",
      })
    } catch (e: any) {
      toast({
        title: "Error",
        description: e?.response?.data?.msg || "Failed to update PII redaction",
        variant: "destructive",
      })
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
        {/* Global config — grouped so an admin can scan: behavior, cost
            governance, and model tuning are separate clusters. */}
        <section className="space-y-6">
          {/* General */}
          <div className="space-y-3">
            <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              General
            </h3>
            <div className="flex items-center justify-between rounded-lg border border-border bg-card/50 p-4">
              <div>
                <h4 className="text-sm font-semibold">Workspace AI</h4>
                <p className="text-xs text-muted-foreground">Turn the AI assistant and RAG on or off for everyone.</p>
              </div>
              <Switch checked={config.enabled} disabled={saving} onCheckedChange={handleToggleEnabled} />
            </div>

            <div className="flex items-center justify-between rounded-lg border border-border bg-card/50 p-4">
              <div className="pr-4">
                <h4 className="text-sm font-semibold">Reasoning mode</h4>
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

            <div className="flex items-center justify-between rounded-lg border border-border bg-card/50 p-4">
              <div className="pr-4">
                <h4 className="text-sm font-semibold flex items-center gap-2">
                  Local-only AI
                  {config.local_only_pinned_by_env && (
                    <Badge variant="secondary" className="text-[10px]">Locked by env</Badge>
                  )}
                </h4>
                <p className="text-xs text-muted-foreground">
                  No workspace content leaves this server. Blocks every cloud AI provider
                  (OpenAI, Anthropic, hosted endpoints) at the network layer so prompts and
                  documents can only ever reach local models on your own infrastructure. Enable
                  only after your active chat, vision, and embedding models all run locally.
                  {config.local_only_pinned_by_env &&
                    " Enforced by an environment variable on this server, so it cannot be turned off here."}
                </p>
              </div>
              <Switch
                checked={config.local_only_mode}
                disabled={saving || config.local_only_pinned_by_env}
                onCheckedChange={handleToggleLocalOnly}
              />
            </div>

            <div className="rounded-lg border border-border bg-card/50 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="pr-4">
                  <h4 className="text-sm font-semibold">PII redaction before cloud models</h4>
                  <p className="text-xs text-muted-foreground">
                    When a prompt is sent to a cloud model, scrub detected PII first
                    (email, phone, credit card, government ID, IBAN, plus your own
                    patterns). Local models receive unmodified content, since nothing
                    leaves the server. Has no effect while Local-only AI is on (cloud is
                    already blocked).
                  </p>
                </div>
                <Switch
                  checked={config.pii_redaction_enabled}
                  disabled={saving || config.local_only_mode}
                  onCheckedChange={handleTogglePIIRedaction}
                />
              </div>

              {config.pii_redaction_enabled && !config.local_only_mode && (
                <PIIPatternsEditor
                  initial={config.pii_custom_patterns}
                  onSave={async (patterns) => {
                    await setAIPIIPatterns(patterns)
                    setConfig((c) => (c ? { ...c, pii_custom_patterns: patterns } : c))
                    toast({ title: "Custom PII patterns saved" })
                  }}
                />
              )}
            </div>
          </div>

          {/* Usage & limits */}
          <div className="space-y-3">
            <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Usage &amp; limits
            </h3>
            <RateLimitRow
              initial={config.rate_limit_per_min}
              onSave={async (n) => {
                await setAIRateLimit(n)
                setConfig((c) => (c ? { ...c, rate_limit_per_min: n } : c))
                toast({ title: "Rate limit updated" })
              }}
            />

            {usage && <UsageRow usage={usage} />}

            <TokenBudgetRow
              id="ai-ws-budget"
              label="Workspace daily token budget"
              hint="Caps total AI tokens spent across the workspace per day. 0 = unlimited."
              initial={config.workspace_daily_token_budget ?? 0}
              onSave={async (n) => {
                await setAIWorkspaceTokenBudget(n)
                setConfig((c) => (c ? { ...c, workspace_daily_token_budget: n } : c))
                try {
                  setUsage(await getAIUsage())
                } catch {
                  /* non-fatal */
                }
                toast({ title: "Workspace token budget updated" })
              }}
            />

            <TokenBudgetRow
              id="ai-user-budget"
              label="Per-user daily token budget"
              hint="Caps AI tokens spent by each individual user per day, so one person can't drain the workspace budget. 0 = unlimited."
              initial={config.user_daily_token_budget ?? 0}
              onSave={async (n) => {
                await setAIUserTokenBudget(n)
                setConfig((c) => (c ? { ...c, user_daily_token_budget: n } : c))
                try {
                  setUsage(await getAIUsage())
                } catch {
                  /* non-fatal */
                }
                toast({ title: "Per-user token budget updated" })
              }}
            />

            <TopConsumersRow />
            <TopChannelsRow />
          </div>

          {/* Model tuning */}
          <div className="space-y-3">
            <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Model tuning
            </h3>
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
          <div className="rounded-lg border border-border bg-card/50 p-4">
            <div className="flex items-center justify-between">
              <div className="pr-4">
                <h4 className="text-sm font-medium">Meeting Recap</h4>
                <p className="text-xs text-muted-foreground">
                  When a call ends, post a recap (summary, decisions, action items) from the transcript to the
                  channel or chat where the call happened. Requires call recording/transcription. The meeting can
                  be in any language — the recap is always written in English.
                </p>
              </div>
              <Switch
                checked={config.meeting_recap_enabled}
                disabled={saving || !config.enabled}
                onCheckedChange={handleToggleRecap}
              />
            </div>
            {config.meeting_recap_enabled && (
              <RecapInstructionsField
                initial={config.meeting_recap_instructions || ""}
                disabled={saving || !config.enabled}
                onSave={handleSaveRecapInstructions}
              />
            )}
          </div>

          <WebSearchSection config={config} onChanged={refreshConfig} />

          <SandboxSection config={config} onChanged={refreshConfig} />
          <CodePRSection
            config={config}
            onChanged={refreshConfig}
            modelsByProvider={modelsByProvider}
            modelsLoading={modelsLoading}
            onEnsureModels={loadModels}
          />
          <CodePRReliabilityCard />

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

        <Separator />

        {/* MCP servers — connect external tool servers to agents */}
        <McpServersCard />
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

// ─── AI token usage (read-only) ───────────────────────────────────────
// Shows today's token spend for the workspace and the current admin against
// their daily caps. Caps are configured via env (AI_WORKSPACE_DAILY_TOKEN_BUDGET
// / AI_USER_DAILY_TOKEN_BUDGET); 0 means unlimited.
const UsageMeterBar: React.FC<{ label: string; used: number; limit: number }> = ({ label, used, limit }) => {
  const u = Number.isFinite(used) ? used : 0
  const l = Number.isFinite(limit) ? limit : 0
  const pct = l > 0 ? Math.min(100, Math.round((u / l) * 100)) : 0
  const near = l > 0 && pct >= 80
  const fmt = (n: number) => n.toLocaleString()
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium tabular-nums">
          {fmt(u)}
          {l > 0 ? ` / ${fmt(l)}` : " tokens"}
        </span>
      </div>
      {l > 0 && (
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className={`h-full rounded-full transition-all ${near ? "bg-amber-500" : "bg-primary"}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      )}
    </div>
  )
}

const UsageRow: React.FC<{ usage: AIUsage }> = ({ usage }) => {
  const ws = usage.workspace || { used: 0, limit: 0 }
  const me = usage.user || { used: 0, limit: 0 }
  const noCaps = (ws.limit || 0) === 0 && (me.limit || 0) === 0
  return (
    <div className="rounded-lg border bg-card/50 p-3 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold">AI usage today</h3>
          <p className="text-xs text-muted-foreground">Tokens consumed across all AI features. Resets at 00:00 UTC.</p>
        </div>
      </div>
      <UsageMeterBar label="Workspace" used={ws.used} limit={ws.limit} />
      <UsageMeterBar label="You" used={me.used} limit={me.limit} />
      {noCaps && (
        <p className="text-xs text-muted-foreground">
          No daily caps set. Set AI_WORKSPACE_DAILY_TOKEN_BUDGET and/or AI_USER_DAILY_TOKEN_BUDGET to limit spend.
        </p>
      )}
      <p className="border-t border-border/50 pt-2 text-[11px] leading-relaxed text-muted-foreground">
        Counts both prompt (input) and response (output) tokens, combined. They use
        each provider&apos;s reported token usage where available and a calibrated
        estimate otherwise, are best-effort (a brief metering outage isn&apos;t
        counted), and can lag a little under heavy concurrent use. Embedding/indexing
        for search is a separate cost and isn&apos;t counted here. Treat this as a
        spend guardrail, not a billing-grade meter.
      </p>
    </div>
  )
}

// ─── Top AI-token consumers today (admin-only) ────────────────────────
// Complements the per-user cap: shows who is actually spending the workspace
// budget today so an admin can set sensible limits. Read-only, best-effort
// (empty when Redis is unavailable). Fetched lazily, with a manual refresh.
const TopConsumersRow: React.FC = () => {
  const [rows, setRows] = useState<AIUserUsageRow[] | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setBusy(true)
    try {
      const res = await getAIUserUsage(25)
      setRows(res?.users || [])
    } catch {
      setRows([])
    } finally {
      setBusy(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const fmt = (n: number) => (Number.isFinite(n) ? n : 0).toLocaleString()

  return (
    <div className="space-y-3 rounded-lg border border-border bg-card/50 p-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold">Top consumers today</h3>
          <p className="text-xs text-muted-foreground">
            Highest AI token spend per user, this UTC day. Use it to tune the per-user cap.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={busy}>
          {busy ? "Refreshing…" : "Refresh"}
        </Button>
      </div>
      {rows && rows.length > 0 ? (
        <ul className="divide-y divide-border/50">
          {rows.map((u, i) => (
            <li key={u.user_id} className="flex items-center justify-between py-1.5 text-sm">
              <span className="flex min-w-0 items-center gap-2">
                <span className="w-5 text-right text-xs text-muted-foreground">{i + 1}</span>
                <span className="truncate">{u.full_name || u.name || u.user_id}</span>
              </span>
              <span className="tabular-nums text-muted-foreground">{fmt(u.used)} tok</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-muted-foreground">
          {busy ? "Loading…" : "No AI usage recorded yet today."}
        </p>
      )}
    </div>
  )
}

// ─── Top AI-spending channels today (admin-only) ──────────────────────
// The per-channel companion to TopConsumersRow: shows which channels are
// driving AI cost today (Claude-Tag's per-channel usage breakdown) so an admin
// can set per-channel caps. Read-only, best-effort. Fetched lazily.
const TopChannelsRow: React.FC = () => {
  const [rows, setRows] = useState<AIChannelUsageRow[] | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setBusy(true)
    try {
      const res = await getAIChannelUsage(25)
      setRows(res?.channels || [])
    } catch {
      setRows([])
    } finally {
      setBusy(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const fmt = (n: number) => (Number.isFinite(n) ? n : 0).toLocaleString()

  return (
    <div className="space-y-3 rounded-lg border border-border bg-card/50 p-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold">Top AI-spending channels today</h3>
          <p className="text-xs text-muted-foreground">
            Where AI cost is going per channel, this UTC day. Set a per-channel cap from the channel&apos;s members dialog.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={busy}>
          {busy ? "Refreshing…" : "Refresh"}
        </Button>
      </div>
      {rows && rows.length > 0 ? (
        <ul className="divide-y divide-border/50">
          {rows.map((c, i) => (
            <li key={c.channel_id} className="flex items-center justify-between py-1.5 text-sm">
              <span className="flex min-w-0 items-center gap-2">
                <span className="w-5 text-right text-xs text-muted-foreground">{i + 1}</span>
                <span className="truncate">{c.name ? `#${c.name}` : c.channel_id}</span>
              </span>
              <span className="tabular-nums text-muted-foreground">{fmt(c.used)} tok</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-muted-foreground">
          {busy ? "Loading…" : "No channel AI usage recorded yet today."}
        </p>
      )}
    </div>
  )
}

// ─── PII custom-patterns editor ───────────────────────────────────────
// One regex per line, added on top of the built-in detectors. The backend
// rejects the save if any line is an invalid regex.
const PIIPatternsEditor: React.FC<{ initial: string; onSave: (patterns: string) => Promise<void> }> = ({
  initial,
  onSave,
}) => {
  const { toast } = useToast()
  const [value, setValue] = useState(initial ?? "")
  const [busy, setBusy] = useState(false)
  const dirty = value !== (initial ?? "")
  return (
    <div className="border-t border-border/60 pt-3 space-y-2">
      <Label htmlFor="pii-patterns" className="text-xs font-medium">
        Custom patterns (one regex per line)
      </Label>
      <Textarea
        id="pii-patterns"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={"EMP-\\d{4}\nACME-[A-Z0-9]{6}"}
        rows={3}
        className="font-mono text-xs"
      />
      <div className="flex justify-end">
        <Button
          size="sm"
          variant="outline"
          disabled={!dirty || busy}
          onClick={async () => {
            setBusy(true)
            try {
              await onSave(value)
            } catch (e: any) {
              toast({
                title: "Could not save patterns",
                description: e?.response?.data?.msg || "One of the patterns is an invalid regex.",
                variant: "destructive",
              })
            } finally {
              setBusy(false)
            }
          }}
        >
          <Save className="h-4 w-4 mr-1" /> Save patterns
        </Button>
      </div>
    </div>
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

// ─── Daily token budget inline editor ─────────────────────────────────
// Edits one daily AI token cap (0 = unlimited). Mirrors RateLimitRow but
// allows 0 and uses a wider input for large token values.
const TokenBudgetRow: React.FC<{
  id: string
  label: string
  hint: string
  initial: number
  onSave: (n: number) => Promise<void>
}> = ({ id, label, hint, initial, onSave }) => {
  const safeInitial = Number.isFinite(initial) ? initial : 0
  const [value, setValue] = useState(safeInitial)
  const [busy, setBusy] = useState(false)
  useEffect(() => setValue(safeInitial), [safeInitial])
  const dirty = value !== safeInitial
  return (
    <div className="flex items-end gap-3 rounded-lg border border-border bg-card/50 p-4">
      <div className="flex-1">
        <Label htmlFor={id} className="text-sm font-semibold">{label}</Label>
        <p className="text-xs text-muted-foreground mb-2">{hint}</p>
        <Input
          id={id}
          type="number"
          min={0}
          step={1000}
          value={value}
          onChange={(e) => setValue(Math.max(0, parseInt(e.target.value || "0", 10)))}
          className="w-40"
        />
        <p className="text-[11px] text-muted-foreground mt-1">{value === 0 ? "Unlimited" : `${value.toLocaleString()} tokens/day`}</p>
      </div>
      <Button
        size="sm"
        disabled={!dirty || busy || value < 0}
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
  const confirm = useConfirm()
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
        confirm({
          title: "Rebuild AI search index?",
          description:
            `Changing the embedding dimension to ${embDim} will rebuild the entire AI search index ` +
            `and re-embed all content. AI search results will be partial until it completes. Continue?`,
          confirmText: "Rebuild index",
          onConfirm: () => {
            void saveEmbedding(true)
          },
        })
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

// WebSearchSection configures the provider-agnostic web search the assistant
// and agents can use. Provider-agnostic by design: pick SearXNG (self-hosted,
// residency-friendly), Tavily, or Brave. The API key is write-only (never
// returned); leave it blank to keep the stored one.
// RecapInstructionsField lets an admin add optional free-text guidance appended
// to the meeting-recap prompt (e.g. "always add a Risks section", "write in
// Spanish"). Local draft state with an explicit Save, disabled when unchanged.
function RecapInstructionsField({
  initial,
  disabled,
  onSave,
}: {
  initial: string
  disabled: boolean
  onSave: (instructions: string) => Promise<void>
}) {
  const [draft, setDraft] = useState(initial)
  useEffect(() => {
    setDraft(initial)
  }, [initial])
  const dirty = draft.trim() !== (initial || "").trim()

  return (
    <div className="mt-3 border-t border-border/50 pt-3">
      <Label className="text-xs font-medium text-muted-foreground">Custom instructions (optional)</Label>
      <p className="mb-2 text-[11px] leading-tight text-muted-foreground">
        Tailor what the recap emphasizes. These are added to the recap prompt and can&apos;t override its
        grounding rules (it always uses only the transcript). Example: &quot;Add a Risks section and write the
        recap in Spanish.&quot;
      </p>
      <Textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder="e.g. Always include a Risks section and a one-line TL;DR at the top."
        rows={3}
        maxLength={2000}
        disabled={disabled}
        className="text-sm"
      />
      <div className="mt-2 flex justify-end">
        <Button size="sm" variant="outline" className="gap-1.5" disabled={disabled || !dirty} onClick={() => onSave(draft.trim())}>
          <Save className="h-3.5 w-3.5" />
          Save instructions
        </Button>
      </div>
    </div>
  )
}

function WebSearchSection({
  config,
  onChanged,
}: {
  config: AIConfig
  onChanged: () => Promise<AIConfig | null> | Promise<void>
}) {
  const { toast } = useToast()
  const [provider, setProvider] = useState(config.web_search_provider || "none")
  const [baseURL, setBaseURL] = useState(config.web_search_base_url || "")
  const [apiKey, setApiKey] = useState("")
  const [enabled, setEnabled] = useState(config.web_search_enabled)
  const [saving, setSaving] = useState(false)

  const realProvider = provider === "none" ? "" : provider
  const needsKey = realProvider === "tavily" || realProvider === "brave"
  const needsBase = realProvider === "searxng"

  const save = async () => {
    if (needsBase && enabled && !baseURL.trim()) {
      toast({ title: "A base URL is required for SearXNG", variant: "destructive" })
      return
    }
    setSaving(true)
    try {
      await setWebSearch({
        provider: realProvider,
        base_url: baseURL.trim(),
        api_key: apiKey.trim() || undefined,
        enabled: realProvider !== "" && enabled,
      })
      setApiKey("")
      toast({ title: "Web search updated" })
      await onChanged()
    } catch (e) {
      toast({
        title: "Error",
        description: e instanceof Error ? e.message : "Failed to update web search",
        variant: "destructive",
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="rounded-lg border border-border bg-card/50 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="pr-4">
          <h4 className="text-sm font-medium">Web search</h4>
          <p className="text-xs text-muted-foreground">
            Let the AI assistant and agents look up current information on the web. Provider-agnostic: run your own
            SearXNG (stays on your infra, works in local-only mode) or use Tavily / Brave. Off until you configure a
            provider.
          </p>
        </div>
        <Switch
          checked={enabled && realProvider !== ""}
          disabled={saving || realProvider === ""}
          onCheckedChange={setEnabled}
        />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label className="text-xs">Provider</Label>
          <Select value={provider} onValueChange={setProvider}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Disabled</SelectItem>
              <SelectItem value="searxng">SearXNG (self-hosted)</SelectItem>
              <SelectItem value="tavily">Tavily</SelectItem>
              <SelectItem value="brave">Brave Search</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {(needsBase || realProvider !== "") && (
          <div className="space-y-1">
            <Label className="text-xs">
              Base URL{needsBase ? "" : " (optional)"}
            </Label>
            <Input
              value={baseURL}
              onChange={(e) => setBaseURL(e.target.value)}
              placeholder={needsBase ? "https://searx.example.com" : "Override the default endpoint"}
            />
          </div>
        )}
      </div>

      {needsKey && (
        <div className="space-y-1">
          <Label className="text-xs">API key</Label>
          <Input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={config.has_web_search_key ? "•••••••• (stored — leave blank to keep)" : "Enter the provider API key"}
          />
        </div>
      )}

      <div className="flex justify-end">
        <Button size="sm" onClick={save} disabled={saving} className="gap-1.5">
          <Save className="h-3.5 w-3.5" /> Save
        </Button>
      </div>
    </div>
  )
}

// SandboxSection configures the agent execution sandbox: an isolated,
// network-less code-runner sidecar the AI uses to run data analysis and render
// charts. OFF by default and inert until an admin points it at a deployed
// runner. The runner token is write-only (never returned); leave it blank to
// keep the stored one. Budgets are daily caps (0 = unlimited); per-agent caps
// live on each agent. A self-test probes the runner before you enable it, and a
// kill switch disables it instantly without touching config.
function SandboxSection({
  config,
  onChanged,
}: {
  config: AIConfig
  onChanged: () => Promise<AIConfig | null> | Promise<void>
}) {
  const { toast } = useToast()
  const [enabled, setEnabled] = useState(config.sandbox_enabled)
  const [runnerURL, setRunnerURL] = useState(config.sandbox_runner_url || "")
  const [runnerToken, setRunnerToken] = useState("")
  const [imageDigest, setImageDigest] = useState(config.sandbox_image_digest || "")
  const [wsSeconds, setWsSeconds] = useState(String(config.sandbox_workspace_daily_seconds || 0))
  const [wsRuns, setWsRuns] = useState(String(config.sandbox_workspace_daily_runs || 0))
  const [chSeconds, setChSeconds] = useState(String(config.sandbox_channel_daily_seconds || 0))
  const [chRuns, setChRuns] = useState(String(config.sandbox_channel_daily_runs || 0))
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [killing, setKilling] = useState(false)

  const num = (v: string) => {
    const n = parseInt(v, 10)
    return Number.isFinite(n) && n > 0 ? n : 0
  }

  const save = async () => {
    if (enabled && !runnerURL.trim()) {
      toast({ title: "A runner URL is required to enable the sandbox", variant: "destructive" })
      return
    }
    setSaving(true)
    try {
      await setSandboxConfig({
        enabled,
        runner_url: runnerURL.trim(),
        runner_token: runnerToken.trim() || undefined,
        image_digest: imageDigest.trim(),
        workspace_daily_seconds: num(wsSeconds),
        workspace_daily_runs: num(wsRuns),
        channel_daily_seconds: num(chSeconds),
        channel_daily_runs: num(chRuns),
      })
      setRunnerToken("")
      toast({ title: "Sandbox updated" })
      await onChanged()
    } catch (e) {
      toast({
        title: "Error",
        description: e instanceof Error ? e.message : "Failed to update sandbox",
        variant: "destructive",
      })
    } finally {
      setSaving(false)
    }
  }

  const runTest = async () => {
    setTesting(true)
    try {
      const res = await testSandbox()
      toast({
        title: res.ok ? "Sandbox reachable" : "Sandbox test failed",
        description: res.message,
        variant: res.ok ? "default" : "destructive",
      })
    } catch (e) {
      toast({
        title: "Error",
        description: e instanceof Error ? e.message : "Failed to run sandbox self-test",
        variant: "destructive",
      })
    } finally {
      setTesting(false)
    }
  }

  const killNow = async () => {
    setKilling(true)
    try {
      await setSandboxEnabled(false)
      setEnabled(false)
      toast({ title: "Sandbox disabled" })
      await onChanged()
    } catch (e) {
      toast({
        title: "Error",
        description: e instanceof Error ? e.message : "Failed to disable sandbox",
        variant: "destructive",
      })
    } finally {
      setKilling(false)
    }
  }

  return (
    <div className="rounded-lg border border-border bg-card/50 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="pr-4">
          <h4 className="text-sm font-medium">Code analysis sandbox</h4>
          <p className="text-xs text-muted-foreground">
            Let agents run bounded data analysis and render charts inside an isolated, network-less code-runner
            sidecar (no credentials, ephemeral filesystem, hard CPU/memory/time limits). Off until you deploy a
            runner and point this at it. Every run is permission-checked as the agent owner and metered against the
            budgets below.
          </p>
        </div>
        <Switch checked={enabled} disabled={saving || !runnerURL.trim()} onCheckedChange={setEnabled} />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label className="text-xs">Runner URL</Label>
          <Input
            value={runnerURL}
            onChange={(e) => setRunnerURL(e.target.value)}
            placeholder="http://code-runner:8080/run"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Runner token</Label>
          <Input
            type="password"
            value={runnerToken}
            onChange={(e) => setRunnerToken(e.target.value)}
            placeholder={
              config.has_sandbox_runner_token ? "•••••••• (stored — leave blank to keep)" : "Shared auth token"
            }
          />
        </div>
      </div>

      <div className="space-y-1">
        <Label className="text-xs">Image digest (optional)</Label>
        <Input
          value={imageDigest}
          onChange={(e) => setImageDigest(e.target.value)}
          placeholder="sha256:… (pin the runner image for auditability)"
        />
      </div>

      <div className="pt-1">
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium text-muted-foreground">Daily budgets (0 = unlimited)</p>
          <p className="text-xs text-muted-foreground">
            Used today: {config.sandbox_used_today_runs} run{config.sandbox_used_today_runs === 1 ? "" : "s"},{" "}
            {config.sandbox_used_today_seconds}s
          </p>
        </div>
        <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="space-y-1">
            <Label className="text-xs">Workspace seconds</Label>
            <Input type="number" min={0} value={wsSeconds} onChange={(e) => setWsSeconds(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Workspace runs</Label>
            <Input type="number" min={0} value={wsRuns} onChange={(e) => setWsRuns(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Channel seconds</Label>
            <Input type="number" min={0} value={chSeconds} onChange={(e) => setChSeconds(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Channel runs</Label>
            <Input type="number" min={0} value={chRuns} onChange={(e) => setChRuns(e.target.value)} />
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between pt-1">
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={runTest} disabled={testing || !config.sandbox_runner_url}>
            {testing ? "Testing…" : "Run sample analysis"}
          </Button>
          {config.sandbox_enabled && (
            <Button size="sm" variant="destructive" onClick={killNow} disabled={killing}>
              {killing ? "Disabling…" : "Disable now"}
            </Button>
          )}
        </div>
        <Button size="sm" onClick={save} disabled={saving} className="gap-1.5">
          <Save className="h-3.5 w-3.5" /> Save
        </Button>
      </div>
    </div>
  )
}

// CodePRSection configures the agent code-PR feature: an @mentionable / task-
// assignable coding teammate that, given a task on a linked repo, produces a
// verified, reviewable pull request inside an isolated, git-host-egress-only
// code-runner sidecar. OFF by default and inert until an admin points it at a
// deployed runner. The runner token is write-only (never returned); leave blank
// to keep the stored one. Human-review-only — the agent never merges. Budgets
// are daily caps in MINUTES + runs (0 = unlimited); per-agent caps live on each
// agent. A kill switch disables it instantly without touching config.
function CodePRSection({
  config,
  onChanged,
  modelsByProvider,
  modelsLoading,
  onEnsureModels,
}: {
  config: AIConfig
  onChanged: () => Promise<AIConfig | null> | Promise<void>
  modelsByProvider: Record<string, ModelView[]>
  modelsLoading: Record<string, boolean>
  onEnsureModels: (providerId: string, refresh?: boolean) => Promise<void>
}) {
  const { toast } = useToast()
  const [enabled, setEnabled] = useState(config.code_pr_enabled)
  const [runnerURL, setRunnerURL] = useState(config.code_pr_runner_url || "")
  const [runnerToken, setRunnerToken] = useState("")
  const [egress, setEgress] = useState((config.code_pr_egress_allowlist || []).join(", "))
  const [policy, setPolicy] = useState(config.code_pr_out_of_scope_policy || "flag_open")
  const [draftOnRed, setDraftOnRed] = useState(config.code_pr_draft_on_red)
  // Optional dedicated code-run model (so coding isn't starved by the chat cap).
  const enabledProviders = config.providers.filter((p) => p.enabled)
  const [codeRunProvider, setCodeRunProvider] = useState(config.code_pr_chat_provider_id || "")
  const [codeRunModel, setCodeRunModel] = useState(config.code_pr_chat_model || "")
  const [savingCodeRunModel, setSavingCodeRunModel] = useState(false)
  useEffect(() => {
    if (codeRunProvider) onEnsureModels(codeRunProvider)
  }, [codeRunProvider, onEnsureModels])
  const saveCodeRunModel = async () => {
    setSavingCodeRunModel(true)
    try {
      await setCodePRModel(codeRunProvider || "", codeRunModel || "")
      toast({
        title: codeRunProvider && codeRunModel ? "Code-run model updated" : "Code-run model cleared",
        description:
          codeRunProvider && codeRunModel
            ? `${codeRunModel} will run coding tasks.`
            : "Coding tasks will use the chat model.",
      })
      await onChanged()
    } catch (e) {
      toast({
        title: "Error",
        description: e instanceof Error ? e.message : "Failed to update the code-run model",
        variant: "destructive",
      })
    } finally {
      setSavingCodeRunModel(false)
    }
  }
  const clearCodeRunModel = async () => {
    setCodeRunProvider("")
    setCodeRunModel("")
    setSavingCodeRunModel(true)
    try {
      await setCodePRModel("", "")
      toast({ title: "Code-run model cleared", description: "Coding tasks will use the chat model." })
      await onChanged()
    } catch (e) {
      toast({
        title: "Error",
        description: e instanceof Error ? e.message : "Failed to clear the code-run model",
        variant: "destructive",
      })
    } finally {
      setSavingCodeRunModel(false)
    }
  }
  const [allowUnlinked, setAllowUnlinked] = useState(config.code_pr_allow_unlinked)
  const [wsMinutes, setWsMinutes] = useState(String(config.code_pr_workspace_daily_minutes || 0))
  const [wsRuns, setWsRuns] = useState(String(config.code_pr_workspace_daily_runs || 0))
  const [chMinutes, setChMinutes] = useState(String(config.code_pr_channel_daily_minutes || 0))
  const [chRuns, setChRuns] = useState(String(config.code_pr_channel_daily_runs || 0))
  const [saving, setSaving] = useState(false)
  const [killing, setKilling] = useState(false)
  const [testing, setTesting] = useState(false)

  const testRunner = async () => {
    setTesting(true)
    try {
      const res = await testCodePRRunner()
      toast({
        title: res.ok ? "Coding runner reachable" : "Runner check failed",
        description: `${res.message}${res.latency_ms ? ` (${res.latency_ms}ms)` : ""}`,
        variant: res.ok ? "default" : "destructive",
      })
    } catch (e) {
      toast({
        title: "Error",
        description: e instanceof Error ? e.message : "Failed to test the coding runner",
        variant: "destructive",
      })
    } finally {
      setTesting(false)
    }
  }

  const num = (v: string) => {
    const n = parseInt(v, 10)
    return Number.isFinite(n) && n > 0 ? n : 0
  }
  // Split on comma/whitespace, drop empties — tolerant of how an admin types it.
  const parseHosts = (v: string) =>
    v
      .split(/[\s,]+/)
      .map((h) => h.trim())
      .filter(Boolean)

  const save = async () => {
    if (enabled && !runnerURL.trim()) {
      toast({ title: "A runner URL is required to enable code PRs", variant: "destructive" })
      return
    }
    setSaving(true)
    try {
      await setCodePRConfig({
        enabled,
        runner_url: runnerURL.trim(),
        runner_token: runnerToken.trim() || undefined,
        egress_allowlist: parseHosts(egress),
        out_of_scope_policy: policy,
        draft_on_red: draftOnRed,
        allow_unlinked: allowUnlinked,
        workspace_daily_minutes: num(wsMinutes),
        workspace_daily_runs: num(wsRuns),
        channel_daily_minutes: num(chMinutes),
        channel_daily_runs: num(chRuns),
      })
      setRunnerToken("")
      toast({ title: "Code PR settings updated" })
      await onChanged()
    } catch (e) {
      toast({
        title: "Error",
        description: e instanceof Error ? e.message : "Failed to update code PR settings",
        variant: "destructive",
      })
    } finally {
      setSaving(false)
    }
  }

  const killNow = async () => {
    setKilling(true)
    try {
      await setCodePREnabled(false)
      setEnabled(false)
      toast({ title: "Code PRs disabled" })
      await onChanged()
    } catch (e) {
      toast({
        title: "Error",
        description: e instanceof Error ? e.message : "Failed to disable code PRs",
        variant: "destructive",
      })
    } finally {
      setKilling(false)
    }
  }

  return (
    <div className="rounded-lg border border-border bg-card/50 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="pr-4">
          <h4 className="text-sm font-medium">Code pull requests</h4>
          <p className="text-xs text-muted-foreground">
            Let an @mentioned (or task-assigned) agent make a change to a linked repository and open a verified,
            reviewable pull request — inside an isolated code-runner sidecar whose only network access is your git
            host. The agent never merges; every PR goes through your normal review + CI. Off until you deploy a
            coding runner and point this at it. Metered against the budgets below.
          </p>
        </div>
        <Switch checked={enabled} disabled={saving || !runnerURL.trim()} onCheckedChange={setEnabled} />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label className="text-xs">Runner URL</Label>
          <Input
            value={runnerURL}
            onChange={(e) => setRunnerURL(e.target.value)}
            placeholder="http://code-runner:8080"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Runner token</Label>
          <Input
            type="password"
            value={runnerToken}
            onChange={(e) => setRunnerToken(e.target.value)}
            placeholder={
              config.has_code_pr_runner_token ? "•••••••• (stored — leave blank to keep)" : "Shared auth token"
            }
          />
        </div>
      </div>

      <div className="space-y-1">
        <Label className="text-xs">Egress allowlist (hosts the runner may reach)</Label>
        <Input
          value={egress}
          onChange={(e) => setEgress(e.target.value)}
          placeholder="github.com, api.github.com"
        />
        <p className="text-[11px] text-muted-foreground">
          Comma-separated. The runner is default-deny; only these hosts (your git host, plus any package registry
          your builds need) are reachable.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label className="text-xs">If a change exceeds the task&apos;s scope</Label>
          <Select value={policy} onValueChange={setPolicy}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="flag_open">Open the PR, flagged with the concern</SelectItem>
              <SelectItem value="pause">Pause and ask a human</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-end justify-between gap-3 pb-1">
          <div className="pr-2">
            <Label className="text-xs">Draft PR when it can&apos;t verify</Label>
            <p className="text-[11px] text-muted-foreground">
              Open a clearly-labeled draft instead of nothing when the build/tests can&apos;t be made to pass.
            </p>
          </div>
          <Switch checked={draftOnRed} onCheckedChange={setDraftOnRed} />
        </div>
      </div>

      <div className="flex items-start justify-between gap-3 rounded-md border border-border bg-background/40 p-3">
        <div className="pr-2">
          <Label className="text-xs">Allow any repository the agent can access</Label>
          <p className="text-[11px] text-muted-foreground">
            When on, the agent can open a PR on any repo the connected GitHub account can reach (access is verified
            per run), not only repos linked to a project. Leave off to restrict it to linked repositories — the safer
            default when the connected account can see repos beyond this workspace.
          </p>
        </div>
        <Switch checked={allowUnlinked} onCheckedChange={setAllowUnlinked} />
      </div>

      <div className="space-y-2 rounded-md border border-border bg-background/40 p-3">
        <ModelSelectorRow
          title="Code-run model (optional)"
          hint="The model the coding runner uses to write and fix code. Leave unset to use your chat model. Set a separate, higher-capacity model here so coding tasks aren't blocked when the chat model hits its provider's rate/daily limit."
          providers={enabledProviders}
          providerId={codeRunProvider}
          model={codeRunModel}
          models={modelsByProvider[codeRunProvider] ?? []}
          loading={!!modelsLoading[codeRunProvider]}
          onProviderChange={(id) => {
            setCodeRunProvider(id)
            setCodeRunModel("")
          }}
          onModelChange={setCodeRunModel}
          onRefreshModels={() => onEnsureModels(codeRunProvider, true)}
          onSave={saveCodeRunModel}
          saving={savingCodeRunModel}
          extra={
            config.code_pr_chat_model ? (
              <Button variant="outline" className="h-9" onClick={clearCodeRunModel} disabled={savingCodeRunModel}>
                Use chat model
              </Button>
            ) : undefined
          }
        />
        <p className="text-xs text-muted-foreground">
          {config.code_pr_chat_model ? (
            <>
              Coding runs use{" "}
              <span className="font-medium text-foreground">{config.code_pr_chat_model}</span>.
            </>
          ) : (
            <>No dedicated code-run model set. Coding runs use the chat model.</>
          )}
        </p>
      </div>

      <div className="pt-1">
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium text-muted-foreground">Daily budgets (0 = unlimited)</p>
          <p className="text-xs text-muted-foreground">
            Used today: {config.code_pr_used_today_runs} run{config.code_pr_used_today_runs === 1 ? "" : "s"},{" "}
            {config.code_pr_used_today_minutes} min
          </p>
        </div>
        <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="space-y-1">
            <Label className="text-xs">Workspace minutes</Label>
            <Input type="number" min={0} value={wsMinutes} onChange={(e) => setWsMinutes(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Workspace runs</Label>
            <Input type="number" min={0} value={wsRuns} onChange={(e) => setWsRuns(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Channel minutes</Label>
            <Input type="number" min={0} value={chMinutes} onChange={(e) => setChMinutes(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Channel runs</Label>
            <Input type="number" min={0} value={chRuns} onChange={(e) => setChRuns(e.target.value)} />
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between pt-1">
        <div className="flex items-center gap-2">
          {config.code_pr_enabled && (
            <Button size="sm" variant="destructive" onClick={killNow} disabled={killing}>
              {killing ? "Disabling…" : "Disable now"}
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            onClick={testRunner}
            disabled={testing || !runnerURL.trim()}
            className="gap-1.5"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${testing ? "animate-spin" : ""}`} />
            {testing ? "Testing…" : "Test runner"}
          </Button>
        </div>
        <Button size="sm" onClick={save} disabled={saving} className="gap-1.5">
          <Save className="h-3.5 w-3.5" /> Save
        </Button>
      </div>
    </div>
  )
}

// CodePRReliabilityCard is the HONEST scorecard for the coding agent: how often
// it opens a PR, how often those verify + stay in scope, how many are drafts,
// and — ground truth — how often they merge. Graded with a minimum-sample guard,
// so a handful of runs reads as "Unproven" rather than a misleading 100%. This
// is how OneCamp measures "are we good?" without over-claiming: numbers a static
// cloud agent can't produce because it never sees your merge decisions.
function CodePRReliabilityCard() {
  const [data, setData] = useState<CodePRScorecardData | null>(null)
  const [runs, setRuns] = useState<CodePRRunView[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  const load = useCallback(async () => {
    setLoading(true)
    setError("")
    try {
      const [sc, rs] = await Promise.all([getCodePRScorecard(), getCodePRRuns(10)])
      setData(sc)
      setRuns(rs)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load the reliability scorecard")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const pct = (r: number) => `${Math.round((r || 0) * 100)}%`

  const gradeBadge = (grade: string) => {
    switch (grade) {
      case "healthy":
        return { label: "Healthy", cls: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" }
      case "needs_attention":
        return { label: "Needs attention", cls: "bg-amber-500/15 text-amber-600 dark:text-amber-400" }
      default:
        return { label: "Unproven", cls: "bg-muted text-muted-foreground" }
    }
  }

  return (
    <div className="rounded-lg border border-border bg-card/50 p-4 space-y-3">
      <div className="flex items-start justify-between">
        <div className="pr-4">
          <h4 className="text-sm font-medium">Coding agent reliability</h4>
          <p className="text-xs text-muted-foreground">
            How the coding agent actually performs — open, verify, in-scope, and draft rates, plus the ground-truth
            merge rate from your review decisions. Graded conservatively: it reads &quot;unproven&quot; until there
            are enough runs to judge, so the number never over-claims.
          </p>
        </div>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => void load()}
          disabled={loading}
          className="shrink-0 gap-1.5"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {error ? (
        <p className="text-xs text-destructive">{error}</p>
      ) : loading && !data ? (
        <p className="text-xs text-muted-foreground">Loading…</p>
      ) : !data || data.total === 0 ? (
        <p className="text-xs text-muted-foreground">
          No coding runs yet. Once the agent opens pull requests, this scorecard fills in and grades itself.
        </p>
      ) : (
        <>
          <div className="flex items-center gap-2">
            {(() => {
              const g = gradeBadge(data.grade)
              return <Badge className={`${g.cls} border-transparent`}>{g.label}</Badge>
            })()}
            <span className="text-xs text-muted-foreground">
              {data.total} run{data.total === 1 ? "" : "s"}
              {data.total < data.min_sample ? ` · needs ${data.min_sample} to grade` : ""}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <Metric
              label="Merge rate"
              value={data.outcome_known > 0 ? pct(data.merge_rate) : "—"}
              sub={`${data.merged + data.merged_with_edits}/${data.outcome_known} known`}
            />
            <Metric label="Opened a PR" value={pct(data.open_rate)} sub={`${data.opened}/${data.total}`} />
            <Metric
              label="Verified"
              value={data.opened > 0 ? pct(data.verify_rate) : "—"}
              sub={`${data.verified}/${data.opened}`}
            />
            <Metric
              label="Had tests"
              value={data.opened > 0 ? pct(data.with_tests / data.opened) : "—"}
              sub={`${data.with_tests}/${data.opened}`}
            />
            <Metric
              label="In scope"
              value={data.opened > 0 ? pct(data.in_scope_rate) : "—"}
              sub={`${data.in_scope}/${data.opened}`}
            />
            <Metric
              label="Drafts"
              value={data.opened > 0 ? pct(data.draft_rate) : "—"}
              sub={`${data.draft}/${data.opened}`}
            />
            <Metric
              label="Closed unmerged"
              value={String(data.closed)}
              sub={data.outcome_known > 0 ? `of ${data.outcome_known} decided` : "none decided"}
            />
          </div>

          {runs.length > 0 && (
            <div className="space-y-1 pt-1">
              <p className="text-[11px] font-medium text-muted-foreground">Recent runs</p>
              <div className="divide-y divide-border/60 rounded-md border border-border/60">
                {runs.map((run) => (
                  <CodePRRunRow key={run.id} run={run} />
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

// CodePRRunRow renders one coding run as a compact, notion-style row: repo, a
// status/outcome badge, the diff size, when, and a link to the PR when one was
// opened.
function CodePRRunRow({ run }: { run: CodePRRunView }) {
  const badge = (() => {
    if (run.outcome === "merged" || run.outcome === "merged_with_edits") {
      return { label: "Merged", cls: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" }
    }
    if (run.outcome === "closed_unmerged") {
      return { label: "Closed", cls: "bg-red-500/15 text-red-600 dark:text-red-400" }
    }
    switch (run.status) {
      case "ok":
        return {
          label: run.draft ? "Draft PR" : "PR opened",
          cls: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
        }
      case "blocked":
        return { label: "Needs input", cls: "bg-amber-500/15 text-amber-600 dark:text-amber-400" }
      case "no_green":
        return { label: "Unverified", cls: "bg-amber-500/15 text-amber-600 dark:text-amber-400" }
      default:
        return { label: run.status || "—", cls: "bg-muted text-muted-foreground" }
    }
  })()
  const when = (() => {
    const d = new Date(run.created_at)
    return isNaN(d.getTime()) ? "" : d.toLocaleString()
  })()
  return (
    <div className="flex items-center justify-between gap-3 px-3 py-2 text-xs">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <Badge className={`${badge.cls} border-transparent`}>{badge.label}</Badge>
          <span className="truncate font-medium">{run.repo || "—"}</span>
        </div>
        {run.message ? (
          <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{run.message}</p>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-3 text-[11px] text-muted-foreground">
        {run.all_passed ? (
          <span className="text-emerald-600 dark:text-emerald-400" title="Build & tests passed in the sandbox">
            ✓ verified
          </span>
        ) : null}
        {run.diff_files > 0 ? <span className="tabular-nums" title="Files changed">{run.diff_files}f</span> : null}
        {run.pr_url ? (
          <a
            href={run.pr_url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline"
          >
            PR
          </a>
        ) : null}
        <span className="tabular-nums">{when}</span>
      </div>
    </div>
  )
}

// Metric is a compact, notion-style stat tile: a big value, a muted label, and
// an optional denominator, so the scorecard reads at a glance.
function Metric({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-md border border-border/60 bg-background/40 px-3 py-2">
      <div className="text-lg font-semibold tabular-nums">{value}</div>
      <div className="text-[11px] font-medium text-muted-foreground">{label}</div>
      {sub ? <div className="text-[10px] text-muted-foreground/70 tabular-nums">{sub}</div> : null}
    </div>
  )
}
