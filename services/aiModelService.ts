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
import { dedupeInFlight } from "@/lib/utils/inFlight"

export type ProviderKind = "ollama" | "openai" | "anthropic" | "openai_compatible"

export interface ProviderView {
  id: string
  kind: ProviderKind
  label: string
  base_url: string
  has_api_key: boolean
  /**
   * A key IS stored but the server cannot decrypt it, so the provider is unusable until it is
   * re-entered. Usually means AI_CONFIG_KEK was changed.
   *
   * Read together with has_api_key, never instead of it. The server reports has_api_key=false here,
   * because a key it cannot decrypt is as useless as no key at all — so on its own has_api_key
   * cannot distinguish "never configured" from "configured, now unreadable", and only the second
   * has a cause worth telling the admin about. Absent on a healthy provider (omitempty).
   */
  key_unreadable?: boolean
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
  local_only_mode: boolean
  local_only_pinned_by_env: boolean
  // Agent-to-agent delegation policy. agent_delegation_vetoed_by_env reports a
  // DEPLOYMENT-LEVEL refusal (AI_AGENT_DELEGATION=false), in which case the toggle
  // must be disabled and explained — a switch that saves and does nothing is worse
  // than no switch.
  agent_delegation_enabled: boolean
  agent_delegation_max_hops: number
  agent_delegation_surfaces: string
  agent_delegation_vetoed_by_env: boolean
  pii_redaction_enabled: boolean
  pii_custom_patterns: string
  meeting_recap_enabled: boolean
  meeting_recap_instructions: string
  memory_layer_enabled: boolean
  team_report_enabled: boolean
  nudges_enabled: boolean
  coworker_enabled: boolean
  issue_triage_enabled: boolean
  code_analysis_max_files: number
  effective_code_analysis_max_files: number
  web_search_provider: string
  web_search_base_url: string
  web_search_enabled: boolean
  has_web_search_key: boolean
  sandbox_enabled: boolean
  sandbox_runner_url: string
  has_sandbox_runner_token: boolean
  sandbox_image_digest: string
  sandbox_workspace_daily_seconds: number
  sandbox_workspace_daily_runs: number
  sandbox_channel_daily_seconds: number
  sandbox_channel_daily_runs: number
  sandbox_used_today_seconds: number
  sandbox_used_today_runs: number
  code_pr_enabled: boolean
  code_pr_runner_url: string
  has_code_pr_runner_token: boolean
  code_pr_egress_allowlist: string[]
  code_pr_out_of_scope_policy: string
  code_pr_draft_on_red: boolean
  code_pr_workspace_daily_minutes: number
  code_pr_workspace_daily_runs: number
  code_pr_channel_daily_minutes: number
  code_pr_channel_daily_runs: number
  code_pr_allow_unlinked: boolean
  // How long one coding run may work (minutes). 0 = use the server default;
  // code_pr_effective_wall_minutes is the limit actually in force.
  code_pr_wall_minutes: number
  code_pr_effective_wall_minutes: number
  code_pr_chat_provider_id: string
  code_pr_chat_model: string
  code_pr_used_today_minutes: number
  code_pr_used_today_runs: number
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

// Per-user AI token spend for today (admin-only). Powers the "top consumers"
// breakdown so an admin can see who is using the workspace budget.
export interface AIUserUsageRow {
  user_id: string
  full_name: string
  name: string
  used: number
}
export interface AIUserUsage {
  day: string
  users: AIUserUsageRow[]
}

export async function getAIUserUsage(limit = 25): Promise<AIUserUsage> {
  const res = await axiosInstance.get(`${GetEndpointUrl.GetAIUserUsage}?limit=${limit}`)
  return res.data?.data
}

// Per-channel AI token spend for today (admin-only). Powers the "top
// AI-spending channels" breakdown (Claude-Tag's per-channel usage view).
export interface AIChannelUsageRow {
  channel_id: string
  name: string
  used: number
}
export interface AIChannelUsage {
  day: string
  channels: AIChannelUsageRow[]
}

export async function getAIChannelUsage(limit = 25): Promise<AIChannelUsage> {
  const res = await axiosInstance.get(`${GetEndpointUrl.GetAIChannelUsage}?limit=${limit}`)
  return res.data?.data
}

/**
 * List a provider's models.
 *
 * De-duplicated while in flight because this reaches the PROVIDER's /models endpoint through the
 * backend, so two concurrent identical calls are two real upstream requests — rate limit, and cost
 * on a paid provider — for the same answer. The admin panel was issuing exactly that pair on every
 * open. The URL is the key, so `refresh=true` is correctly treated as a different request and is
 * never served from a shared non-refresh promise.
 */
export async function listProviderModels(providerId: string, refresh = false): Promise<ModelView[]> {
  const url = `${GetEndpointUrl.GetAIProviderModels}/${encodeURIComponent(providerId)}/models${refresh ? "?refresh=true" : ""}`
  return dedupeInFlight(url, async () => {
    const res = await axiosInstance.get(url)
    return res.data?.data?.models ?? []
  })
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

// Sets or clears the optional dedicated model the code-PR coding runner uses.
// Passing empty strings clears it (code runs then fall back to the chat model).
export async function setCodePRModel(providerId: string, model: string): Promise<void> {
  await axiosInstance.post(PostEndpointUrl.SetAICodePRModel, { provider_id: providerId, model })
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

// Toggle local-only AI mode (data-residency guarantee: no content to a cloud
// model). The backend refuses to enable it while an active endpoint is cloud.
export async function setAILocalOnly(enabled: boolean): Promise<void> {
  await axiosInstance.post(PostEndpointUrl.SetAILocalOnly, { enabled })
}

// Set the agent-to-agent delegation policy: whether one AI teammate may hand work
// to another, how deep a chain may go, and where it is permitted.
//
// All three go in one request because they are one policy — enabling delegation
// while a stale surface list is stored would open places the admin did not just
// choose. The backend refuses to enable it when the deployment has vetoed.
export async function setAIAgentDelegation(
  enabled: boolean,
  maxHops: number,
  surfaces: string,
): Promise<void> {
  await axiosInstance.post(PostEndpointUrl.SetAIAgentDelegation, {
    enabled,
    max_hops: maxHops,
    surfaces,
  })
}

// Toggle PII redaction before cloud egress. When on, detected PII is scrubbed
// from prompts before they reach a non-local model.
export async function setAIPIIRedaction(enabled: boolean): Promise<void> {
  await axiosInstance.post(PostEndpointUrl.SetAIPIIRedaction, { enabled })
}

// Set the admin-defined PII redaction regexes (one per line). The backend
// rejects the request if any line is an invalid regex.
export async function setAIPIIPatterns(patterns: string): Promise<void> {
  await axiosInstance.post(PostEndpointUrl.SetAIPIIPatterns, { patterns })
}

export async function setMeetingRecapEnabled(enabled: boolean): Promise<void> {
  await axiosInstance.post(PostEndpointUrl.SetAIMeetingRecap, { enabled })
}

export async function setMeetingRecapInstructions(instructions: string): Promise<void> {
  await axiosInstance.post(PostEndpointUrl.SetAIMeetingRecapInstructions, { instructions })
}

// Per-user personal AI custom instructions (ChatGPT/Notion-style). Shape how the
// assistant answers YOU (tone, role, defaults, language); applied on top of the
// workspace prompt for your requests only.
export async function getMyAIInstructions(): Promise<string> {
  const res = await axiosInstance.get(GetEndpointUrl.MyAIInstructions)
  return res.data?.data?.instructions || ""
}

export async function setMyAIInstructions(instructions: string): Promise<void> {
  await axiosInstance.post(PostEndpointUrl.SetMyAIInstructions, { instructions })
}

export interface WebSearchInput {
  provider: string // "" | searxng | tavily | brave
  base_url: string
  api_key?: string
  enabled: boolean
  clear_key?: boolean
}

// setWebSearch configures the provider-agnostic web search. api_key is sent
// only when (re)entered; clear_key removes a stored key.
export async function setWebSearch(input: WebSearchInput): Promise<void> {
  await axiosInstance.post(PostEndpointUrl.SetAIWebSearch, input)
}

export interface SandboxConfigInput {
  enabled: boolean
  runner_url: string
  runner_token?: string
  clear_token?: boolean
  image_digest: string
  workspace_daily_seconds: number
  workspace_daily_runs: number
  channel_daily_seconds: number
  channel_daily_runs: number
}

// setSandboxConfig configures the agent execution sandbox (runner URL, token,
// image digest, daily budgets, on/off). runner_token is sent only when
// (re)entered; clear_token removes a stored token.
export async function setSandboxConfig(input: SandboxConfigInput): Promise<void> {
  await axiosInstance.post(PostEndpointUrl.SetAISandbox, input)
}

// setSandboxEnabled is the instant kill switch: toggles only the sandbox
// master flag without touching runner config or budgets.
export async function setSandboxEnabled(enabled: boolean): Promise<void> {
  await axiosInstance.post(PostEndpointUrl.SetAISandboxEnabled, { enabled })
}

export interface SandboxTestResult {
  ok: boolean
  status: string
  message: string
  wall_ms: number
}

// testSandbox runs a trivial probe against the configured code-runner sidecar
// to validate the deployment (reachability, auth, execution) before enabling.
export async function testSandbox(): Promise<SandboxTestResult> {
  const res = await axiosInstance.post(PostEndpointUrl.TestAISandbox, {})
  return res.data.result as SandboxTestResult
}

export interface CodePRConfigInput {
  enabled: boolean
  runner_url: string
  runner_token?: string
  clear_token?: boolean
  egress_allowlist: string[]
  out_of_scope_policy: string
  draft_on_red: boolean
  allow_unlinked: boolean
  // 0 = use the server default; otherwise 2..60 minutes (validated server-side).
  wall_minutes: number
  workspace_daily_minutes: number
  workspace_daily_runs: number
  channel_daily_minutes: number
  channel_daily_runs: number
}

// setCodePRConfig configures the agent code-PR feature (coding-capable runner
// URL, token, egress allowlist, out-of-scope policy, draft-on-red, per-run
// coding time limit, daily minute/run budgets, on/off). runner_token is sent
// only when (re)entered; clear_token removes a stored token.
export async function setCodePRConfig(input: CodePRConfigInput): Promise<void> {
  await axiosInstance.post(PostEndpointUrl.SetAICodePR, input)
}

// setCodePREnabled is the instant kill switch: toggles only the code-PR master
// flag without touching runner config or budgets.
export async function setCodePREnabled(enabled: boolean): Promise<void> {
  await axiosInstance.post(PostEndpointUrl.SetAICodePREnabled, { enabled })
}

// CodePRScorecard is the honest reliability view of the coding agent: counts,
// rates (in [0,1]), ground-truth merge rate, and a min-sample-guarded grade.
// All fields are zero on an empty ledger and the grade reads "unproven" until
// there is enough signal, so the UI never over-claims.
export interface CodePRScorecard {
  total: number
  opened: number
  verified: number
  with_tests: number
  in_scope: number
  draft: number
  no_green: number
  blocked: number
  failed: number
  merged: number
  merged_with_edits: number
  closed: number
  outcome_known: number
  open_rate: number
  verify_rate: number
  in_scope_rate: number
  draft_rate: number
  merge_rate: number
  grade: "healthy" | "needs_attention" | "unproven"
  min_sample: number
  window_days: number
}

// getCodePRScorecard fetches the coding agent's reliability scorecard. days<=0
// (omitted) covers all time; a positive value scopes to a trailing window.
export async function getCodePRScorecard(days?: number): Promise<CodePRScorecard> {
  const url =
    days && days > 0
      ? `${GetEndpointUrl.GetAICodePRScorecard}?days=${days}`
      : GetEndpointUrl.GetAICodePRScorecard
  const res = await axiosInstance.get(url)
  return res.data.data as CodePRScorecard
}

// CodePRTestResult is the coding-runner deployment self-test: reachability of
// the configured runner endpoint + whether an auth token is set.
export interface CodePRTestResult {
  ok: boolean
  status: string
  message: string
  latency_ms: number
  token_set: boolean
  endpoint_ok: boolean
}

// testCodePRRunner probes the configured coding runner (reachability + token)
// without triggering a real coding run — the "is my runner wired?" check.
export async function testCodePRRunner(): Promise<CodePRTestResult> {
  const res = await axiosInstance.post(PostEndpointUrl.TestAICodePR, {})
  return res.data.result as CodePRTestResult
}

// CodePRRunView is one row of the coding-run ledger for the admin runs list.
export interface CodePRRunView {
  id: string
  repo: string
  status: string
  outcome?: string
  pr_url?: string
  draft: boolean
  all_passed: boolean
  diff_files: number
  message?: string
  created_at: string
}

// getCodePRRuns fetches the most recent coding runs (newest first) for the admin
// runs view.
export async function getCodePRRuns(limit = 50): Promise<CodePRRunView[]> {
  const res = await axiosInstance.get(`${GetEndpointUrl.GetAICodePRRuns}?limit=${limit}`)
  return (res.data.data as CodePRRunView[]) || []
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
  /**
   * This model's own token limits. 0 means "inherit the workspace context window", which
   * is the default — so a workspace that has never set them behaves exactly as before.
   *
   * Worth setting because OneCamp lets a member, a channel and an agent each pick a
   * different model, and one workspace-wide window cannot be right for all of them: too
   * small discards context that would have fitted (and on Ollama runs the model small),
   * too large builds prompts the model refuses.
   */
  context_window_tokens: number
  max_output_tokens: number
  updated_at?: string
}

/** Bounds mirrored from migration 140's CHECK constraints, so the form rejects a value
 *  before a round trip rather than after. The database is still the real enforcement. */
export const MODEL_LIMIT_BOUNDS = {
  contextWindow: { min: 2048, max: 20_000_000 },
  maxOutput: { min: 256, max: 1_000_000 },
} as const

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

/** What a provider says about a model's own limits. 0 means the provider did not report
 *  it — which for OpenAI is always, since its API publishes no context windows. */
export interface DiscoveredModelLimits {
  context_window_tokens: number
  max_output_tokens: number
  /** The field the number came from (e.g. "context_length", "llama.context_length"), so
   *  an admin being asked to accept a value can see where it came from. */
  source?: string
  /** Why a value is 0: not published by this provider, unreachable, or unknown model. */
  note?: string
}

/**
 * Ask a model's provider what its limits are. Returns a SUGGESTION — nothing is written,
 * because a gateway's answer can be stale or describe a different model than it routes to,
 * and re-sizing prompts is a decision a person should make.
 */
export async function discoverAuthorizedModelLimits(id: string): Promise<DiscoveredModelLimits> {
  const res = await axiosInstance.get(
    `${GetEndpointUrl.DiscoverAIModelLimits}/${encodeURIComponent(id)}/discover-limits`,
  )
  return res.data?.data ?? { context_window_tokens: 0, max_output_tokens: 0 }
}

/**
 * Record what you know about a model's token limits. 0 clears a value back to inheriting
 * the workspace context window.
 *
 * Omitting a field leaves it unchanged, which is why both are optional: 0 is a meaningful
 * value here, so "clear it" and "don't touch it" have to be different requests.
 */
export async function setAuthorizedModelLimits(
  id: string,
  limits: { context_window_tokens?: number; max_output_tokens?: number },
): Promise<void> {
  await axiosInstance.post(
    `${PostEndpointUrl.SetAIAuthorizedModelLimits}/${encodeURIComponent(id)}/limits`,
    limits,
  )
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

/**
 * The governed MCP surface's admission decision.
 *
 * `available_groups` comes from the server rather than being a constant here, for the
 * same reason the audit log serves its own categories: the choices offered must be the
 * groups that actually exist. A group a new tool introduces appears with nothing to
 * remember, and a group with no tools in it can never be offered.
 */
export interface MCPServerSettings {
    enabled: boolean
    /** Comma-separated allowlist of scope prefixes, or "*" for all. Empty exposes nothing. */
    tool_groups: string
    available_groups: string[]
}

export async function getAIMCPServer(): Promise<MCPServerSettings> {
    const res = await axiosInstance.get(GetEndpointUrl.GetAIMCPServer)
    const data = (res.data as { data?: Partial<MCPServerSettings> })?.data
    return {
        // Defaults match the server's: off, exposing nothing. A malformed response must
        // not render as "enabled" — an admin reading this screen has to be able to trust
        // that a toggle shown as off means the surface is closed.
        enabled: data?.enabled ?? false,
        tool_groups: data?.tool_groups ?? "",
        available_groups: data?.available_groups ?? [],
    }
}

/**
 * Set the MCP admission policy.
 *
 * Both values in one request because they are one decision: saving the flag without the
 * groups enables a surface exposing nothing, and saving groups without the flag looks
 * like it took effect when nothing changed.
 *
 * The backend refuses to enable the surface with no groups named, and names the valid
 * groups when one is unrecognised — so its error text is worth showing verbatim rather
 * than replacing with a generic failure.
 */
export async function setAIMCPServer(enabled: boolean, toolGroups: string): Promise<void> {
    await axiosInstance.post(PostEndpointUrl.SetAIMCPServer, {
        enabled,
        tool_groups: toolGroups,
    })
}
