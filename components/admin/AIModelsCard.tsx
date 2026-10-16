"use client"

/**
 * AIModelsCard: the parts of AI & agents that read and write the AI settings
 * (/admin/ai/*), one export per card, for the section's sub-pages
 * (components/admin/ai/AIAgentsSection, design v3 admin §A15):
 *
 *  - the default export, Models: providers, the active chat, embedding and
 *    vision models, server resources and a running reindex (Models);
 *  - AmbientAgentsPanel: the automations that run on those models (Agents);
 *  - RedactionPanel: local-only and personal-detail redaction (Governance);
 *  - UsagePanel and TopConsumersPanel: today's meters, the caps, and where the
 *    spend goes (Usage);
 *  - AdvancedPanels: model tuning, analysis depth, web search, the sandbox
 *    and code pull requests, each a card folded to its title row (Advanced).
 *
 * They were one 2,800-line component drawn as one 7,000px column. Each reads
 * the settings through the shared key (useAIConfig), so a switch flipped on
 * one sub-page is right on the next without another request.
 */

import { useSecretReentry } from "@/hooks/useSecretReentry"
import { avatarSeed } from "@/lib/utils/getAvatarColor"
import React, { useCallback, useEffect, useId, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { SaveBar, SettingRow, SettingsList, SettingsSection, SwitchRow, sectionActionClass } from "@/components/ui/settingsSection"
import { SegmentedControl } from "@/components/ui/segmentedControl"
import { StatusWord } from "@/components/ui/statusWord"
import { EmptyState } from "@/components/ui/empty-state"
import { ADMIN_GROUP_HUE } from "@/components/admin/adminHues"
import { useAIConfig } from "@/components/admin/ai/useAIConfig"
import { ConfigSwitchRow } from "@/components/admin/ai/aiSwitch"
import { CollapsibleCard } from "@/components/admin/ai/CollapsibleCard"
import { fieldLabel, fieldRow } from "@/lib/ui/fieldRow"
import { SectionListSkeleton } from "@/components/admin/SectionListSkeleton"
import { SkeletonRows } from "@/components/ui/skeletonRows"
import { ErrorState } from "@/components/ui/error-state"
import { Progress } from "@/components/ui/progress"
import { IdentityMark } from "@/components/ui/graphics/IdentityMark"
import { useToast } from "@/hooks/use-toast"
import { useConfirm } from "@/hooks/useConfirm"
import { RefreshCw, Save, Plus, Lightbulb, Check, Users, Hash, GitPullRequest } from "@/lib/icons"
import {
  AIConfig,
  ModelView,
  ProviderView,
  SystemStats,
  ReindexStatus,
  MemoryBackfillStatus,
  CodePRScorecard as CodePRScorecardData,
  CodePRRunView,
  getAISystemStats,
  getReindexStatus,
  getAIUsage,
  AIUsage,
  getAIUserUsage,
  AIUserUsageRow,
  getAIChannelUsage,
  AIChannelUsageRow,
  listProviderModels,
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

const AI_DESCRIPTION =
  "Run local models with Ollama, bring your own OpenAI or Anthropic key, or connect any OpenAI-compatible endpoint. Everything stays on your server."

/**
 * The model lists of each provider, fetched when first needed. The Models
 * page and the code pull requests card (Advanced) each hold their own.
 */
function useProviderModels() {
  const { toast } = useToast()
  const [modelsByProvider, setModelsByProvider] = useState<Record<string, ModelView[]>>({})
  const [modelsLoading, setModelsLoading] = useState<Record<string, boolean>>({})
  const loadModels = useCallback(
    async (providerId: string, refresh = false) => {
      if (!providerId) return
      setModelsLoading((m) => ({ ...m, [providerId]: true }))
      try {
        const models = await listProviderModels(providerId, refresh)
        setModelsByProvider((m) => ({ ...m, [providerId]: models }))
      } catch (e: unknown) {
        // A TITLE THAT MATCHES THE CAUSE. A stored key the server can no
        // longer decrypt is labelled by the server (409 provider_key_unreadable)
        // so the admin isn't sent to check a provider that was fine. Matched on
        // the code, never on the message text.
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
  return { modelsByProvider, modelsLoading, loadModels }
}

/** The settings' loading and failed states, under a section's own title. */
function ConfigGate({
  title,
  description,
  children,
}: {
  title: React.ReactNode
  description?: React.ReactNode
  children: (config: AIConfig) => React.ReactNode
}) {
  const { config, refresh, error, isLoading } = useAIConfig()
  // The shape of what is coming under the title: rows in a card, so the page
  // doesn't jump from one line of text to its settings.
  if (isLoading && !config) {
    return (
      <SettingsSection title={title} description={description}>
        <div role="status" aria-label="Loading the AI settings">
          <SettingsList>
            <div className="px-4 py-1" aria-hidden="true">
              <SkeletonRows rows={3} avatar={false} />
            </div>
          </SettingsList>
        </div>
      </SettingsSection>
    )
  }
  // A failed read is said under the title, which stays.
  if (!config) {
    return (
      <SettingsSection title={title} description={description}>
        <ErrorState
          compact
          subject="the AI settings"
          detail={error ? apiErrorMessage(error, "Try again in a moment.") : undefined}
          onRetry={() => void refresh()}
        />
      </SettingsSection>
    )
  }
  return <>{children(config)}</>
}

// ─── Models (the default export) ──────────────────────────────────────

const AIModelsCard = () => {
  const { config, refresh: refreshConfig } = useAIConfig()
  const [stats, setStats] = useState<SystemStats | null>(null)
  const [reindex, setReindex] = useState<ReindexStatus | null>(null)
  const { modelsByProvider, modelsLoading, loadModels } = useProviderModels()

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

  // Started together, and with the settings' own read: none of these needs
  // another's answer.
  useEffect(() => {
    void Promise.all([refreshStats(), pollReindex()])
  }, [refreshStats, pollReindex])

  // Once the settings are here, the catalogs of the active chat and embedding
  // providers, ahead of anyone opening their pickers. Once per open.
  const catalogsAsked = useRef(false)
  useEffect(() => {
    if (!config || catalogsAsked.current) return
    catalogsAsked.current = true
    if (config.chat_provider_id) void loadModels(config.chat_provider_id)
    if (config.embedding_provider_id && config.embedding_provider_id !== config.chat_provider_id) {
      void loadModels(config.embedding_provider_id)
    }
  }, [config, loadModels])

  // The section's title is there from the first frame, and its state beside it
  // once the settings are read: a dot and a word a person uses.
  const title = (
    <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1">
      Models
      {config && (
        <StatusWord tone={config.enabled ? "success" : "neutral"} className="text-sm font-normal">
          {config.enabled ? "On" : "Off"}
        </StatusWord>
      )}
      {config?.circuit_state && config.circuit_state !== "closed" && (
        <StatusWord tone="danger" className="text-sm font-normal">
          {config.circuit_state === "half_open" ? "Trying the provider again after errors" : "Paused after the provider kept failing"}
        </StatusWord>
      )}
    </span>
  )

  return (
    <ConfigGate title={title} description={AI_DESCRIPTION}>
      {(cfg) => (
        <div className="space-y-8">
          <ProvidersSection
            config={cfg}
            modelsByProvider={modelsByProvider}
            modelsLoading={modelsLoading}
            stats={stats}
            onEnsureModels={loadModels}
            title={title}
            onChanged={async () => {
              await refreshConfig()
              await refreshStats()
            }}
          />
          {/* Server resources and the engine's version, then a running reindex. */}
          {stats && <SystemStatsBar stats={stats} onRefresh={refreshStats} />}
          {reindex && (reindex.running || reindex.total > 0) && <ReindexBanner status={reindex} />}
          <ActiveModelSection
            config={cfg}
            modelsByProvider={modelsByProvider}
            modelsLoading={modelsLoading}
            onEnsureModels={loadModels}
            onChanged={async () => {
              await refreshConfig()
              await pollReindex()
            }}
          />
        </div>
      )}
    </ConfigGate>
  )
}

export default AIModelsCard

// ─── Ambient agents (the Agents sub-page) ─────────────────────────────

/**
 * The automations that run in the background on the active models: switches
 * that save the moment they are touched, each with what it needs under it.
 */
export function AmbientAgentsPanel() {
  const { toast } = useToast()
  const { config, setConfig } = useAIConfig()
  const [backfill, setBackfill] = useState<MemoryBackfillStatus | null>(null)

  // Poll the memory rebuild while it runs, so the admin can watch it.
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
    void pollBackfill()
  }, [pollBackfill])
  useEffect(() => {
    if (backfill?.state !== "running") return
    const t = setInterval(async () => {
      const stillRunning = await pollBackfill()
      if (!stillRunning) clearInterval(t)
    }, 3000)
    return () => clearInterval(t)
  }, [backfill?.state, pollBackfill])

  const handleSaveRecapInstructions = async (instructions: string) => {
    try {
      await setMeetingRecapInstructions(instructions)
      setConfig((c) => (c ? { ...c, meeting_recap_instructions: instructions } : c))
      toast({ title: "Recap instructions saved" })
    } catch (e) {
      toast({ title: "Couldn't save the recap instructions", description: apiErrorMessage(e, "Try again in a moment."), variant: "destructive" })
    }
  }

  // Admin verify: run the weekly team report now, bypassing the schedule. It
  // still only posts into channels that opted in, so zero reports is the
  // normal result right after enabling this and is said as such.
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

  const handleRebuildMemory = async () => {
    try {
      await rebuildAIMemory()
      toast({
        title: "Memory rebuild started",
        description: "Extracting knowledge from historical content. This runs in the background.",
      })
      // Optimistically reflect running state; the poller takes over.
      setBackfill({ state: "running", started_at: Math.floor(Date.now() / 1000) })
      void pollBackfill()
    } catch (e: unknown) {
      toast({ title: "Couldn't start the memory rebuild", description: apiErrorMessage(e, "Try again in a moment."), variant: "destructive" })
    }
  }

  const title = "Ambient agents"
  const description = "Automations that run in the background on the active models. The switches save as you make them."
  const off = !config?.enabled

  return (
    <ConfigGate title={title} description={description}>
      {(cfg) => (
        <SettingsSection title={title} description={description}>
          <SettingsList>
            <ConfigSwitchRow
              field="meeting_recap_enabled"
              request={setMeetingRecapEnabled}
              label="Meeting recaps"
              description="When a call ends, post a recap (summary, decisions, action items) from its transcript where the call happened. The call doesn't need to be recorded. Very short calls are skipped, and so are calls with transcription off. Any language in; the recap is in English."
              disabled={off}
            />
            {cfg.meeting_recap_enabled && (
              <ConfigSwitchRow
                field="meeting_notes_doc_enabled"
                request={setMeetingNotesDocEnabled}
                label="Also write a notes document"
                description="Put the recap and the full transcript in a document the people on the call can edit, as well as posting it. It is private to whoever was in the call, so share it if anyone else needs it."
                disabled={off}
              />
            )}
            {cfg.meeting_recap_enabled && (
              <div className="px-4 py-3">
                <RecapInstructionsField
                  initial={cfg.meeting_recap_instructions || ""}
                  disabled={off}
                  onSave={handleSaveRecapInstructions}
                />
              </div>
            )}
            <ConfigSwitchRow
              field="memory_layer_enabled"
              request={setMemoryLayerEnabled}
              label="Workspace memory"
              description="Keep pulling lasting decisions, commitments and open questions out of meetings, channels, direct messages and project threads into a searchable memory. It answers questions like “what did we decide, who owns it, what's still open”."
              disabled={off}
            />
            {/* Rebuild memory: a backfill over history, once the layer is on. */}
            {cfg.memory_layer_enabled && (
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
                  disabled={backfill?.state === "running" || off}
                  onClick={handleRebuildMemory}
                >
                  <Lightbulb className="mr-1.5 h-3.5 w-3.5" />
                  {backfill?.state === "running" ? "Rebuilding…" : "Rebuild"}
                </Button>
              </div>
            )}
            <ConfigSwitchRow
              field="team_report_enabled"
              request={setTeamReportEnabled}
              label="Weekly team report"
              description="Allow a weekly report in a channel: open decisions, commitments with their owners, and unanswered questions, from workspace memory. A channel stays quiet until its moderator turns the report on in its settings. Needs workspace memory."
              disabled={off || !cfg.memory_layer_enabled}
            />
            {/* Verify: the report posts into channels on a schedule; the email
                path is the opt-in per-member digest. Both, now. */}
            <div className="space-y-2 px-4 py-3">
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8"
                  disabled={runningReport || off || !cfg.memory_layer_enabled}
                  onClick={handleRunTeamReport}
                >
                  <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${runningReport ? "animate-spin" : ""}`} />
                  {runningReport ? "Running…" : "Post this week's reports now"}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8"
                  disabled={sendingDigest || off || !cfg.memory_layer_enabled}
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
            <ConfigSwitchRow
              field="nudges_enabled"
              request={setNudgesEnabled}
              label="Proactive nudges"
              description="Tell the right person, without being asked, about an overdue commitment or a question left open: it appears in their notifications as it happens. Needs workspace memory."
              disabled={off || !cfg.memory_layer_enabled}
            />
            <ConfigSwitchRow
              field="coworker_enabled"
              request={setCoworkerEnabled}
              label="AI coworker (@mention)"
              description="Let members @mention the AI in a channel and get an answer there, from that channel's recent messages and only what the person asking can see. It only replies when mentioned."
              disabled={off}
            />
            <ConfigSwitchRow
              field="issue_triage_enabled"
              request={setIssueTriageEnabled}
              label="GitHub auto-review"
              description="When an issue or pull request is opened on a linked repository, the AI reviews it against the code and comments on the linked task: a proposed fix for an issue, a review for a pull request. Nothing is pushed to GitHub. Off by default, since it uses one AI call per issue or pull request."
              disabled={off}
            />
          </SettingsList>
        </SettingsSection>
      )}
    </ConfigGate>
  )
}

// ─── Redaction (the Governance sub-page) ──────────────────────────────

/** What leaves this server: nothing (local-only), or prompts with personal details removed. */
export function RedactionPanel() {
  const { toast } = useToast()
  const { setConfig } = useAIConfig()
  const title = "Redaction"
  const description = "What reaches a model outside this server, if anything. Changes save as you make them."
  return (
    <ConfigGate title={title} description={description}>
      {(cfg) => (
        <SettingsSection title={title} description={description}>
          <SettingsList>
            <ConfigSwitchRow
              field="local_only_mode"
              request={setAILocalOnly}
              label="Local-only AI"
              locked={cfg.local_only_pinned_by_env ? "Set by whoever runs this server, by an environment variable, so it can't be changed here." : undefined}
              description="No workspace content leaves this server: every cloud AI provider (OpenAI, Anthropic, hosted endpoints) is blocked at the network layer, so prompts and documents only ever reach local models. Turn it on only once your chat, vision and embedding models all run locally."
            />
            <ConfigSwitchRow
              field="pii_redaction_enabled"
              request={setAIPIIRedaction}
              label="Redact personal details before cloud models"
              description="When a prompt goes to a cloud model, emails, phone numbers, card numbers, government IDs, IBANs and your own patterns are removed first. Local models get the content as it is, since nothing leaves the server. No effect while Local-only AI is on."
              disabled={cfg.local_only_mode}
            />
            {cfg.pii_redaction_enabled && !cfg.local_only_mode && (
              <div className="px-4 py-3">
                <PIIPatternsEditor
                  initial={cfg.pii_custom_patterns}
                  onSave={async (patterns) => {
                    await setAIPIIPatterns(patterns)
                    setConfig((c) => (c ? { ...c, pii_custom_patterns: patterns } : c))
                    toast({ title: "Your patterns are saved" })
                  }}
                />
              </div>
            )}
          </SettingsList>
        </SettingsSection>
      )}
    </ConfigGate>
  )
}

// ─── Usage (the Usage sub-page) ───────────────────────────────────────

/** Today's meters and the caps on them, each cap saved by its own Save. */
export function UsagePanel() {
  const { toast } = useToast()
  const { setConfig } = useAIConfig()
  const [usage, setUsage] = useState<AIUsage | null>(null)
  const readUsage = useCallback(async () => {
    try {
      setUsage(await getAIUsage())
    } catch {
      // Non-fatal; the meters simply won't render.
    }
  }, [])
  useEffect(() => {
    void readUsage()
  }, [readUsage])

  const title = "Budgets"
  const description = "Tokens used today across every AI feature, and the caps on them. Each cap saves with its own Save."
  return (
    <ConfigGate title={title} description={description}>
      {(cfg) => (
        <SettingsSection title={title} description={description}>
          {usage && <UsageRow usage={usage} />}
          <SettingsList>
            <RateLimitRow
              initial={cfg.rate_limit_per_min}
              onSave={async (n) => {
                await setAIRateLimit(n)
                setConfig((c) => (c ? { ...c, rate_limit_per_min: n } : c))
                toast({ title: "Rate limit updated" })
              }}
            />
            <TokenBudgetRow
              id="ai-ws-budget"
              label="Workspace daily token budget"
              hint="Caps total AI tokens spent across the workspace per day. 0 = unlimited."
              initial={cfg.workspace_daily_token_budget ?? 0}
              onSave={async (n) => {
                await setAIWorkspaceTokenBudget(n)
                setConfig((c) => (c ? { ...c, workspace_daily_token_budget: n } : c))
                await readUsage()
                toast({ title: "Workspace token budget updated" })
              }}
            />
            <TokenBudgetRow
              id="ai-user-budget"
              label="Per-user daily token budget"
              hint="Caps AI tokens spent by each individual user per day, so one person can't drain the workspace budget. 0 = unlimited."
              initial={cfg.user_daily_token_budget ?? 0}
              onSave={async (n) => {
                await setAIUserTokenBudget(n)
                setConfig((c) => (c ? { ...c, user_daily_token_budget: n } : c))
                await readUsage()
                toast({ title: "Per-user token budget updated" })
              }}
            />
          </SettingsList>
        </SettingsSection>
      )}
    </ConfigGate>
  )
}

/** Who and where today's spend goes, people with their avatars. */
export function TopConsumersPanel() {
  return (
    <SettingsSection title="Top consumers" description="Who spends the workspace's AI budget today, and in which channels, this UTC day.">
      <div className="grid gap-6 md:grid-cols-2">
        <TopConsumersRow />
        <TopChannelsRow />
      </div>
    </SettingsSection>
  )
}

// ─── Advanced (the Advanced sub-page) ─────────────────────────────────

const WEB_SEARCH_NAME: Record<string, string> = { searxng: "SearXNG", tavily: "Tavily", brave: "Brave Search" }

function onOff(on: boolean, detail?: string) {
  return on ? (detail ? `On · ${detail}` : "On") : "Off"
}

/** The summary each folded card shows on its title row. Exported for the guard. */
export function advancedSummaries(c: AIConfig) {
  const depth = CODE_DEPTH_PRESETS.reduce((best, p) =>
    Math.abs(p.value - (c.code_analysis_max_files || c.effective_code_analysis_max_files)) <
    Math.abs(best.value - (c.code_analysis_max_files || c.effective_code_analysis_max_files))
      ? p
      : best,
  )
  const sandboxCap = c.sandbox_workspace_daily_seconds || 0
  const prCap = c.code_pr_workspace_daily_minutes || 0
  return {
    tuning: `${(c.effective_context_window || 0).toLocaleString()} tokens · reasoning ${c.reasoning_enabled ? "on" : "off"}`,
    depth: depth.label,
    webSearch: onOff(c.web_search_enabled, WEB_SEARCH_NAME[c.web_search_provider]),
    sandbox: onOff(c.sandbox_enabled, sandboxCap > 0 ? `${sandboxCap.toLocaleString()} s a day` : "no daily cap"),
    codePRs: onOff(c.code_pr_enabled, prCap > 0 ? `${prCap.toLocaleString()} min a day` : "no daily cap"),
  }
}

/**
 * The settings few admins change, each a card folded to its title row with
 * what is in force on the right ("On · 3,600 s a day"); a click opens it.
 */
export function AdvancedPanels() {
  const { toast } = useToast()
  const { setConfig, refresh } = useAIConfig()
  const { modelsByProvider, modelsLoading, loadModels } = useProviderModels()
  return (
    <ConfigGate title="Advanced" description="Model tuning, analysis depth, web search, the sandbox and code pull requests.">
      {(cfg) => {
        const s = advancedSummaries(cfg)
        return (
          <div className="space-y-3">
            <CollapsibleCard id="ai-models-tuning" title="Model tuning" summary={s.tuning}>
              <SettingsList>
                <ConfigSwitchRow
                  field="reasoning_enabled"
                  request={setAIReasoning}
                  label="Reasoning mode"
                  description="Let reasoning models (gemma4, DeepSeek-R1, Qwen3 and others) think before answering. Better answers on hard questions, but noticeably slower, especially on servers without a GPU. Other models ignore this."
                  disabled={!cfg.enabled}
                />
                <ContextWindowRow
                  initial={cfg.context_window_tokens}
                  effective={cfg.effective_context_window}
                  onSave={async (n) => {
                    await setAIContextWindow(n)
                    setConfig((c) => (c ? { ...c, context_window_tokens: n } : c))
                    toast({ title: "Context window updated" })
                  }}
                />
              </SettingsList>
            </CollapsibleCard>
            <CollapsibleCard id="ai-models-depth" title="Code analysis depth" summary={s.depth}>
              <SettingsList>
                <CodeAnalysisRow
                  initial={cfg.code_analysis_max_files}
                  effective={cfg.effective_code_analysis_max_files}
                  onSave={async (n) => {
                    await setAICodeAnalysisMaxFiles(n)
                    setConfig((c) => (c ? { ...c, code_analysis_max_files: n } : c))
                    toast({ title: "Code analysis budget updated" })
                  }}
                />
              </SettingsList>
            </CollapsibleCard>
            <CollapsibleCard id="ai-models-web-search" title="Web search" summary={s.webSearch}>
              <WebSearchSection bare config={cfg} onChanged={refresh} />
            </CollapsibleCard>
            <CollapsibleCard id="ai-models-sandbox" title="Code analysis sandbox" summary={s.sandbox}>
              <SandboxSection bare config={cfg} onChanged={refresh} />
            </CollapsibleCard>
            <CollapsibleCard id="ai-models-code-prs" title="Code pull requests" summary={s.codePRs}>
              <div className="space-y-6">
                <CodePRSection
                  bare
                  config={cfg}
                  onChanged={refresh}
                  modelsByProvider={modelsByProvider}
                  modelsLoading={modelsLoading}
                  onEnsureModels={loadModels}
                />
                <CodePRReliabilityCard />
              </div>
            </CollapsibleCard>
          </div>
        )
      }}
    </ConfigGate>
  )
}

/**
 * A part of a folded card: in the card (`bare`), its words lead the body in
 * place of the section heading the card's title row already says.
 */
function Part({
  bare,
  title,
  description,
  action,
  children,
}: {
  bare?: boolean
  title: React.ReactNode
  description?: React.ReactNode
  action?: React.ReactNode
  children: React.ReactNode
}) {
  if (!bare) {
    return (
      <SettingsSection level={3} title={title} description={description} action={action}>
        {children}
      </SettingsSection>
    )
  }
  return (
    <div className="space-y-3">
      {(description || action) && (
        <div className="flex flex-col gap-2 px-4 pt-3 sm:flex-row sm:items-start sm:justify-between">
          {description && <p className="max-w-[60ch] text-xs text-muted-foreground text-pretty">{description}</p>}
          {action && <div className="flex shrink-0 items-center gap-2">{action}</div>}
        </div>
      )}
      {children}
    </div>
  )
}

// ─── Reindex progress ─────────────────────────────────────────────────

const ReindexBanner: React.FC<{ status: ReindexStatus }> = ({ status }) => {
  const pct = status.total > 0 ? Math.round(((status.processed + status.failed) / status.total) * 100) : 0
  return (
    <section data-settings-card="" className="set-card space-y-2 p-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">
          {status.running ? "Rebuilding the AI search index…" : "The AI search index is rebuilt"}
        </p>
        <span className="text-xs text-muted-foreground">
          {status.processed + status.failed} / {status.total} (dim {status.dimension})
        </span>
      </div>
      {/* The shared bar, which moves by transform: this one animated its
          width, a layout property, on every poll. */}
      <Progress
        value={pct}
        aria-label={`${status.running ? "Rebuilding" : "Rebuilt"} the AI search index: ${pct}%`}
        className="h-1.5"
      />
      <p className="text-xs text-muted-foreground">
        {status.running
          ? "Semantic search returns partial results until this completes. You can keep using the workspace."
          : status.message || "Done."}
        {status.failed > 0 ? ` ${status.failed} ${status.failed === 1 ? "item" : "items"} couldn't be indexed.` : ""}
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
  // Today's two meters as rows of one list, at the list's padding; the note
  // under it in the help size. It was a box of its own with a ruled footer.
  return (
    <div className="space-y-2">
      <SettingsList>
        <div className="px-4 py-3">
          <UsageMeterBar label="Workspace" used={ws.used} limit={ws.limit} />
        </div>
        <div className="px-4 py-3">
          <UsageMeterBar label="You" used={me.used} limit={me.limit} />
        </div>
      </SettingsList>
      {noCaps && <p className="text-xs text-muted-foreground">No daily caps yet. Set one below to limit spend.</p>}
      <p className="max-w-[65ch] text-xs text-muted-foreground text-pretty">
        Counts prompt and response tokens together, from each provider&apos;s reported usage where there is one and a
        calibrated estimate otherwise, and resets at midnight UTC. It is best-effort (a brief metering outage
        isn&apos;t counted) and can lag a little under heavy use; indexing for search is a separate cost. Treat it as
        a spend guardrail, not a billing meter.
      </p>
    </div>
  )
}

// ─── Where today's AI spend goes (admin-only) ─────────────────────────
// Who is spending the workspace's budget today, and in which channels, so an
// admin can set sensible caps. Read-only, best-effort (empty when Redis is
// unavailable), fetched when the tab opens, with a manual refresh. One shape
// for both: a title and Refresh on one row, a line, and a hairline list.
function SpendList({
  title,
  help,
  empty,
  icon,
  load,
  people,
}: {
  /** Each row is a person: an avatar leads it. */
  people?: boolean
  title: string
  help: string
  empty: string
  icon: React.ComponentType<{ className?: string }>
  load: () => Promise<{ key: string; name: string; used: number }[]>
}) {
  const headingId = useId()
  const [rows, setRows] = useState<{ key: string; name: string; used: number }[] | null>(null)
  const [failure, setFailure] = useState("")
  const [busy, setBusy] = useState(false)

  const read = useCallback(async () => {
    setBusy(true)
    try {
      setRows(await load())
      setFailure("")
    } catch (e) {
      // Said as a failure: it used to read as "nothing recorded yet".
      setFailure(apiErrorMessage(e, "Try again in a moment."))
    } finally {
      setBusy(false)
    }
  }, [load])

  useEffect(() => {
    void read()
  }, [read])

  const fmt = (n: number) => (Number.isFinite(n) ? n : 0).toLocaleString()

  return (
    <section aria-labelledby={headingId} className="min-w-0 space-y-2">
      <div className="flex items-center justify-between gap-3">
        <h4 id={headingId} className="text-sm font-medium">
          {title}
        </h4>
        <Button variant="ghost" size="sm" onClick={() => void read()} disabled={busy}>
          <RefreshCw className={busy ? "animate-spin" : undefined} aria-hidden="true" />
          {busy ? "Refreshing…" : "Refresh"}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground text-pretty">{help}</p>
      {failure && !rows ? (
        <ErrorState compact subject={title.toLowerCase()} detail={failure} onRetry={() => void read()} />
      ) : rows === null ? (
        <SectionListSkeleton label={`Loading ${title.toLowerCase()}`} rows={3} lines={1} />
      ) : rows.length === 0 ? (
        <div data-settings-card="" className="set-card">
          <EmptyState icon={icon as never} hue={ADMIN_GROUP_HUE.ai} title={empty} headingLevel={5} className="py-6" />
        </div>
      ) : (
        <ol data-settings-card="" className="set-card">
          {rows.map((r, i) => (
            <li key={r.key} data-spend-row="" className="ai-spend-row text-sm">
              <span className="flex min-w-0 items-center gap-3">
                <span className="w-4 shrink-0 text-right text-2xs tabular-nums text-ink-3">{i + 1}</span>
                {people ? <IdentityMark variant="avatar" id={avatarSeed(r.name)} label={r.name} size={24} /> : null}
                <span className="truncate">{r.name}</span>
              </span>
              <span className="shrink-0 tabular-nums text-muted-foreground">{fmt(r.used)} tokens</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}

const loadTopConsumers = async () => {
  const res = await getAIUserUsage(25)
  return (res?.users || []).map((u: AIUserUsageRow) => ({ key: u.user_id, name: u.full_name || u.name || u.user_id, used: u.used }))
}

const loadTopChannels = async () => {
  const res = await getAIChannelUsage(25)
  return (res?.channels || []).map((c: AIChannelUsageRow) => ({ key: c.channel_id, name: c.name ? `#${c.name}` : c.channel_id, used: c.used }))
}

const TopConsumersRow: React.FC = () => (
  <SpendList
    title="Top consumers today"
    help="Highest AI token spend per person, this UTC day. Use it to tune the per-person cap."
    empty="No AI use recorded yet today"
    icon={Users}
    load={loadTopConsumers}
    people
  />
)

const TopChannelsRow: React.FC = () => (
  <SpendList
    title="Top channels today"
    help="Where AI spend goes per channel, this UTC day. Set a channel's cap from its members dialog."
    empty="No channel AI use recorded yet today"
    icon={Hash}
    load={loadTopChannels}
  />
)

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
    <div className="space-y-2">
      <Label htmlFor="pii-patterns" className="text-sm font-medium">
        Your own patterns
      </Label>
      <p className="text-xs text-muted-foreground">One regular expression per line, removed as well as the ones built in.</p>
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
                title: "Couldn't save your patterns",
                description: apiErrorMessage(e, "Try again in a moment."),
                variant: "destructive",
              })
            } finally {
              setBusy(false)
            }
          }}
        >
          <Save /> Save patterns
        </Button>
      </div>
    </div>
  )
}

// ─── The caps: setting rows, each a field and its own Save ────────────
// They were bordered boxes with a bold label, a field under it and Save at the
// box's foot; they are rows of one list now, the field and Save at the row's
// end when the row is wide, one width, so the fields start on one line.
const capField = "w-full @xl:w-40"
const capSave = "h-11 shrink-0 md:h-9"

function SaveCap({ disabled, onSave }: { disabled: boolean; onSave: () => Promise<void> }) {
  const [busy, setBusy] = useState(false)
  return (
    <Button
      variant="outline"
      size="sm"
      className={capSave}
      disabled={disabled || busy}
      onClick={async () => {
        setBusy(true)
        try {
          await onSave()
        } finally {
          setBusy(false)
        }
      }}
    >
      <Save /> Save
    </Button>
  )
}

const RateLimitRow: React.FC<{ initial: number; onSave: (n: number) => Promise<void> }> = ({ initial, onSave }) => {
  const [value, setValue] = useState(initial)
  const dirty = value !== initial
  return (
    <SettingRow label="Per-person rate limit" description="The most AI requests one person can make in a minute." controlId="ai-rate">
      <Input
        id="ai-rate"
        type="number"
        min={1}
        max={10000}
        value={value}
        aria-describedby="ai-rate-desc"
        onChange={(e) => setValue(parseInt(e.target.value || "0", 10))}
        className={capField}
      />
      <SaveCap disabled={!dirty || value < 1} onSave={() => onSave(value)} />
    </SettingRow>
  )
}

// ─── Daily token budget inline editor ─────────────────────────────────
// Edits one daily AI token cap (0 = unlimited).
const TokenBudgetRow: React.FC<{
  id: string
  label: string
  hint: string
  initial: number
  onSave: (n: number) => Promise<void>
}> = ({ id, label, hint, initial, onSave }) => {
  const safeInitial = Number.isFinite(initial) ? initial : 0
  const [value, setValue] = useState(safeInitial)
  useEffect(() => setValue(safeInitial), [safeInitial])
  const dirty = value !== safeInitial
  return (
    <SettingRow
      label={label}
      controlId={id}
      description={
        <>
          {hint} <span className="text-foreground">{value === 0 ? "Unlimited." : `${value.toLocaleString()} tokens a day.`}</span>
        </>
      }
    >
      <Input
        id={id}
        type="number"
        min={0}
        step={1000}
        value={value}
        aria-describedby={`${id}-desc`}
        onChange={(e) => setValue(Math.max(0, parseInt(e.target.value || "0", 10)))}
        className={capField}
      />
      <SaveCap disabled={!dirty || value < 0} onSave={() => onSave(value)} />
    </SettingRow>
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
  const dirty = value !== initial
  const invalid = value !== 0 && (value < 2048 || value > 1_000_000)
  return (
    <SettingRow
      label="Context window"
      controlId="ai-ctx"
      description={
        <>
          The most tokens the chat model can use per request; match your model (8192, 32768). 0 uses the server
          default. In force now: <span className="tabular-nums text-foreground">{effective.toLocaleString()}</span> tokens.
          {invalid && (
            <span className="mt-1 block font-medium text-danger-ink">Use 0 for the default, or a value from 2048 to 1000000.</span>
          )}
        </>
      }
    >
      <Input
        id="ai-ctx"
        type="number"
        min={0}
        max={1_000_000}
        step={1024}
        value={value}
        aria-invalid={invalid || undefined}
        aria-describedby="ai-ctx-desc"
        onChange={(e) => setValue(parseInt(e.target.value || "0", 10))}
        className={capField}
      />
      <SaveCap disabled={!dirty || invalid} onSave={() => onSave(value)} />
    </SettingRow>
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

  // A choice of one, saved the moment it is picked: the house segmented
  // control, in a row of the tuning list, saying so in its help.
  return (
    <SettingRow
      label="Code analysis depth"
      controlId="code-depth"
      description="How many files of a repository the bug-analysis agent reads per run. More is better grounded but slower, and the cost stays within your model's context window. Saves when you pick one."
    >
      <SegmentedControl
        id="code-depth"
        aria-label="Code analysis depth"
        aria-describedby="code-depth-desc"
        value={String(current)}
        onValueChange={(v) => void pick(Number(v))}
        disabled={busy}
        options={CODE_DEPTH_PRESETS.map((p) => ({ value: String(p.value), label: p.label, title: p.hint }))}
        className="w-full flex-nowrap @xl:w-auto"
        itemClassName="flex-1 @xl:flex-none"
      />
    </SettingRow>
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
        description: visionProvider && visionModel ? `${visionModel} will analyse images.` : "Image analysis is disabled.",
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

  // Three rows of one list, each picker's note inside its row: they were three
  // bordered boxes, two with a loose line under the box.
  return (
    <SettingsSection title="Active models" description="Chat, embeddings and vision can each use a different provider.">
      <SettingsList>
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
          note={
            <p className="text-xs text-warning-ink">
              The search index is {config.embedding_dimension} wide now. A model with a different dimension rebuilds it.
            </p>
          }
        />

      {/* Vision model (optional) */}
        <ModelSelectorRow
          title="Vision model (optional)"
          hint="Lets the AI analyse images and GIFs. Pick a multimodal model (e.g. gpt-4o, a Claude vision model, or local llava / llama3.2-vision). Leave unset to keep image analysis off. Text documents do not need this."
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
              <Button variant="outline" className="h-11 md:h-8" onClick={turnOffVision} disabled={savingVision}>
                Turn off
              </Button>
            ) : undefined
          }
          note={
            config.vision_model ? (
              <p className="text-xs text-muted-foreground">
                In use: <span className="font-medium text-foreground">{config.vision_model}</span>.
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">No vision model set, so images aren&apos;t analysed.</p>
            )
          }
        />
      </SettingsList>
    </SettingsSection>
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
  /** A line about what is in force, under the controls, inside the row. */
  note?: React.ReactNode
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
  note,
}) => {
  const id = useId()
  return (
    <div className="space-y-3 px-4 py-3">
      <div className="space-y-1">
        <p className="text-sm font-medium leading-5">{title}</p>
        <p className="text-xs text-muted-foreground text-pretty">{hint}</p>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[180px]">
          <Label htmlFor={`${id}-provider`} className="text-xs">Provider</Label>
          <Select value={providerId} onValueChange={onProviderChange}>
            <SelectTrigger id={`${id}-provider`}><SelectValue placeholder="Choose a provider" /></SelectTrigger>
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

        <Button variant="outline" className="h-11 md:h-8" onClick={onSave} disabled={saving || !providerId || !model}>
          <Save /> {saving ? "Saving…" : "Set active"}
        </Button>
      </div>
      {note}
    </div>
  )
}

// ─── Providers section (CRUD + local install) ─────────────────────────

const ProvidersSection: React.FC<SectionProps & { stats: SystemStats | null; title: React.ReactNode }> = ({
  config,
  modelsByProvider,
  modelsLoading,
  stats,
  title,
  onEnsureModels,
  onChanged,
}) => {
  const { toast } = useToast()
  const [showAdd, setShowAdd] = useState(false)

  return (
    <SettingsSection
      title={title}
      description={AI_DESCRIPTION}
      action={
        <Button size="sm" variant="outline" className={sectionActionClass} onClick={() => setShowAdd(true)}>
          <Plus /> Add custom endpoint
        </Button>
      }
    >
      {showAdd && (
        <ProviderEditor
          createMode
          onClose={() => setShowAdd(false)}
          onChanged={onChanged}
        />
      )}

      {/* A card per provider (admin §A15, Models): its mark, its name, its
          address in mono, its state and Configure. They were rows of one
          bordered box. */}
      <div className="space-y-3" data-provider-cards="">
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
    </SettingsSection>
  )
}


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
    <div className="space-y-1">
      <Label htmlFor="recap-instructions" className="text-sm font-medium">Recap instructions (optional)</Label>
      <p className="mb-2 text-xs text-muted-foreground text-pretty">
        Tailor what the recap emphasises. These are added to the recap prompt and can&apos;t override its
        grounding rules (it always uses only the transcript). Example: &quot;Add a Risks section and write the
        recap in Spanish.&quot;
      </p>
      <Textarea
        id="recap-instructions"
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
  bare,
}: {
  bare?: boolean
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
  // The stored key stays with the provider and address it was given for. With
  // no provider it goes nowhere; "Remove it" sends none, for a SearXNG that
  // takes no key.
  const [clearKey, setClearKey] = useState(false)
  const keyReentry = useSecretReentry({
    stored: !!config.has_web_search_key && realProvider !== "" && !clearKey,
    entered: apiKey,
    from: { url: config.web_search_base_url || "", how: [config.web_search_provider || ""] },
    to: { url: baseURL.trim(), how: [realProvider] },
    noun: "API key",
  })
  const needsKey = realProvider === "tavily" || realProvider === "brave" || keyReentry.required
  const needsBase = realProvider === "searxng"

  // The switch and the fields wait for Save, so the save bar says so while
  // anything differs from what is stored. They used to look like the switches
  // above, which save the moment they are touched, and an admin who turned
  // web search on and left had changed nothing.
  const dirty =
    provider !== (config.web_search_provider || "none") ||
    baseURL !== (config.web_search_base_url || "") ||
    apiKey !== "" ||
    clearKey ||
    enabled !== config.web_search_enabled
  const reset = () => {
    setProvider(config.web_search_provider || "none")
    setBaseURL(config.web_search_base_url || "")
    setApiKey("")
    setClearKey(false)
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
    if (!keyReentry.check()) return
    setSaving(true)
    try {
      await setWebSearch({
        provider: realProvider,
        base_url: baseURL.trim(),
        api_key: apiKey.trim() || undefined,
        clear_key: clearKey && !apiKey.trim() ? true : undefined,
        enabled: realProvider !== "" && enabled,
      })
      setApiKey("")
      setClearKey(false)
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

  // A section of the Models section with one list, where it was a box holding
  // a switch, fields and a save bar.
  return (
    <Part
      bare={bare}
      title="Web search"
      description="Let the AI assistant and agents look up current information on the web. Run your own SearXNG (it stays on your servers and works in local-only mode), or use Tavily or Brave. Changes wait for Save."
    >
      <SettingsList>
      <SwitchRow
        label="Use web search"
        description={realProvider === "" ? "Choose a provider first." : "Off until you turn it on and save."}
        checked={enabled && realProvider !== ""}
        disabled={saving || realProvider === ""}
        onChange={setEnabled}
      />

      <div className="grid grid-cols-1 gap-3 px-4 py-3 sm:grid-cols-2">
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
        <div className="space-y-1 px-4 py-3">
          <Label htmlFor={`${id}-key`} className="text-xs">API key</Label>
          <Input
            {...keyReentry.inputProps}
            id={`${id}-key`}
            type="password"
            autoComplete="new-password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={
              keyReentry.placeholder ?? (config.has_web_search_key ? "Saved: leave empty to keep it" : "The provider's API key…")
            }
          />
          {keyReentry.note}
          {keyReentry.required && realProvider === "searxng" && (
            <button
              type="button"
              className="text-xs font-medium text-muted-foreground underline-offset-[3px] hover:text-foreground hover:underline"
              onClick={() => setClearKey(true)}
            >
              Remove it: this SearXNG takes no key
            </button>
          )}
        </div>
      )}
      {clearKey && (
        <p className="px-4 py-3 text-xs text-muted-foreground">The saved key is removed when you save.</p>
      )}
      </SettingsList>

      <SaveBar dirty={dirty} saving={saving} what="web search changes" onSave={() => void save()} onDiscard={reset} />
    </Part>
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
  bare,
}: {
  bare?: boolean
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
  // The stored token stays with the runner it was given for.
  const tokenReentry = useSecretReentry({
    stored: !!config.has_sandbox_runner_token && runnerURL.trim() !== "",
    entered: runnerToken,
    from: { url: config.sandbox_runner_url || "" },
    to: { url: runnerURL.trim() },
    noun: "runner token",
  })

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
    if (!tokenReentry.check()) return
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
    <Part
      bare={bare}
      title="Code analysis sandbox"
      description="Let agents run bounded data analysis and render charts in an isolated code runner with no network, no credentials, a throwaway filesystem and hard CPU, memory and time limits. Every run is checked against the agent owner's permissions and counted against the limits below. Changes wait for Save."
    >
      <SettingsList>
      <SwitchRow
        label="Use the code analysis sandbox"
        description={runnerURL.trim() ? "Off until you turn it on and save." : "Deploy a runner and enter its address first."}
        checked={enabled}
        disabled={saving || !runnerURL.trim()}
        onChange={setEnabled}
      />

      <div className="grid grid-cols-1 gap-3 px-4 py-3 sm:grid-cols-2">
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
            {...tokenReentry.inputProps}
            id={`${id}-token`}
            type="password"
            autoComplete="new-password"
            value={runnerToken}
            onChange={(e) => setRunnerToken(e.target.value)}
            placeholder={
              tokenReentry.placeholder ??
              (config.has_sandbox_runner_token ? "Saved: leave empty to keep it" : "The token the runner shares…")
            }
          />
          {tokenReentry.note}
        </div>
      </div>

      <div className="space-y-1 px-4 py-3">
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

      <div className="px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
          <p className="text-sm font-medium">Daily limits <span className="font-normal text-muted-foreground">0 means no limit</span></p>
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

      <div className="space-y-3 px-4 py-3">
        <RunnerTestStatus probe={probe} />
        <div className="flex flex-wrap items-center gap-2">
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
      </SettingsList>

      <SaveBar dirty={dirty} saving={saving} what="sandbox changes" onSave={() => void save()} onDiscard={reset} />
    </Part>
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
  bare,
  config,
  onChanged,
  modelsByProvider,
  modelsLoading,
  onEnsureModels,
}: {
  bare?: boolean
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
  // The stored token stays with the runner it was given for.
  const tokenReentry = useSecretReentry({
    stored: !!config.has_code_pr_runner_token && runnerURL.trim() !== "",
    entered: runnerToken,
    from: { url: config.code_pr_runner_url || "" },
    to: { url: runnerURL.trim() },
    noun: "runner token",
  })

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
    if (!tokenReentry.check()) return
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
    <Part
      bare={bare}
      title="Code pull requests"
      description="Let an agent that is mentioned or given a task change a linked repository and open a verified pull request for review, from an isolated code runner whose only network access is your git host. The agent never merges: every pull request goes through your usual review and checks. Changes wait for Save."
    >
      <SettingsList>
      <SwitchRow
        label="Use code pull requests"
        description={runnerURL.trim() ? "Off until you turn it on and save." : "Deploy a coding runner and enter its address first."}
        checked={enabled}
        disabled={saving || !runnerURL.trim()}
        onChange={setEnabled}
      />

      <div className="grid grid-cols-1 gap-3 px-4 py-3 sm:grid-cols-2">
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
            {...tokenReentry.inputProps}
            id={`${id}-token`}
            type="password"
            autoComplete="new-password"
            value={runnerToken}
            onChange={(e) => setRunnerToken(e.target.value)}
            placeholder={
              tokenReentry.placeholder ??
              (config.has_code_pr_runner_token ? "Saved: leave empty to keep it" : "The token the runner shares…")
            }
          />
          {tokenReentry.note}
        </div>
      </div>

      <div className="space-y-1 px-4 py-3">
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

      <SettingRow label="If a change goes beyond the task" controlId={`${id}-policy`}>
        <Select value={policy} onValueChange={setPolicy}>
          <SelectTrigger id={`${id}-policy`} className="w-full @xl:w-72">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="flag_open">Open the PR, flagged with the concern</SelectItem>
            <SelectItem value="pause">Pause and ask a human</SelectItem>
          </SelectContent>
        </Select>
      </SettingRow>
      <SwitchRow
        label="Open a draft when it can't verify"
        description="A clearly labelled draft instead of nothing, when the build or tests can't be made to pass."
        checked={draftOnRed}
        onChange={setDraftOnRed}
      />
      {/* A row of the list like the others: it was a box inside the box. */}
      <SwitchRow
        label="Allow any repository the agent can access"
        description="When on, the agent can open a pull request on any repository the connected GitHub account can reach (checked on every run), not only those linked to a project. Leave it off to keep it to linked repositories: the safer choice when that account can see repositories beyond this workspace."
        checked={allowUnlinked}
        onChange={setAllowUnlinked}
      />

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
              <Button variant="outline" className="h-11 md:h-8" onClick={clearCodeRunModel} disabled={savingCodeRunModel}>
                Use chat model
              </Button>
            ) : undefined
          }
          note={
            <p className="text-xs text-muted-foreground">
              {config.code_pr_chat_model ? (
                <>
                  Coding runs use <span className="font-medium text-foreground">{config.code_pr_chat_model}</span>.
                </>
              ) : (
                <>No model of its own, so coding runs use the chat model.</>
              )}
            </p>
          }
        />

      <div className="space-y-1 px-4 py-3">
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

      <div className="px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
          <p className="text-sm font-medium">Daily limits <span className="font-normal text-muted-foreground">0 means no limit</span></p>
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

      <div className="space-y-3 px-4 py-3">
        <RunnerTestStatus probe={probe} />
        <div className="flex flex-wrap items-center gap-2">
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
      </SettingsList>

      <SaveBar dirty={dirty} saving={saving} what="code pull request changes" onSave={() => void save()} onDiscard={reset} />
    </Part>
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
      setError(apiErrorMessage(e, "Try again in a moment."))
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
    <SettingsSection
      level={3}
      title="Coding agent reliability"
      description="How the coding agent really performs: how often it opens, verifies and stays in scope, how many are drafts, and how often your reviewers merge. It reads unproven until there are enough runs to judge, so it never over-claims."
      action={
        <Button size="sm" variant="ghost" className={sectionActionClass} onClick={() => void load()} disabled={loading}>
          <RefreshCw className={loading ? "animate-spin" : undefined} aria-hidden="true" />
          Refresh
        </Button>
      }
    >
      {error && !data ? (
        <ErrorState compact subject="the coding scorecard" detail={error} onRetry={() => void load()} />
      ) : loading && !data ? (
        <SectionListSkeleton label="Loading the coding scorecard" rows={3} lines={1} />
      ) : !data || data.total === 0 ? (
        <div data-settings-card="" className="set-card">
          <EmptyState
            icon={GitPullRequest}
            hue={ADMIN_GROUP_HUE.ai}
            title="No coding runs yet"
            description="Once the agent opens pull requests, this scorecard fills in and grades itself."
            className="py-6"
          />
        </div>
      ) : (
        <>
          <p className="flex flex-wrap items-center gap-2 text-sm">
            {(() => {
              const g = gradeBadge(data.grade)
              return <Badge className={`${g.cls} border-transparent`}>{g.label}</Badge>
            })()}
            <span className="text-muted-foreground">
              {data.total} run{data.total === 1 ? "" : "s"}
              {data.total < data.min_sample ? `, ${data.min_sample} needed to grade` : ""}
            </span>
          </p>

          {/* Property rows on one label column, where they were seven stat tiles. */}
          <dl data-settings-card="" className="set-card divide-y divide-border">
            <Metric
              label="Merge rate"
              value={data.outcome_known > 0 ? pct(data.merge_rate) : "None yet"}
              sub={`${data.merged + data.merged_with_edits} of ${data.outcome_known} decided`}
            />
            <Metric label="Opened a PR" value={pct(data.open_rate)} sub={`${data.opened} of ${data.total}`} />
            <Metric label="Verified" value={data.opened > 0 ? pct(data.verify_rate) : "None yet"} sub={`${data.verified} of ${data.opened}`} />
            <Metric label="Had tests" value={data.opened > 0 ? pct(data.with_tests / data.opened) : "None yet"} sub={`${data.with_tests} of ${data.opened}`} />
            <Metric label="In scope" value={data.opened > 0 ? pct(data.in_scope_rate) : "None yet"} sub={`${data.in_scope} of ${data.opened}`} />
            <Metric label="Drafts" value={data.opened > 0 ? pct(data.draft_rate) : "None yet"} sub={`${data.draft} of ${data.opened}`} />
            <Metric
              label="Closed unmerged"
              value={String(data.closed)}
              sub={data.outcome_known > 0 ? `of ${data.outcome_known} decided` : "none decided"}
            />
          </dl>

          {runs.length > 0 && (
            <section aria-label="Recent runs" className="space-y-2">
              <p className="text-sm font-medium">Recent runs</p>
              <div data-settings-card="" className="set-card divide-y divide-border">
                {runs.map((run) => (
                  <CodePRRunRow key={run.id} run={run} />
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </SettingsSection>
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
    <div className="flex items-center justify-between gap-3 px-4 py-2.5 text-xs">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <Badge className={`${badge.cls} border-transparent`}>{badge.label}</Badge>
          <span className="truncate font-medium">{run.repo || "No repository"}</span>
        </div>
        {run.message ? (
          <p className="mt-0.5 truncate text-xs text-muted-foreground">{run.message}</p>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-3 text-xs text-muted-foreground">
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

// Metric is one property row of the scorecard: a label column, the value, and
// its denominator in the help ink. It was a stat tile, seven to a grid.
function Metric({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className={fieldRow("center", "px-4 py-2.5")}>
      <dt className={fieldLabel}>{label}</dt>
      <dd className="flex items-baseline gap-2 text-sm tabular-nums">
        <span className="font-medium">{value}</span>
        {sub ? <span className="text-xs text-muted-foreground">{sub}</span> : null}
      </dd>
    </div>
  )
}
