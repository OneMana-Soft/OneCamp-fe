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

import React, { useCallback, useEffect, useId, useRef, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { SaveBar, SettingsList, SwitchRow } from "@/components/ui/settingsSection"
import { Skeleton } from "@/components/ui/skeleton"
import { SkeletonRows } from "@/components/ui/skeletonRows"
import { ErrorState } from "@/components/ui/error-state"
import { Progress } from "@/components/ui/progress"
import { useToast } from "@/hooks/use-toast"
import { useConfirm } from "@/hooks/useConfirm"
import { RefreshCw, Save, Plus, Lightbulb, Check } from "@/lib/icons"
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
  setMeetingNotesDocEnabled,
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
import { apiErrorCode, apiErrorMessage, apiErrorStatus } from "@/lib/utils/apiError"
import { shortDateTime } from "@/lib/utils/date/shortDate"
import { RunnerTestStatus, type RunnerProbe } from "@/components/admin/ai/RunnerTestStatus"
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
    } catch (e) {
      toast({ title: "Couldn't load the AI settings", description: apiErrorMessage(e, "Try again in a moment."), variant: "destructive" })
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
      } catch (e: unknown) {
        // A TITLE THAT MATCHES THE CAUSE.
        //
        // "Could not list models — provider unreachable" was shown for every failure, including one
        // where nothing was contacted at all: a stored API key the server can no longer decrypt.
        // That sent the admin to check a provider that was fine. The server labels this condition
        // (409 with code provider_key_unreadable) precisely so the UI can say what it is.
        //
        // Matched on the code, never on the message text, so a copy edit on the server cannot
        // silently switch this back to the generic title. The message itself is already written for
        // an admin and names the provider, so it is shown as-is.
        const keyUnreadable = apiErrorCode(e) === "provider_key_unreadable"
        toast({
          title: keyUnreadable ? "This provider's API key needs re-entering" : "Couldn't list the models",
          description: apiErrorMessage(e, "The provider didn't answer. Check its address and key."),
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
      // Started together: none of these needs another's answer, and awaiting
      // them one after another held the whole tab on a loading line for the
      // sum of five round trips.
      const [cfg] = await Promise.all([
        refreshConfig(),
        refreshStats(),
        pollReindex(),
        pollBackfill(),
        getAIUsage().then(setUsage, () => {
          // Non-fatal; the usage row simply won't render.
        }),
      ])
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
      toast({ title: enabled ? "Workspace AI is on" : "Workspace AI is off" })
    } catch (e) {
      toast({ title: `Couldn't turn workspace AI ${enabled ? "on" : "off"}`, description: apiErrorMessage(e, "Try again in a moment."), variant: "destructive" })
    } finally {
      setSaving(false)
    }
  }

  const handleToggleRecap = async (enabled: boolean) => {
    setSaving(true)
    try {
      await setMeetingRecapEnabled(enabled)
      setConfig((c) => (c ? { ...c, meeting_recap_enabled: enabled } : c))
      toast({ title: enabled ? "Meeting recaps are on" : "Meeting recaps are off" })
    } catch (e) {
      toast({ title: `Couldn't turn meeting recaps ${enabled ? "on" : "off"}`, description: apiErrorMessage(e, "Try again in a moment."), variant: "destructive" })
    } finally {
      setSaving(false)
    }
  }

  const handleToggleNotesDoc = async (enabled: boolean) => {
    setSaving(true)
    try {
      await setMeetingNotesDocEnabled(enabled)
      setConfig((c) => (c ? { ...c, meeting_notes_doc_enabled: enabled } : c))
      toast({ title: enabled ? "The meeting notes document is on" : "The meeting notes document is off" })
    } catch (e) {
      toast({ title: `Couldn't turn the meeting notes document ${enabled ? "on" : "off"}`, description: apiErrorMessage(e, "Try again in a moment."), variant: "destructive" })
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
    } catch (e) {
      toast({ title: "Couldn't save the recap instructions", description: apiErrorMessage(e, "Try again in a moment."), variant: "destructive" })
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
        title: enabled ? "Reasoning mode is on" : "Reasoning mode is off",
        description: enabled
          ? "Reasoning models will think before answering (higher quality, slower)."
          : "Faster responses; reasoning models skip their chain-of-thought.",
      })
    } catch (e) {
      toast({ title: `Couldn't turn reasoning mode ${enabled ? "on" : "off"}`, description: apiErrorMessage(e, "Try again in a moment."), variant: "destructive" })
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
        title: enabled ? "Local-only AI is on" : "Local-only AI is off",
        description: enabled
          ? "No workspace content will leave this server. Cloud providers are blocked at the network layer."
          : "Cloud AI providers (OpenAI, Anthropic, …) can be used again.",
      })
    } catch (e: unknown) {
      toast({
        title: `Couldn't turn local-only AI ${enabled ? "on" : "off"}`,
        description: apiErrorMessage(e, "Try again in a moment."),
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
        title: enabled ? "Redacting personal details is on" : "Redacting personal details is off",
        description: enabled
          ? "Detected PII is scrubbed from prompts before they reach any cloud model."
          : "Prompts are sent to cloud models without PII redaction.",
      })
    } catch (e: unknown) {
      toast({
        title: `Couldn't turn redacting personal details ${enabled ? "on" : "off"}`,
        description: apiErrorMessage(e, "Try again in a moment."),
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
      toast({ title: enabled ? "Workspace memory is on" : "Workspace memory is off" })
    } catch (e) {
      toast({ title: `Couldn't turn workspace memory ${enabled ? "on" : "off"}`, description: apiErrorMessage(e, "Try again in a moment."), variant: "destructive" })
    } finally {
      setSaving(false)
    }
  }

  const handleToggleTeamReport = async (enabled: boolean) => {
    setSaving(true)
    try {
      await setTeamReportEnabled(enabled)
      setConfig((c) => (c ? { ...c, team_report_enabled: enabled } : c))
      toast({ title: enabled ? "Weekly team reports are on" : "Weekly team reports are off" })
    } catch (e) {
      toast({ title: `Couldn't turn weekly team reports ${enabled ? "on" : "off"}`, description: apiErrorMessage(e, "Try again in a moment."), variant: "destructive" })
    } finally {
      setSaving(false)
    }
  }

  // Admin verify: run the weekly team report now, bypassing the Monday/hour
  // schedule + idempotency lock. It still only posts into channels that opted
  // in, so zero reports is the normal result right after enabling this and is
  // reported as such rather than looking like a failure.
  const [runningReport, setRunningReport] = useState(false)
  const handleRunTeamReport = async () => {
    setRunningReport(true)
    try {
      const res = await runTeamReportNow()
      toast({
        title: "The team report ran",
        description:
          res.msg ||
          (res.posted === 0
            ? "No channels have turned the weekly report on yet. A channel moderator enables it in the channel's settings."
            : `Posted ${res.posted} ${res.posted === 1 ? "report" : "reports"}.`),
      })
    } catch (e: unknown) {
      toast({ title: "Couldn't run the team report", description: apiErrorMessage(e, "Try again in a moment."), variant: "destructive" })
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
    } catch (e: unknown) {
      toast({ title: "Couldn't send the test digest", description: apiErrorMessage(e, "Check the email settings, then try again."), variant: "destructive" })
    } finally {
      setSendingDigest(false)
    }
  }

  const handleToggleNudges = async (enabled: boolean) => {
    setSaving(true)
    try {
      await setNudgesEnabled(enabled)
      setConfig((c) => (c ? { ...c, nudges_enabled: enabled } : c))
      toast({ title: enabled ? "Proactive nudges are on" : "Proactive nudges are off" })
    } catch (e) {
      toast({ title: `Couldn't turn proactive nudges ${enabled ? "on" : "off"}`, description: apiErrorMessage(e, "Try again in a moment."), variant: "destructive" })
    } finally {
      setSaving(false)
    }
  }

  const handleToggleCoworker = async (enabled: boolean) => {
    setSaving(true)
    try {
      await setCoworkerEnabled(enabled)
      setConfig((c) => (c ? { ...c, coworker_enabled: enabled } : c))
      toast({ title: enabled ? "The AI coworker is on" : "The AI coworker is off" })
    } catch (e) {
      toast({ title: `Couldn't turn the AI coworker ${enabled ? "on" : "off"}`, description: apiErrorMessage(e, "Try again in a moment."), variant: "destructive" })
    } finally {
      setSaving(false)
    }
  }

  const handleToggleIssueTriage = async (enabled: boolean) => {
    setSaving(true)
    try {
      await setIssueTriageEnabled(enabled)
      setConfig((c) => (c ? { ...c, issue_triage_enabled: enabled } : c))
      toast({ title: enabled ? "GitHub auto-review is on" : "GitHub auto-review is off" })
    } catch (e) {
      toast({ title: `Couldn't turn GitHub auto-review ${enabled ? "on" : "off"}`, description: apiErrorMessage(e, "Try again in a moment."), variant: "destructive" })
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
    } catch (e: unknown) {
      const msg = apiErrorMessage(e, "Try again in a moment.")
      toast({ title: "Couldn't start the memory rebuild", description: msg, variant: "destructive" })
    }
  }

  // The shape of what is coming: the heading, then hairline groups of rows,
  // so the tab doesn't jump from one line of text to 2,000px of settings.
  if (loading) {
    return (
      <div role="status" aria-label="Loading the AI settings" className="space-y-6">
        <div className="space-y-2">
          <Skeleton className="h-5 w-24" />
          <Skeleton className="h-3.5 w-full max-w-md" />
        </div>
        {[3, 2, 3].map((rows, i) => (
          <div key={i} className="space-y-3">
            <Skeleton className="h-4 w-32" />
            <div className="rounded-lg border border-border px-4 py-1">
              <SkeletonRows rows={rows} avatar={false} />
            </div>
          </div>
        ))}
      </div>
    )
  }

  if (!config) {
    return <ErrorState subject="the AI settings" onRetry={() => void refreshConfig()} />
  }

  return (
    <Card className="w-full border-none shadow-none bg-transparent">
      <CardHeader className="px-0 pt-0 pb-6">
        <div className="flex items-center gap-2 mb-1">
          <CardTitle className="text-base font-semibold">Models</CardTitle>
          {/* States, so a dot and a word rather than badges; and words a
              person uses, not "circuit: half_open". */}
          <span className="ml-1 inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${config.enabled ? "bg-success" : "bg-faint-foreground"}`} />
            {config.enabled ? "On" : "Off"}
          </span>
          {config.circuit_state && config.circuit_state !== "closed" && (
            <span className="inline-flex items-center gap-1.5 text-xs text-danger-ink">
              <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-destructive" />
              {config.circuit_state === "half_open" ? "Trying the provider again after errors" : "Paused after the provider kept failing"}
            </span>
          )}
        </div>
        <CardDescription className="text-sm text-muted-foreground">
          Run local models with Ollama, bring your own OpenAI / Anthropic key, or connect any
          OpenAI-compatible endpoint. Everything stays on your server.
        </CardDescription>
      </CardHeader>

      {/* NO INTERNAL SCROLLER, and no h-full on the Card above it either.
          
          app/app/admin/page.tsx owns the single scroll container for the whole admin page; the
          comment above that region explains the reasoning. This CardContent was
          `flex-1 overflow-y-auto pr-2 custom-scrollbar pb-10 min-h-0`, which combined with h-full on
          the Card made this one card fill the entire visible region and scroll within itself. The
          three sibling cards on this tab were then stranded below it, reachable only through the app
          shell's outer scrollbar — two scrollbars, different meanings, and the page header scrolling
          away when you used the outer one.
          
          pr-2 and pb-10 went with it: both existed to keep content clear of a scrollbar and give the
          scrollport some bottom slack, and there is no scrollport here now. The region's py-6
          provides the bottom breathing room. */}
      <CardContent className="px-0 space-y-8">
        {/* Global config — grouped so an admin can scan: behavior, cost
            governance, and model tuning are separate clusters. */}
        <section className="space-y-6">
          {/* General: one hairline list of switches, each saved the moment
              it is touched. Each used to be a bordered box of its own, a
              stack of five boxes inside the card. */}
          <div className="space-y-3">
            <div className="space-y-1">
              <h3 className="text-sm font-semibold text-foreground">General</h3>
              <p className="text-xs text-muted-foreground">Changes save as you make them.</p>
            </div>
            <SettingsList>
              <SwitchRow
                label="Workspace AI"
                description="Turn the AI assistant, and its answers from your workspace, on or off for everyone."
                checked={config.enabled}
                disabled={saving}
                onChange={handleToggleEnabled}
              />
              <SwitchRow
                label="Reasoning mode"
                description="Let reasoning models (gemma4, DeepSeek-R1, Qwen3 and others) think before answering. Better answers on hard questions, but noticeably slower, especially on servers without a GPU. Other models ignore this."
                checked={config.reasoning_enabled}
                disabled={saving || !config.enabled}
                onChange={handleToggleReasoning}
              />
              <SwitchRow
                label={
                  <span className="inline-flex flex-wrap items-center gap-2">
                    Local-only AI
                    {config.local_only_pinned_by_env && (
                      <span className="text-xs font-normal text-muted-foreground">Set by whoever runs this server</span>
                    )}
                  </span>
                }
                description={
                  <>
                    No workspace content leaves this server: every cloud AI provider (OpenAI, Anthropic, hosted
                    endpoints) is blocked at the network layer, so prompts and documents only ever reach local models.
                    Turn it on only once your chat, vision and embedding models all run locally.
                    {config.local_only_pinned_by_env &&
                      " It is set by an environment variable on this server, so it can't be turned off here."}
                  </>
                }
                checked={config.local_only_mode}
                disabled={saving || config.local_only_pinned_by_env}
                onChange={handleToggleLocalOnly}
              />
              <SwitchRow
                label="Redact personal details before cloud models"
                description="When a prompt goes to a cloud model, emails, phone numbers, card numbers, government IDs, IBANs and your own patterns are removed first. Local models get the content as it is, since nothing leaves the server. No effect while Local-only AI is on."
                checked={config.pii_redaction_enabled}
                disabled={saving || config.local_only_mode}
                onChange={handleTogglePIIRedaction}
              />
              {config.pii_redaction_enabled && !config.local_only_mode && (
                <div className="px-4 py-3">
                  <PIIPatternsEditor
                    initial={config.pii_custom_patterns}
                    onSave={async (patterns) => {
                      await setAIPIIPatterns(patterns)
                      setConfig((c) => (c ? { ...c, pii_custom_patterns: patterns } : c))
                      toast({ title: "Your patterns are saved" })
                    }}
                  />
                </div>
              )}
            </SettingsList>
          </div>

          {/* Usage & limits */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-foreground">Usage and limits</h3>
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
            <h3 className="text-sm font-semibold text-foreground">
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

        {/* Ambient agents: the switches that save at once, in one hairline
            list, each with what it needs under it; then the three services
            whose settings wait for their own save bar. They used to be one
            stack of bordered boxes, the instant switches and the staged ones
            looking alike. */}
        <section className="space-y-4">
          <div className="space-y-1">
            <h3 className="text-sm font-semibold">Ambient agents</h3>
            <p className="text-xs text-muted-foreground">
              Automations that run in the background on the active models. The switches save as you make them.
            </p>
          </div>
          <SettingsList>
            <SwitchRow
              label="Meeting recaps"
              description="When a call ends, post a recap (summary, decisions, action items) from its transcript where the call happened. The call doesn't need to be recorded. Very short calls are skipped, and so are calls with transcription off. Any language in; the recap is in English."
              checked={config.meeting_recap_enabled}
              disabled={saving || !config.enabled}
              onChange={handleToggleRecap}
            />
            {config.meeting_recap_enabled && (
              <SwitchRow
                label="Also write a notes document"
                description="Put the recap and the full transcript in a document the people on the call can edit, as well as posting it. It is private to whoever was in the call, so share it if anyone else needs it."
                checked={config.meeting_notes_doc_enabled}
                disabled={saving || !config.enabled}
                onChange={handleToggleNotesDoc}
              />
            )}
            {config.meeting_recap_enabled && (
              <div className="px-4 py-3">
                <RecapInstructionsField
                  initial={config.meeting_recap_instructions || ""}
                  disabled={saving || !config.enabled}
                  onSave={handleSaveRecapInstructions}
                />
              </div>
            )}
            <SwitchRow
              label="Workspace memory"
              description="Keep pulling lasting decisions, commitments and open questions out of meetings, channels, direct messages and project threads into a searchable memory. It answers questions like “what did we decide, who owns it, what's still open”."
              checked={config.memory_layer_enabled}
              disabled={saving || !config.enabled}
              onChange={handleToggleMemory}
            />
            {/* Rebuild memory: backfill over historical content. Only useful
                once the layer is enabled (live worker handles new content). */}
            {config.memory_layer_enabled && (
              <div className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0 space-y-1">
                  <p className="text-sm font-medium">Rebuild from history</p>
                  <p className="text-xs text-muted-foreground">
                    {backfill?.state === "running"
                      ? `Reading… ${backfill.scopes_done ?? 0} of ${backfill.scopes_total ?? 0} places, ${backfill.items_extracted ?? 0} items so far`
                      : backfill?.state === "completed"
                        ? `Last rebuild: ${backfill.items_extracted ?? 0} items from ${backfill.scopes_done ?? 0} places${backfill.error ? ". It stopped part way: run it again to continue." : ""}`
                        : backfill?.state === "failed"
                          ? `The last rebuild stopped: ${backfill.error || "no reason was given"}. Try it again.`
                          : "Read existing channels, direct messages and projects into memory, once."}
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 shrink-0"
                  disabled={backfill?.state === "running" || !config.enabled}
                  onClick={handleRebuildMemory}
                >
                  <Lightbulb className="mr-1.5 h-3.5 w-3.5" />
                  {backfill?.state === "running" ? "Rebuilding…" : "Rebuild"}
                </Button>
              </div>
            )}
            <SwitchRow
              label="Weekly team report"
              description="Allow a weekly report in a channel: open decisions, commitments with their owners, and unanswered questions, from workspace memory. A channel stays quiet until its moderator turns the report on in its settings. Needs workspace memory."
              checked={config.team_report_enabled}
              disabled={saving || !config.enabled || !config.memory_layer_enabled}
              onChange={handleToggleTeamReport}
            />
            {/* Verify: the report POSTS INTO CHANNELS on a weekly schedule; the
                email path is the opt-in per-user digest. These buttons let an
                admin confirm both now instead of waiting for the schedule. */}
            <div className="space-y-2 px-4 py-3">
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8"
                  disabled={runningReport || !config.enabled || !config.memory_layer_enabled}
                  onClick={handleRunTeamReport}
                >
                  <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${runningReport ? "animate-spin" : ""}`} />
                  {runningReport ? "Running…" : "Post this week's reports now"}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8"
                  disabled={sendingDigest || !config.enabled || !config.memory_layer_enabled}
                  onClick={handleSendTestDigest}
                >
                  <Lightbulb className="mr-1.5 h-3.5 w-3.5" />
                  {sendingDigest ? "Sending…" : "Email me a test digest"}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                The report posts into channels, not email. The only email is each member&apos;s own open-items digest,
                which they choose in their notification settings; &quot;Email me a test digest&quot; sends one to you now.
              </p>
            </div>
            <SwitchRow
              label="Proactive nudges"
              description="Tell the right person, without being asked, about an overdue commitment or a question left open: it appears in their notifications as it happens. Needs workspace memory."
              checked={config.nudges_enabled}
              disabled={saving || !config.enabled || !config.memory_layer_enabled}
              onChange={handleToggleNudges}
            />
            <SwitchRow
              label="AI coworker (@mention)"
              description="Let members @mention the AI in a channel and get an answer there, from that channel's recent messages and only what the person asking can see. It only replies when mentioned."
              checked={config.coworker_enabled}
              disabled={saving || !config.enabled}
              onChange={handleToggleCoworker}
            />
            <SwitchRow
              label="GitHub auto-review"
              description="When an issue or pull request is opened on a linked repository, the AI reviews it against the code and comments on the linked task: a proposed fix for an issue, a review for a pull request. Nothing is pushed to GitHub. Off by default, since it uses one AI call per issue or pull request."
              checked={config.issue_triage_enabled}
              disabled={saving || !config.enabled}
              onChange={handleToggleIssueTriage}
            />
          </SettingsList>

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

        {/* MCP servers — connect external tool servers to agents. Anchored so
            the tab's jump row can reach it by its own name. */}
        <div id="ai-models-mcp-servers" className="scroll-mt-4">
          <McpServersCard />
        </div>
      </CardContent>
    </Card>
  )
}

// ─── Reindex progress banner ──────────────────────────────────────────

const ReindexBanner: React.FC<{ status: ReindexStatus }> = ({ status }) => {
  const pct = status.total > 0 ? Math.round(((status.processed + status.failed) / status.total) * 100) : 0
  return (
    <section className="rounded-lg border border-warning/30 bg-warning/10 p-4 space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-warning-ink">
          {status.running ? "Rebuilding AI search index…" : "AI search index rebuilt"}
        </h3>
        <span className="text-xs text-muted-foreground">
          {status.processed + status.failed} / {status.total} (dim {status.dimension})
        </span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
        <div className="h-full bg-warning transition-[width,height]" style={{ width: `${pct}%` }} />
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
      {/* The shared progress bar, in the theme's colour; only near the cap
          does it turn to the warning colour, which is what it is for. */}
      {l > 0 && (
        <Progress
          value={pct}
          aria-label={`${label}: ${pct}% of today's cap`}
          className={near ? "h-1.5 [&>div]:bg-warning" : "h-1.5"}
        />
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
          No daily caps yet. Set one below to limit spend.
        </p>
      )}
      <p className="border-t border-border/50 pt-2 text-xs leading-relaxed text-muted-foreground">
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
            } catch (e: unknown) {
              toast({
                title: "Could not save patterns",
                description: apiErrorMessage(e, "One of the patterns is an invalid regex."),
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
      <Button variant="outline"
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
        <p className="text-2xs text-muted-foreground mt-1">{value === 0 ? "Unlimited" : `${value.toLocaleString()} tokens/day`}</p>
      </div>
      <Button variant="outline"
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
          <p className="text-xs text-danger-ink mt-1">Use 0 (default) or a value between 2048 and 1000000.</p>
        )}
      </div>
      <Button variant="outline"
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

  // A choice of one, saved the moment it is picked: a segmented radio group
  // like the app's others, saying so under its name. It was a strip of buttons
  // with no radio semantics.
  return (
    <div className="rounded-lg border border-border bg-card/50 p-4">
      <p id="code-depth-label" className="text-sm font-semibold">Code analysis depth</p>
      <p id="code-depth-help" className="mb-3 text-xs text-muted-foreground">
        How many files of a repository the bug-analysis agent reads per run. More is better grounded but slower, and
        the cost stays within your model&apos;s context window. Saves when you pick one.
      </p>
      <div
        role="radiogroup"
        aria-labelledby="code-depth-label"
        aria-describedby="code-depth-help"
        className="inline-flex w-fit gap-1 rounded-md bg-muted p-1"
      >
        {CODE_DEPTH_PRESETS.map((p) => (
          <button
            key={p.value}
            type="button"
            role="radio"
            aria-checked={p.value === current}
            disabled={busy}
            onClick={() => pick(p.value)}
            title={p.hint}
            className={
              "h-8 rounded-sm px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70 disabled:opacity-50 " +
              (p.value === current ? "bg-background text-foreground" : "text-muted-foreground hover:text-foreground")
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
    } catch (e: unknown) {
      toast({ title: "Failed", description: apiErrorMessage(e), variant: "destructive" })
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
    } catch (e: unknown) {
      toast({ title: "Failed", description: apiErrorMessage(e), variant: "destructive" })
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
    } catch (e: unknown) {
      toast({ title: "Failed", description: apiErrorMessage(e), variant: "destructive" })
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
    } catch (e: unknown) {
      const status = apiErrorStatus(e)
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
        toast({ title: "Failed", description: apiErrorMessage(e), variant: "destructive" })
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
        <p className="text-xs text-warning-ink">
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
  const id = useId()
  return (
    <div className="rounded-lg border border-border bg-card/50 p-4 space-y-3">
      <div>
        <h4 className="text-sm font-medium">{title}</h4>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[180px]">
          <Label htmlFor={`${id}-provider`} className="text-xs">Provider</Label>
          <Select value={providerId} onValueChange={onProviderChange}>
            <SelectTrigger id={`${id}-provider`} className="h-9"><SelectValue placeholder="Choose a provider" /></SelectTrigger>
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
              aria-label="Refresh the list of models"
              className="flex items-center gap-1 rounded-sm text-xs text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70"
            >
              <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} aria-hidden="true" /> Refresh
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

        <Button variant="outline" size="sm" onClick={onSave} disabled={saving || !providerId || !model}>
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
              } catch (e: unknown) {
                toast({ title: "Failed", description: apiErrorMessage(e), variant: "destructive" })
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
      <p className="mb-2 text-2xs leading-tight text-muted-foreground">
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
  const [baseError, setBaseError] = useState("")
  const baseRef = useRef<HTMLInputElement>(null)
  const id = useId()

  const realProvider = provider === "none" ? "" : provider
  const needsKey = realProvider === "tavily" || realProvider === "brave"
  const needsBase = realProvider === "searxng"

  // The switch and the fields wait for Save, so the save bar says so while
  // anything differs from what is stored. They used to look like the switches
  // above, which save the moment they are touched, and an admin who turned
  // web search on and left had changed nothing.
  const dirty =
    provider !== (config.web_search_provider || "none") ||
    baseURL !== (config.web_search_base_url || "") ||
    apiKey !== "" ||
    enabled !== config.web_search_enabled
  const reset = () => {
    setProvider(config.web_search_provider || "none")
    setBaseURL(config.web_search_base_url || "")
    setApiKey("")
    setEnabled(config.web_search_enabled)
    setBaseError("")
  }

  const save = async () => {
    if (needsBase && enabled && !baseURL.trim()) {
      setBaseError("Enter your SearXNG address.")
      baseRef.current?.focus()
      return
    }
    setBaseError("")
    setSaving(true)
    try {
      await setWebSearch({
        provider: realProvider,
        base_url: baseURL.trim(),
        api_key: apiKey.trim() || undefined,
        enabled: realProvider !== "" && enabled,
      })
      setApiKey("")
      toast({ title: "Web search saved" })
      await onChanged()
    } catch (e) {
      toast({
        title: "Couldn't save web search",
        description: apiErrorMessage(e, "Try again in a moment."),
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
          aria-label="Use web search"
          checked={enabled && realProvider !== ""}
          disabled={saving || realProvider === ""}
          onCheckedChange={setEnabled}
        />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor={`${id}-provider`} className="text-xs">Provider</Label>
          <Select value={provider} onValueChange={setProvider}>
            <SelectTrigger id={`${id}-provider`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Off</SelectItem>
              <SelectItem value="searxng">SearXNG (self-hosted)</SelectItem>
              <SelectItem value="tavily">Tavily</SelectItem>
              <SelectItem value="brave">Brave Search</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {(needsBase || realProvider !== "") && (
          <div className="space-y-1">
            <Label htmlFor={`${id}-base`} className="text-xs">
              Address{needsBase ? "" : " (optional)"}
            </Label>
            <Input
              ref={baseRef}
              id={`${id}-base`}
              type="url"
              spellCheck={false}
              autoComplete="off"
              value={baseURL}
              aria-invalid={baseError ? true : undefined}
              aria-describedby={baseError ? `${id}-base-error` : undefined}
              onChange={(e) => {
                setBaseURL(e.target.value)
                if (baseError) setBaseError("")
              }}
              placeholder={needsBase ? "https://searx.example.com…" : "Leave empty for the provider's own…"}
            />
            {baseError && (
              <p id={`${id}-base-error`} className="text-xs font-medium text-danger-ink" aria-live="polite">{baseError}</p>
            )}
          </div>
        )}
      </div>

      {needsKey && (
        <div className="space-y-1">
          <Label htmlFor={`${id}-key`} className="text-xs">API key</Label>
          <Input
            id={`${id}-key`}
            type="password"
            autoComplete="new-password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={config.has_web_search_key ? "Saved: leave empty to keep it" : "The provider's API key…"}
          />
        </div>
      )}

      <SaveBar dirty={dirty} saving={saving} what="web search changes" onSave={() => void save()} onDiscard={reset} />
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
  const [probe, setProbe] = useState<RunnerProbe | null>(null)
  const [killing, setKilling] = useState(false)
  const [urlError, setUrlError] = useState("")
  const urlRef = useRef<HTMLInputElement>(null)
  const id = useId()

  const num = (v: string) => {
    const n = parseInt(v, 10)
    return Number.isFinite(n) && n > 0 ? n : 0
  }

  // Everything here waits for Save; the save bar says so while anything
  // differs from what is stored, and offers to put it back.
  const dirty =
    enabled !== config.sandbox_enabled ||
    runnerURL !== (config.sandbox_runner_url || "") ||
    runnerToken !== "" ||
    imageDigest !== (config.sandbox_image_digest || "") ||
    wsSeconds !== String(config.sandbox_workspace_daily_seconds || 0) ||
    wsRuns !== String(config.sandbox_workspace_daily_runs || 0) ||
    chSeconds !== String(config.sandbox_channel_daily_seconds || 0) ||
    chRuns !== String(config.sandbox_channel_daily_runs || 0)
  const reset = () => {
    setEnabled(config.sandbox_enabled)
    setRunnerURL(config.sandbox_runner_url || "")
    setRunnerToken("")
    setImageDigest(config.sandbox_image_digest || "")
    setWsSeconds(String(config.sandbox_workspace_daily_seconds || 0))
    setWsRuns(String(config.sandbox_workspace_daily_runs || 0))
    setChSeconds(String(config.sandbox_channel_daily_seconds || 0))
    setChRuns(String(config.sandbox_channel_daily_runs || 0))
    setUrlError("")
  }

  const save = async () => {
    if (enabled && !runnerURL.trim()) {
      setUrlError("Enter the runner's address to turn the sandbox on.")
      urlRef.current?.focus()
      return
    }
    setUrlError("")
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
      toast({ title: "Sandbox settings saved" })
      await onChanged()
    } catch (e) {
      toast({
        title: "Couldn't save the sandbox settings",
        description: apiErrorMessage(e, "Try again in a moment."),
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
      // Kept on screen as well as toasted. Whether the runner is reachable is the one fact this
      // section exists to establish, and a toast erases it after four seconds.
      setProbe({ ok: res.ok, status: res.status, message: res.message, ms: res.wall_ms, at: new Date() })
      toast({
        title: res.ok ? "Sandbox reachable" : "Sandbox test failed",
        description: res.message,
        variant: res.ok ? "default" : "destructive",
      })
    } catch (e) {
      const message = apiErrorMessage(e, "The runner didn't answer. Check its address and token.")
      setProbe({ ok: false, message, at: new Date() })
      toast({ title: "Couldn't run the sample analysis", description: message, variant: "destructive" })
    } finally {
      setTesting(false)
    }
  }

  const killNow = async () => {
    setKilling(true)
    try {
      await setSandboxEnabled(false)
      setEnabled(false)
      toast({ title: "The sandbox is off" })
      await onChanged()
    } catch (e) {
      toast({
        title: "Couldn't turn the sandbox off",
        description: apiErrorMessage(e, "Try again now."),
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
        <Switch aria-label="Use the code analysis sandbox" checked={enabled} disabled={saving || !runnerURL.trim()} onCheckedChange={setEnabled} />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor={`${id}-url`} className="text-xs">Runner address</Label>
          <Input
            ref={urlRef}
            id={`${id}-url`}
            type="url"
            spellCheck={false}
            autoComplete="off"
            value={runnerURL}
            aria-invalid={urlError ? true : undefined}
            aria-describedby={urlError ? `${id}-url-error` : undefined}
            onChange={(e) => {
              setRunnerURL(e.target.value)
              if (urlError) setUrlError("")
            }}
            placeholder="http://code-runner:9099/run…"
          />
          {urlError && (
            <p id={`${id}-url-error`} className="text-xs font-medium text-danger-ink" aria-live="polite">{urlError}</p>
          )}
        </div>
        <div className="space-y-1">
          <Label htmlFor={`${id}-token`} className="text-xs">Runner token</Label>
          <Input
            id={`${id}-token`}
            type="password"
            autoComplete="new-password"
            value={runnerToken}
            onChange={(e) => setRunnerToken(e.target.value)}
            placeholder={
              config.has_sandbox_runner_token ? "Saved: leave empty to keep it" : "The token the runner shares…"
            }
          />
        </div>
      </div>

      <div className="space-y-1">
        <Label htmlFor={`${id}-digest`} className="text-xs">Image digest (optional)</Label>
        <Input
          id={`${id}-digest`}
          spellCheck={false}
          autoComplete="off"
          value={imageDigest}
          onChange={(e) => setImageDigest(e.target.value)}
          placeholder="sha256:… pins the runner image, for the record"
        />
      </div>

      <div className="pt-1">
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium text-muted-foreground">Daily limits (0 means no limit)</p>
          <p className="text-xs text-muted-foreground">
            Used today: {config.sandbox_used_today_runs} run{config.sandbox_used_today_runs === 1 ? "" : "s"},{" "}
            {config.sandbox_used_today_seconds}s
          </p>
        </div>
        <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="space-y-1">
            <Label htmlFor={`${id}-ws-s`} className="text-xs">Workspace seconds</Label>
            <Input id={`${id}-ws-s`} type="number" inputMode="numeric" min={0} value={wsSeconds} onChange={(e) => setWsSeconds(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor={`${id}-ws-r`} className="text-xs">Workspace runs</Label>
            <Input id={`${id}-ws-r`} type="number" inputMode="numeric" min={0} value={wsRuns} onChange={(e) => setWsRuns(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor={`${id}-ch-s`} className="text-xs">Channel seconds</Label>
            <Input id={`${id}-ch-s`} type="number" inputMode="numeric" min={0} value={chSeconds} onChange={(e) => setChSeconds(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor={`${id}-ch-r`} className="text-xs">Channel runs</Label>
            <Input id={`${id}-ch-r`} type="number" inputMode="numeric" min={0} value={chRuns} onChange={(e) => setChRuns(e.target.value)} />
          </div>
        </div>
      </div>

      <RunnerTestStatus probe={probe} />

      <div className="flex items-center justify-between pt-1">
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={runTest} disabled={testing || !config.sandbox_runner_url}>
            {testing ? "Testing…" : "Run sample analysis"}
          </Button>
          {config.sandbox_enabled && (
            <Button size="sm" variant="destructive" onClick={killNow} disabled={killing}>
              {killing ? "Turning off…" : "Turn off now"}
            </Button>
          )}
        </div>
      </div>

      <SaveBar dirty={dirty} saving={saving} what="sandbox changes" onSave={() => void save()} onDiscard={reset} />
    </div>
  )
}

// Accepted bounds for the per-run coding time limit, mirroring what the server
// enforces (0 = use the server default). Kept here so the control can state the
// range up front instead of surfacing a rejection after a save.
const CODE_PR_MIN_WALL_MINUTES = 2
const CODE_PR_MAX_WALL_MINUTES = 60

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
        title: "Couldn't change the code-run model",
        description: apiErrorMessage(e, "Try again in a moment."),
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
        title: "Couldn't go back to the chat model",
        description: apiErrorMessage(e, "Try again in a moment."),
        variant: "destructive",
      })
    } finally {
      setSavingCodeRunModel(false)
    }
  }
  const [allowUnlinked, setAllowUnlinked] = useState(config.code_pr_allow_unlinked)
  // How long one coding run may work. 0 = use the server default; other values
  // must be inside the range the server enforces.
  const [wallMinutes, setWallMinutes] = useState(String(config.code_pr_wall_minutes || 0))
  const wallValue = parseInt(wallMinutes || "0", 10)
  const wallInvalid =
    !Number.isFinite(wallValue) ||
    wallValue < 0 ||
    (wallValue > 0 && (wallValue < CODE_PR_MIN_WALL_MINUTES || wallValue > CODE_PR_MAX_WALL_MINUTES))
  const [wsMinutes, setWsMinutes] = useState(String(config.code_pr_workspace_daily_minutes || 0))
  const [wsRuns, setWsRuns] = useState(String(config.code_pr_workspace_daily_runs || 0))
  const [chMinutes, setChMinutes] = useState(String(config.code_pr_channel_daily_minutes || 0))
  const [chRuns, setChRuns] = useState(String(config.code_pr_channel_daily_runs || 0))
  const [saving, setSaving] = useState(false)
  const [killing, setKilling] = useState(false)
  const [testing, setTesting] = useState(false)
  const [probe, setProbe] = useState<RunnerProbe | null>(null)
  const [urlError, setUrlError] = useState("")
  const urlRef = useRef<HTMLInputElement>(null)
  const wallRef = useRef<HTMLInputElement>(null)
  const id = useId()

  // Everything but the code-run model (which has its own button) waits for
  // Save. The two switches below looked like the ones that save at once; the
  // save bar now says when something is waiting, and offers to put it back.
  const storedEgress = (config.code_pr_egress_allowlist || []).join(", ")
  const dirty =
    enabled !== config.code_pr_enabled ||
    runnerURL !== (config.code_pr_runner_url || "") ||
    runnerToken !== "" ||
    egress !== storedEgress ||
    policy !== (config.code_pr_out_of_scope_policy || "flag_open") ||
    draftOnRed !== config.code_pr_draft_on_red ||
    allowUnlinked !== config.code_pr_allow_unlinked ||
    wallMinutes !== String(config.code_pr_wall_minutes || 0) ||
    wsMinutes !== String(config.code_pr_workspace_daily_minutes || 0) ||
    wsRuns !== String(config.code_pr_workspace_daily_runs || 0) ||
    chMinutes !== String(config.code_pr_channel_daily_minutes || 0) ||
    chRuns !== String(config.code_pr_channel_daily_runs || 0)
  const reset = () => {
    setEnabled(config.code_pr_enabled)
    setRunnerURL(config.code_pr_runner_url || "")
    setRunnerToken("")
    setEgress(storedEgress)
    setPolicy(config.code_pr_out_of_scope_policy || "flag_open")
    setDraftOnRed(config.code_pr_draft_on_red)
    setAllowUnlinked(config.code_pr_allow_unlinked)
    setWallMinutes(String(config.code_pr_wall_minutes || 0))
    setWsMinutes(String(config.code_pr_workspace_daily_minutes || 0))
    setWsRuns(String(config.code_pr_workspace_daily_runs || 0))
    setChMinutes(String(config.code_pr_channel_daily_minutes || 0))
    setChRuns(String(config.code_pr_channel_daily_runs || 0))
    setUrlError("")
  }

  const testRunner = async () => {
    setTesting(true)
    try {
      const res = await testCodePRRunner()
      setProbe({ ok: res.ok, status: res.status, message: res.message, ms: res.latency_ms, at: new Date() })
      toast({
        title: res.ok ? "Coding runner reachable" : "Runner check failed",
        description: `${res.message}${res.latency_ms ? ` (${res.latency_ms}ms)` : ""}`,
        variant: res.ok ? "default" : "destructive",
      })
    } catch (e) {
      const message = apiErrorMessage(e, "The runner didn't answer. Check its address and token.")
      setProbe({ ok: false, message, at: new Date() })
      toast({ title: "Couldn't test the coding runner", description: message, variant: "destructive" })
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
    // Said under the field, with the cursor there, not in a toast.
    if (enabled && !runnerURL.trim()) {
      setUrlError("Enter the coding runner's address to turn code pull requests on.")
      urlRef.current?.focus()
      return
    }
    setUrlError("")
    if (wallInvalid) {
      wallRef.current?.focus()
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
        wall_minutes: num(wallMinutes),
        workspace_daily_minutes: num(wsMinutes),
        workspace_daily_runs: num(wsRuns),
        channel_daily_minutes: num(chMinutes),
        channel_daily_runs: num(chRuns),
      })
      setRunnerToken("")
      toast({ title: "Code pull request settings saved" })
      await onChanged()
    } catch (e) {
      toast({
        title: "Couldn't save the code pull request settings",
        description: apiErrorMessage(e, "Try again in a moment."),
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
      toast({ title: "Code pull requests are off" })
      await onChanged()
    } catch (e) {
      toast({
        title: "Couldn't turn code pull requests off",
        description: apiErrorMessage(e, "Try again now."),
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
            reviewable pull request, inside an isolated code-runner sidecar whose only network access is your git
            host. The agent never merges; every PR goes through your normal review + CI. Off until you deploy a
            coding runner and point this at it. Metered against the budgets below.
          </p>
        </div>
        <Switch aria-label="Use code pull requests" checked={enabled} disabled={saving || !runnerURL.trim()} onCheckedChange={setEnabled} />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor={`${id}-url`} className="text-xs">Runner address</Label>
          <Input
            ref={urlRef}
            id={`${id}-url`}
            type="url"
            spellCheck={false}
            autoComplete="off"
            value={runnerURL}
            aria-invalid={urlError ? true : undefined}
            aria-describedby={urlError ? `${id}-url-error` : undefined}
            onChange={(e) => {
              setRunnerURL(e.target.value)
              if (urlError) setUrlError("")
            }}
            placeholder="http://code-runner-coding:9099…"
          />
          {urlError && (
            <p id={`${id}-url-error`} className="text-xs font-medium text-danger-ink" aria-live="polite">{urlError}</p>
          )}
        </div>
        <div className="space-y-1">
          <Label htmlFor={`${id}-token`} className="text-xs">Runner token</Label>
          <Input
            id={`${id}-token`}
            type="password"
            autoComplete="new-password"
            value={runnerToken}
            onChange={(e) => setRunnerToken(e.target.value)}
            placeholder={
              config.has_code_pr_runner_token ? "Saved: leave empty to keep it" : "The token the runner shares…"
            }
          />
        </div>
      </div>

      <div className="space-y-1">
        <Label htmlFor={`${id}-egress`} className="text-xs">Hosts the runner may reach</Label>
        <Input
          id={`${id}-egress`}
          spellCheck={false}
          autoComplete="off"
          value={egress}
          aria-describedby={`${id}-egress-help`}
          onChange={(e) => setEgress(e.target.value)}
          placeholder="github.com, api.github.com…"
        />
        <p id={`${id}-egress-help`} className="text-xs text-muted-foreground">
          Separated by commas. The runner can reach nothing else: list your git host, and any package registry your
          builds need.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor={`${id}-policy`} className="text-xs">If a change goes beyond the task</Label>
          <Select value={policy} onValueChange={setPolicy}>
            <SelectTrigger id={`${id}-policy`}>
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
            <Label htmlFor={`${id}-draft`} className="text-xs">Open a draft when it can&apos;t verify</Label>
            <p id={`${id}-draft-help`} className="text-xs text-muted-foreground">
              A clearly labelled draft instead of nothing, when the build or tests can&apos;t be made to pass.
            </p>
          </div>
          <Switch id={`${id}-draft`} aria-describedby={`${id}-draft-help`} checked={draftOnRed} onCheckedChange={setDraftOnRed} />
        </div>
      </div>

      <div className="flex items-start justify-between gap-3 rounded-md border border-border bg-background/40 p-3">
        <div className="pr-2">
          <Label htmlFor={`${id}-unlinked`} className="text-xs">Allow any repository the agent can access</Label>
          <p id={`${id}-unlinked-help`} className="text-xs text-muted-foreground">
            When on, the agent can open a pull request on any repository the connected GitHub account can reach
            (checked on every run), not only those linked to a project. Leave it off to keep it to linked
            repositories: the safer choice when that account can see repositories beyond this workspace.
          </p>
        </div>
        <Switch id={`${id}-unlinked`} aria-describedby={`${id}-unlinked-help`} checked={allowUnlinked} onCheckedChange={setAllowUnlinked} />
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

      <div className="space-y-1">
        <Label htmlFor="code-pr-wall" className="text-xs">
          Coding time limit (minutes per run)
        </Label>
        <Input
          ref={wallRef}
          id="code-pr-wall"
          type="number"
          min={0}
          max={CODE_PR_MAX_WALL_MINUTES}
          value={wallMinutes}
          onChange={(e) => setWallMinutes(e.target.value)}
          aria-describedby="code-pr-wall-hint"
          aria-invalid={wallInvalid}
          className="w-32"
        />
        <p id="code-pr-wall-hint" className="text-xs text-muted-foreground">
          How long one coding run may work before it wraps up and hands back whatever it finished: partial work is
          still pushed to a branch. Use 0 for the default, or {CODE_PR_MIN_WALL_MINUTES} to {CODE_PR_MAX_WALL_MINUTES}{" "}
          minutes. In force now: {config.code_pr_effective_wall_minutes} min.
        </p>
        {wallInvalid && (
          <p className="text-xs font-medium text-danger-ink" aria-live="polite">
            Use 0 for the default, or a number from {CODE_PR_MIN_WALL_MINUTES} to {CODE_PR_MAX_WALL_MINUTES}.
          </p>
        )}
      </div>

      <div className="pt-1">
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium text-muted-foreground">Daily limits (0 means no limit)</p>
          <p className="text-xs text-muted-foreground">
            Used today: {config.code_pr_used_today_runs} run{config.code_pr_used_today_runs === 1 ? "" : "s"},{" "}
            {config.code_pr_used_today_minutes} min
          </p>
        </div>
        <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="space-y-1">
            <Label htmlFor={`${id}-ws-m`} className="text-xs">Workspace minutes</Label>
            <Input id={`${id}-ws-m`} type="number" inputMode="numeric" min={0} value={wsMinutes} onChange={(e) => setWsMinutes(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor={`${id}-ws-r`} className="text-xs">Workspace runs</Label>
            <Input id={`${id}-ws-r`} type="number" inputMode="numeric" min={0} value={wsRuns} onChange={(e) => setWsRuns(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor={`${id}-ch-m`} className="text-xs">Channel minutes</Label>
            <Input id={`${id}-ch-m`} type="number" inputMode="numeric" min={0} value={chMinutes} onChange={(e) => setChMinutes(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor={`${id}-ch-r`} className="text-xs">Channel runs</Label>
            <Input id={`${id}-ch-r`} type="number" inputMode="numeric" min={0} value={chRuns} onChange={(e) => setChRuns(e.target.value)} />
          </div>
        </div>
      </div>

      <RunnerTestStatus probe={probe} />

      <div className="flex items-center justify-between pt-1">
        <div className="flex items-center gap-2">
          {config.code_pr_enabled && (
            <Button size="sm" variant="destructive" onClick={killNow} disabled={killing}>
              {killing ? "Turning off…" : "Turn off now"}
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
      </div>

      <SaveBar dirty={dirty} saving={saving} what="code pull request changes" onSave={() => void save()} onDiscard={reset} />
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
        return { label: "Healthy", cls: "bg-success/15 text-success-ink" }
      case "needs_attention":
        return { label: "Needs attention", cls: "bg-warning/15 text-warning-ink" }
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
            How the coding agent actually performs: open, verify, in-scope, and draft rates, plus the ground-truth
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
        <p className="text-xs text-danger-ink">{error}</p>
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
              value={data.outcome_known > 0 ? pct(data.merge_rate) : "None yet"}
              sub={`${data.merged + data.merged_with_edits}/${data.outcome_known} known`}
            />
            <Metric label="Opened a PR" value={pct(data.open_rate)} sub={`${data.opened}/${data.total}`} />
            <Metric
              label="Verified"
              value={data.opened > 0 ? pct(data.verify_rate) : "None yet"}
              sub={`${data.verified}/${data.opened}`}
            />
            <Metric
              label="Had tests"
              value={data.opened > 0 ? pct(data.with_tests / data.opened) : "None yet"}
              sub={`${data.with_tests}/${data.opened}`}
            />
            <Metric
              label="In scope"
              value={data.opened > 0 ? pct(data.in_scope_rate) : "None yet"}
              sub={`${data.in_scope}/${data.opened}`}
            />
            <Metric
              label="Drafts"
              value={data.opened > 0 ? pct(data.draft_rate) : "None yet"}
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
              <p className="text-2xs font-medium text-muted-foreground">Recent runs</p>
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
      return { label: "Merged", cls: "bg-success/15 text-success-ink" }
    }
    if (run.outcome === "closed_unmerged") {
      return { label: "Closed", cls: "bg-destructive/15 text-danger-ink" }
    }
    switch (run.status) {
      case "ok":
        return {
          label: run.draft ? "Draft PR" : "PR opened",
          cls: "bg-info/15 text-info-ink",
        }
      case "blocked":
        return { label: "Needs input", cls: "bg-warning/15 text-warning-ink" }
      case "no_green":
        return { label: "Unverified", cls: "bg-warning/15 text-warning-ink" }
      default:
        return { label: run.status || "Unknown", cls: "bg-muted text-muted-foreground" }
    }
  })()
  const when = (() => {
    const d = new Date(run.created_at)
    return isNaN(d.getTime()) ? "" : shortDateTime(d)
  })()
  return (
    <div className="flex items-center justify-between gap-3 px-3 py-2 text-xs">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <Badge className={`${badge.cls} border-transparent`}>{badge.label}</Badge>
          <span className="truncate font-medium">{run.repo || "No repository"}</span>
        </div>
        {run.message ? (
          <p className="mt-0.5 truncate text-2xs text-muted-foreground">{run.message}</p>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-3 text-2xs text-muted-foreground">
        {run.all_passed ? (
          <span className="inline-flex items-center gap-1 text-success-ink" title="The build and tests passed in the sandbox">
            <Check className="h-3 w-3" aria-hidden="true" /> Verified
          </span>
        ) : null}
        {run.diff_files > 0 ? (
          <span className="tabular-nums">{run.diff_files} {run.diff_files === 1 ? "file" : "files"}</span>
        ) : null}
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
      <div className="text-2xs font-medium text-muted-foreground">{label}</div>
      {sub ? <div className="text-2xs text-muted-foreground/70 tabular-nums">{sub}</div> : null}
    </div>
  )
}
