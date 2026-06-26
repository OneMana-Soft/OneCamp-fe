/**
 * AI model-management service — wraps the /admin/ai/* endpoints.
 *
 * OneCamp's AI is model-agnostic: an admin can run local models via
 * Ollama, use OpenAI / Anthropic with their own key, or point at any
 * OpenAI-compatible custom endpoint (vLLM, LM Studio, OpenRouter, a
 * self-hosted llama.cpp server, ...). This service drives the admin
 * AIModelsCard UI.
 *
 * Single-tenant: there is one global AI configuration.
 */

import axiosInstance from "@/lib/axiosInstance"
import { GetEndpointUrl, PostEndpointUrl } from "@/services/endPoints"
import { authedStreamFetch } from "@/lib/utils/streamFetch"

export type ProviderKind = "ollama" | "openai" | "anthropic" | "openai_compatible"

export interface ProviderView {
  id: string
  kind: ProviderKind
  label: string
  base_url: string
  has_api_key: boolean
  enabled: boolean
  is_builtin: boolean
  insecure_tls: boolean
  updated_at?: string
}

export interface ModelView {
  id: string
  installed: boolean
  size_bytes?: number
  embedding?: boolean
}

export type CatalogCapability = "chat" | "embedding" | "vision" | "code" | "tools" | "reasoning"

export type CatalogFit = "ok" | "tight" | "risky" | ""

export interface CatalogModelView {
  tag: string
  family: string
  display_name: string
  description: string
  parameters: string
  size_bytes: number
  min_ram_bytes: number
  capabilities: CatalogCapability[]
  recommended: boolean
  installed: boolean
  fit?: CatalogFit
  fit_reason?: string
}

export interface OllamaCatalog {
  provider_id: string
  models: CatalogModelView[]
}

export interface AIConfig {
  enabled: boolean
  rate_limit_per_min: number
  providers: ProviderView[]
  chat_provider_id: string
  chat_model: string
  embedding_provider_id: string
  embedding_model: string
  embedding_dimension: number
  vision_provider_id: string
  vision_model: string
  context_window_tokens: number
  effective_context_window: number
  workspace_daily_token_budget: number
  user_daily_token_budget: number
  reasoning_enabled: boolean
  meeting_recap_enabled: boolean
  memory_layer_enabled: boolean
  team_report_enabled: boolean
  nudges_enabled: boolean
  coworker_enabled: boolean
  issue_triage_enabled: boolean
  code_analysis_max_files: number
  effective_code_analysis_max_files: number
  circuit_state: string
}

export interface SystemStats {
  disk_path: string
  disk_total_bytes: number
  disk_free_bytes: number
  disk_used_percent: number
  mem_total_bytes: number
  mem_available_bytes: number
  mem_used_percent: number
  cpu_count: number
  cpu_used_percent?: number
  warnings?: string[]
  ollama_version?: string
  ollama_latest_version?: string
  ollama_update_available?: boolean
}

export interface ReindexStatus {
  running: boolean
  total: number
  processed: number
  failed: number
  dimension: number
  started_at?: string
  message?: string
}

export interface TestConnectionResult {
  ok: boolean
  message: string
  models?: ModelView[]
}

export interface PullProgress {
  status?: string
  total?: number
  completed?: number
  done?: boolean
  error?: string
  update_required?: boolean
}

// PullResult is the TERMINAL outcome of a model pull, derived from the SSE
// stream rather than merely "the connection closed". This is what callers
// must key their success/failure UI off — a closed stream alone does NOT mean
// the model installed (Ollama returns HTTP 200 then streams an error frame for
// an invalid tag, and an unreachable daemon produces an error frame too).
export interface PullResult {
  ok: boolean // true ONLY when Ollama emitted a terminal success
  error?: string // populated when ok=false
  updateRequired?: boolean // Ollama server too old for this model
}

export interface MemoryBackfillStatus {
  state: "idle" | "running" | "completed" | "failed"
  started_at?: number
  finished_at?: number
  scopes_total?: number
  scopes_done?: number
  items_extracted?: number
  error?: string
}

// ─── Reads ────────────────────────────────────────────────────────────

export async function getAIConfig(): Promise<AIConfig> {
  const res = await axiosInstance.get(GetEndpointUrl.GetAIConfig)
  return res.data?.data
}

export async function getAISystemStats(): Promise<SystemStats> {
  const res = await axiosInstance.get(GetEndpointUrl.GetAISystemStats)
  return res.data?.data
}

export async function getReindexStatus(): Promise<ReindexStatus> {
  const res = await axiosInstance.get(GetEndpointUrl.GetAIReindexStatus)
  return res.data?.data
}

// AI token usage for the current UTC day. `limit` of 0 means unlimited.
export interface AIUsageMeter {
  used: number
  limit: number
}
export interface AIUsage {
  day: string
  workspace: AIUsageMeter
  user: AIUsageMeter
}

export async function getAIUsage(): Promise<AIUsage> {
  const res = await axiosInstance.get(GetEndpointUrl.GetAIUsage)
  return res.data?.data
}

export async function listProviderModels(providerId: string, refresh = false): Promise<ModelView[]> {
  const url = `${GetEndpointUrl.GetAIProviderModels}/${encodeURIComponent(providerId)}/models${refresh ? "?refresh=true" : ""}`
  const res = await axiosInstance.get(url)
  return res.data?.data?.models ?? []
}

/**
 * Fetch the curated, installable Ollama model catalog for a local provider,
 * annotated with live installed-state and server-resource feasibility.
 *
 * The catalog is a merge of an embedded baseline and an optional hosted
 * manifest (AI_OLLAMA_CATALOG_URL) so it stays current with newly-published
 * models without a redeploy. `refresh=true` forces the backend to re-fetch the
 * remote manifest (bypassing its cache) — used by the "refresh" action.
 */
export async function getOllamaCatalog(providerId: string, refresh = false): Promise<OllamaCatalog> {
  const url = `${GetEndpointUrl.GetAIOllamaCatalog}/${encodeURIComponent(providerId)}/catalog${refresh ? "?refresh=true" : ""}`
  const res = await axiosInstance.get(url)
  return res.data?.data
}

// ─── Provider mutations ─────────────────────────────────────────────────

export interface CreateProviderInput {
  label: string
  base_url: string
  api_key?: string
  insecure_tls?: boolean
}

export async function createProvider(input: CreateProviderInput): Promise<ProviderView> {
  const res = await axiosInstance.post(PostEndpointUrl.CreateAIProvider, input)
  return res.data?.data
}

export interface UpdateProviderInput {
  label?: string
  base_url?: string
  enabled?: boolean
  api_key?: string // omit = keep, "" = clear, value = set
  insecure_tls?: boolean
}

export async function updateProvider(providerId: string, input: UpdateProviderInput): Promise<ProviderView> {
  const res = await axiosInstance.patch(
    `${PostEndpointUrl.UpdateAIProvider}/${encodeURIComponent(providerId)}`,
    input,
  )
  return res.data?.data
}

export async function deleteProvider(providerId: string): Promise<void> {
  await axiosInstance.delete(`${PostEndpointUrl.DeleteAIProvider}/${encodeURIComponent(providerId)}`)
}

export interface TestConnectionInput {
  provider_id?: string
  kind?: ProviderKind
  base_url?: string
  api_key?: string
  insecure_tls?: boolean
}

export async function testConnection(input: TestConnectionInput): Promise<TestConnectionResult> {
  const res = await axiosInstance.post(PostEndpointUrl.TestAIProvider, input)
  return res.data?.data
}
// ─── Active selection ────────────────────────────────────────────────────

export async function setChatModel(providerId: string, model: string): Promise<void> {
  await axiosInstance.post(PostEndpointUrl.SetAIChatModel, { provider_id: providerId, model })
}

// Sets or clears the optional vision (multimodal) model used for image
// analysis. Passing empty strings clears the selection (image analysis off).
export async function setVisionModel(providerId: string, model: string): Promise<void> {
  await axiosInstance.post(PostEndpointUrl.SetAIVisionModel, { provider_id: providerId, model })
}

/**
 * Set the active embedding model. If `dimension` differs from the current
 * index dimension, the backend rejects with HTTP 409 unless `reindex` is
 * true. The caller should surface a confirmation then retry with
 * reindex=true.
 */
export async function setEmbeddingModel(
  providerId: string,
  model: string,
  dimension: number,
  reindex = false,
): Promise<void> {
  await axiosInstance.post(PostEndpointUrl.SetAIEmbeddingModel, {
    provider_id: providerId,
    model,
    dimension,
    reindex,
  })
}

export async function setAIEnabled(enabled: boolean): Promise<void> {
  await axiosInstance.post(PostEndpointUrl.SetAIEnabled, { enabled })
}

export async function setAIRateLimit(rateLimitPerMin: number): Promise<void> {
  await axiosInstance.post(PostEndpointUrl.SetAIRateLimit, { rate_limit_per_min: rateLimitPerMin })
}

// Set the model context window (tokens). 0 = use the server env/default.
export async function setAIContextWindow(contextWindowTokens: number): Promise<void> {
  await axiosInstance.post(PostEndpointUrl.SetAIContextWindow, { context_window_tokens: contextWindowTokens })
}

// Set the workspace-wide daily AI token cap (0 = unlimited).
export async function setAIWorkspaceTokenBudget(tokens: number): Promise<void> {
  await axiosInstance.post(PostEndpointUrl.SetAIWorkspaceTokenBudget, { tokens })
}

// Set the per-user daily AI token cap (0 = unlimited).
export async function setAIUserTokenBudget(tokens: number): Promise<void> {
  await axiosInstance.post(PostEndpointUrl.SetAIUserTokenBudget, { tokens })
}

// Set the code-agent per-analysis file budget. 0 = use the built-in default.
export async function setAICodeAnalysisMaxFiles(maxFiles: number): Promise<void> {
  await axiosInstance.post(PostEndpointUrl.SetAICodeAnalysisMaxFiles, { max_files: maxFiles })
}

// Toggle "thinking"/reasoning mode for reasoning-capable models. false = faster.
export async function setAIReasoning(enabled: boolean): Promise<void> {
  await axiosInstance.post(PostEndpointUrl.SetAIReasoning, { enabled })
}

export async function setMeetingRecapEnabled(enabled: boolean): Promise<void> {
  await axiosInstance.post(PostEndpointUrl.SetAIMeetingRecap, { enabled })
}

export async function setMemoryLayerEnabled(enabled: boolean): Promise<void> {
  await axiosInstance.post(PostEndpointUrl.SetAIMemoryLayer, { enabled })
}

export async function setTeamReportEnabled(enabled: boolean): Promise<void> {
  await axiosInstance.post(PostEndpointUrl.SetAITeamReport, { enabled })
}

// Admin verify: run the weekly team report immediately (posts into active
// channels), bypassing the Monday/hour schedule and the idempotency lock.
export async function runTeamReportNow(): Promise<{ posted: number; processed: number; msg: string }> {
  const res = await axiosInstance.post(PostEndpointUrl.RunAITeamReport, {})
  return {
    posted: res.data?.data?.posted ?? 0,
    processed: res.data?.data?.processed ?? 0,
    msg: res.data?.msg ?? "",
  }
}

// Admin verify: email the calling admin a one-off open-items digest now.
export async function sendTestDigest(): Promise<string> {
  const res = await axiosInstance.post(PostEndpointUrl.SendAITestDigest, {})
  return res.data?.msg ?? "Test digest sent."
}

export async function setNudgesEnabled(enabled: boolean): Promise<void> {
  await axiosInstance.post(PostEndpointUrl.SetAINudges, { enabled })
}

export async function setCoworkerEnabled(enabled: boolean): Promise<void> {
  await axiosInstance.post(PostEndpointUrl.SetAICoworker, { enabled })
}

export async function setIssueTriageEnabled(enabled: boolean): Promise<void> {
  await axiosInstance.post(PostEndpointUrl.SetAIIssueTriage, { enabled })
}

// ─── Authorized models (admin allowlist) ──────────────────────────────────

export interface AuthorizedModel {
  id: string
  provider_id: string
  provider_kind: string
  provider_label: string
  model: string
  label: string
  enabled: boolean
  provider_enabled: boolean
  updated_at?: string
}

export async function getAuthorizedModels(): Promise<AuthorizedModel[]> {
  const res = await axiosInstance.get(GetEndpointUrl.GetAIAuthorizedModels)
  return res.data?.data ?? []
}

export async function authorizeModel(providerId: string, model: string, label = ""): Promise<AuthorizedModel> {
  const res = await axiosInstance.post(PostEndpointUrl.AuthorizeAIModel, {
    provider_id: providerId,
    model,
    label,
  })
  return res.data?.data
}

export async function setAuthorizedModelEnabled(id: string, enabled: boolean): Promise<void> {
  await axiosInstance.post(`${PostEndpointUrl.SetAIAuthorizedModelEnabled}/${encodeURIComponent(id)}/enabled`, {
    enabled,
  })
}

export async function revokeAuthorizedModel(id: string): Promise<void> {
  await axiosInstance.delete(`${PostEndpointUrl.RevokeAIAuthorizedModel}/${encodeURIComponent(id)}`)
}

// ─── Per-user model choice ─────────────────────────────────────────────────

export interface UserModelOption {
  id: string
  model: string
  label: string
  provider_label: string
  provider_kind: string
}

export interface UserModelsResponse {
  models: UserModelOption[]
  selected_model_id: string
}

export async function getMyModels(): Promise<UserModelsResponse> {
  const res = await axiosInstance.get(GetEndpointUrl.GetAIMyModels)
  return res.data?.data ?? { models: [], selected_model_id: "" }
}

// Set (or clear, when modelId is empty) the current user's model choice.
export async function setMyModel(modelId: string): Promise<void> {
  await axiosInstance.post(PostEndpointUrl.SetAIModelPreference, { model_id: modelId })
}

// ─── AI self-test ("Test AI") ──────────────────────────────────────────────

export interface SelfTestCheck {
  name: string
  passed: boolean
  detail?: string
}

export interface SelfTestStatus {
  state: "idle" | "running" | "completed" | "failed"
  provider?: string
  model?: string
  started_at?: number
  finished_at?: number
  passed: number
  failed: number
  total: number
  checks?: SelfTestCheck[]
  error?: string
}

// Start an async self-test. modelId targets a specific authorized model; pass
// "" to test the workspace default. Returns immediately; poll getSelfTestStatus.
export async function runAISelfTest(modelId = ""): Promise<void> {
  await axiosInstance.post(PostEndpointUrl.RunAISelfTest, modelId ? { model_id: modelId } : {})
}

export async function getAISelfTestStatus(): Promise<SelfTestStatus> {
  const res = await axiosInstance.get(GetEndpointUrl.GetAISelfTestStatus)
  return res.data?.data
}

// ─── Code-aware bug analysis (member-facing) ────────────────────────────────

export interface CodeAnalysisResult {
  answer: string
  files_considered: string[]
  partial: boolean
}

export interface AnalyzeCodeInput {
  owner: string
  repo: string
  title: string
  body: string
  ref?: string
  deep?: boolean
}

// Analyze a bug/issue against a linked GitHub repo and get a root-cause +
// proposed fix. Read-only against GitHub. `deep` widens the file budget for a
// "look harder" retry.
export async function analyzeCodeIssue(input: AnalyzeCodeInput): Promise<CodeAnalysisResult> {
  const res = await axiosInstance.post(PostEndpointUrl.AnalyzeCode, input)
  return res.data?.data
}

// ─── AI release notes (member-facing) ──────────────────────────────────────

export interface ReleaseNotesResult {
  notes: string
  pr_count: number
  days: number
}

// Draft user-facing release notes from PRs merged on a repo in the last `days`.
export async function draftReleaseNotes(owner: string, repo: string, days: number): Promise<ReleaseNotesResult> {
  const res = await axiosInstance.post(PostEndpointUrl.DraftReleaseNotes, { owner, repo, days })
  return res.data?.data
}

// ─── AI social posts (member-facing) ────────────────────────────────────────

export interface SocialPostView {
  platform: string
  label: string
  content: string
}

// Draft platform-tailored social posts (X / Reddit / ...) for a topic.
export async function draftSocialPosts(topic: string, platforms: string[]): Promise<SocialPostView[]> {
  const res = await axiosInstance.post(PostEndpointUrl.DraftSocialPosts, { topic, platforms })
  return res.data?.data ?? []
}

// ─── Memory backfill ("rebuild memory") ──────────────────────────────────

export async function rebuildAIMemory(): Promise<void> {
  await axiosInstance.post(PostEndpointUrl.RebuildAIMemory, {})
}

export async function getMemoryBackfillStatus(): Promise<MemoryBackfillStatus> {
  const res = await axiosInstance.get(GetEndpointUrl.GetAIMemoryRebuildStatus)
  return res.data?.data
}

// ─── Local model install / delete ────────────────────────────────────────

export async function deleteModel(providerId: string, model: string): Promise<void> {
  await axiosInstance.post(PostEndpointUrl.DeleteAIModel, { provider_id: providerId, model })
}

/**
 * Pull (install) a local model, streaming download progress via SSE.
 * Returns an AbortController so the caller can cancel the download (e.g.
 * the user closes the dialog). onProgress is invoked for each event.
 *
 * The returned promise resolves with a PullResult describing the REAL
 * terminal outcome parsed from the stream — NOT merely "the connection
 * closed". This matters because Ollama returns HTTP 200 and then streams an
 * error frame for a bad tag / too-old server, so a closed stream is not
 * proof of success. Callers must check result.ok.
 *
 * We use fetch (not axios) because we need to read a streaming body, via
 * authedStreamFetch which refreshes an expired access token and retries once.
 */
export function pullModel(
  providerId: string,
  model: string,
  onProgress: (p: PullProgress) => void,
): { promise: Promise<PullResult>; abort: () => void } {
  const controller = new AbortController()

  const promise = (async (): Promise<PullResult> => {
    const resp = await authedStreamFetch(PostEndpointUrl.PullAIModel, {
      jsonBody: { provider_id: providerId, model },
      signal: controller.signal,
    })

    if (!resp.ok || !resp.body) {
      const text = await resp.text().catch(() => "")
      throw new Error(text || `pull failed: ${resp.status}`)
    }

    const reader = resp.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ""

    // Track the terminal outcome from the stream itself.
    let sawSuccess = false
    let streamError = ""
    let updateRequired = false

    const handleFrame = (p: PullProgress) => {
      onProgress(p)
      if (p.update_required) updateRequired = true
      if (p.error) {
        streamError = p.error
      } else if (p.done || p.status === "success") {
        // Ollama's terminal frame is {status:"success", done:true}.
        sawSuccess = true
      }
    }

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })

      // SSE frames are separated by a blank line; each "data:" line is JSON.
      const frames = buffer.split("\n\n")
      buffer = frames.pop() ?? ""
      for (const frame of frames) {
        const line = frame.split("\n").find((l) => l.startsWith("data:"))
        if (!line) continue
        const json = line.slice("data:".length).trim()
        if (!json) continue
        try {
          handleFrame(JSON.parse(json) as PullProgress)
        } catch {
          // ignore malformed frame
        }
      }
    }
    // Flush any trailing buffered frame (stream may end without a blank line).
    const tail = buffer.split("\n").find((l) => l.startsWith("data:"))
    if (tail) {
      const json = tail.slice("data:".length).trim()
      if (json) {
        try {
          handleFrame(JSON.parse(json) as PullProgress)
        } catch {
          /* ignore */
        }
      }
    }

    if (streamError) {
      return { ok: false, error: streamError, updateRequired }
    }
    if (!sawSuccess) {
      // Stream ended without a success frame and without an explicit error —
      // treat as failure rather than silently claiming the model installed.
      return { ok: false, error: "Install did not complete. Please try again.", updateRequired }
    }
    return { ok: true, updateRequired }
  })()

  return { promise, abort: () => controller.abort() }
}

// ─── Display helpers ──────────────────────────────────────────────────────

export function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return "0 B"
  const units = ["B", "KB", "MB", "GB", "TB"]
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`
}
