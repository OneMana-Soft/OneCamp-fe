import axiosInstance from "@/lib/axiosInstance"
import { GetEndpointUrl, PostEndpointUrl } from "@/services/endPoints"

// Agent Builder client. Mirrors workflowService: list via useFetch in the card,
// mutations via these service functions. Types mirror the backend ai_agents /
// ai_agent_runs rows.

export type AgentTriggerType = "manual" | "mention" | "schedule" | "event"

export interface Agent {
  id: string
  name: string
  description?: string | null
  avatar_key?: string | null
  instructions: string
  model_pref?: string | null
  enabled_tools: string // raw JSON array string
  trigger_type: AgentTriggerType
  trigger_config: string // raw JSON object string
  scope: string // raw JSON object string
  max_steps: number
  is_active: boolean
  dm_able: boolean
  autonomy: "auto" | "approval" | "plan"
  knowledge?: string // raw JSON array string of {type,id,label}
  skill_ids?: string // raw JSON array string of skill uuids
  max_daily_tokens?: number // per-agent daily token cap (0 = no cap)
  run_in_background?: boolean // durable, progress-reporting async runs for mentions/DMs
  ambient?: boolean // may reply in scoped channels without an @mention
  ambient_keywords?: string // comma/newline topic keywords narrowing ambient candidacy
  run_count: number
  last_run_at?: string | null
  last_error?: string | null
  created_at: string
  updated_at: string
}

export interface AgentRunStep {
  iteration: number
  assistant?: string
  tool_calls?: Array<{
    tool: string
    params: Record<string, string>
    result?: string
    error?: string
    skipped?: string
    // Stable governance category when the call was gated by policy rather than
    // an ordinary failure: "approval_required" (routed to human approval) or
    // "blocked" (refused — not permitted / out of scope). Absent for normal
    // calls; unknown values render as no special badge.
    governance?: string
  }>
  // Instructions a person sent WHILE the run was in progress, folded in before
  // this step. Recorded so the transcript explains why the agent changed course
  // instead of it looking like the model abandoned its own plan.
  steering?: string[]
  // Present when the run's conversation was compacted right before this step:
  // older turns were folded into a summary so the agent could keep working
  // inside the model's context window. Purely informational — the transcript
  // itself is never compacted, only what gets re-sent to the model.
  compaction?: AgentRunCompaction
}

// AgentRunCompaction is the transcript marker for one context compaction.
export interface AgentRunCompaction {
  // Cumulative number of conversation messages folded into the summary.
  folded: number
  // Which compaction this was within the run (1-based).
  round: number
  // Estimated prompt size either side of the fold, in tokens.
  tokens_before: number
  tokens_after: number
  // False when the summarizer was unavailable and only mechanically extracted
  // working state was carried forward.
  summarized: boolean
  // True when a provider had already rejected the prompt as too large and this
  // fold recovered the run instead of failing it.
  rescue?: boolean
}

// compactionSummary renders a compaction marker as one plain sentence for the
// transcript. Generic over the shape so a partial/legacy payload still reads
// sensibly rather than printing "undefined".
export function compactionSummary(c: AgentRunCompaction): string {
  const saved =
    c.tokens_before > 0 && c.tokens_after > 0 && c.tokens_before > c.tokens_after
      ? ` (${c.tokens_before.toLocaleString()} → ${c.tokens_after.toLocaleString()} tokens)`
      : ""
  const how = c.summarized ? "summarised" : "trimmed (no summary available)"
  const why = c.rescue ? "after the model refused an oversized prompt" : "to stay inside the context window"
  const folded = c.folded > 0 ? `${c.folded} earlier message${c.folded === 1 ? "" : "s"}` : "earlier messages"
  return `Context compacted ${why}: ${folded} ${how}${saved}.`
}

// GOVERNANCE_BADGE maps a tool call's governance category to its transcript
// badge. Kept data-driven so new backend categories need only an entry here.
export const GOVERNANCE_BADGE: Record<string, { label: string; tone: "approval" | "blocked" }> = {
  approval_required: { label: "Awaiting approval", tone: "approval" },
  blocked: { label: "Blocked by policy", tone: "blocked" },
}

export interface AgentRun {
  id: string
  agent_id: string
  trigger_source: string
  status: "running" | "succeeded" | "failed" | "stopped"
  steps: string // raw JSON array string
  step_count: number
  tokens: number
  result?: string | null
  error?: string | null
  started_at: string
  ended_at?: string | null
}

export interface AgentInput {
  name: string
  description?: string
  instructions: string
  model_pref?: string
  enabled_tools: string[]
  trigger_type: AgentTriggerType
  trigger_config?: Record<string, unknown>
  scope?: { channel_ids?: string[]; project_ids?: string[] }
  max_steps: number
  is_active: boolean
  dm_able?: boolean
  autonomy?: "auto" | "approval" | "plan"
  knowledge?: KnowledgeRef[]
  skill_ids?: string[]
  max_daily_tokens?: number
  run_in_background?: boolean
  ambient?: boolean
  ambient_keywords?: string
}

// KnowledgeRef is a curated grounding source attached to an agent.
export interface KnowledgeRef {
  type: "channel" | "doc" | "project"
  id: string
  label?: string
}

export interface AgentRunOutcome {
  run_id: string
  status: string
  result: string
  error?: string
  steps: number
}

// Safe JSON parse helpers for the raw string columns.
export function parseEnabledTools(a: Agent): string[] {
  try {
    const v = JSON.parse(a.enabled_tools || "[]")
    return Array.isArray(v) ? v : []
  } catch {
    return []
  }
}

export function parseScope(a: Agent): { channel_ids?: string[]; project_ids?: string[] } {
  try {
    return JSON.parse(a.scope || "{}") || {}
  } catch {
    return {}
  }
}

// parseKnowledge returns the agent's curated knowledge sources.
export function parseKnowledge(a: Agent): KnowledgeRef[] {
  try {
    const v = JSON.parse(a.knowledge || "[]")
    return Array.isArray(v) ? (v as KnowledgeRef[]) : []
  } catch {
    return []
  }
}

// parseSkillIds returns the ids of the skills attached to the agent.
export function parseSkillIds(a: Agent): string[] {
  try {
    const v = JSON.parse(a.skill_ids || "[]")
    return Array.isArray(v) ? (v as string[]) : []
  } catch {
    return []
  }
}

// Parsed trigger configuration. Only the fields relevant to the agent's
// trigger_type are meaningful; mirrors the backend triggerConfig struct.
export interface TriggerConfig {
  interval_minutes?: number // schedule (fixed-interval mode)
  recurrence?: string // schedule (cron mode): RRULE-lite, e.g. FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR
  at_minute_utc?: number // schedule (cron mode): fire time, minutes past UTC midnight
  event?: string // event: workspace event type
  handle?: string // mention: explicit @handle (defaults to the agent name)
}

export function parseTriggerConfig(a: Agent): TriggerConfig {
  try {
    return JSON.parse(a.trigger_config || "{}") || {}
  } catch {
    return {}
  }
}

// Workspace events an agent can subscribe to (event trigger). Kept aligned with
// the backend DispatchEvent call sites; labels are end-user friendly.
export const EVENT_TRIGGER_OPTIONS: { value: string; label: string }[] = [
  { value: "task.created", label: "A task is created" },
  { value: "task.status_changed", label: "A task's status changes" },
  { value: "task.deleted", label: "A task is deleted" },
  { value: "post.created", label: "A message is posted in a channel" },
  { value: "channel.created", label: "A channel is created" },
  { value: "user.joined", label: "Someone joins a channel" },
  { value: "table.row.created", label: "A table row is added" },
  { value: "table.row.updated", label: "A table row is updated" },
  // GitHub events (require a linked GitHub repo). Let an agent follow PRs:
  // react when one opens, a review lands, or CI finishes.
  { value: "github.pr.opened", label: "A GitHub pull request is opened" },
  { value: "github.pr.review_submitted", label: "A GitHub PR review is submitted" },
  { value: "github.check_run.completed", label: "A pull request's CI finishes (all checks pass/fail)" },
  { value: "github.issue.opened", label: "A GitHub issue is opened" },
]

// Schedule presets (minutes) offered in the builder; a custom value is also
// accepted.
export const SCHEDULE_PRESETS: { value: number; label: string }[] = [
  { value: 15, label: "Every 15 minutes" },
  { value: 60, label: "Hourly" },
  { value: 240, label: "Every 4 hours" },
  { value: 1440, label: "Daily" },
  { value: 10080, label: "Weekly" },
]

export function parseRunSteps(r: AgentRun): AgentRunStep[] {
  try {
    const v = JSON.parse(r.steps || "[]")
    return Array.isArray(v) ? v : []
  } catch {
    return []
  }
}

// Tool catalog shown in the builder, grouped by domain. Mirrors the backend
// ai.ToolRegistry. `write` flags a side-effecting tool (shown with a warning).
export interface ToolCatalogEntry {
  name: string
  label: string
  write: boolean
}
export interface ToolCatalogGroup {
  group: string
  tools: ToolCatalogEntry[]
  // Optional helper line shown under the group header in the builder.
  note?: string
}

// THIS LIST IS HAND-MAINTAINED AND THE BACKEND REGISTRY IS THE TRUTH.
//
// An agent's enabled_tools is an allow-list, and this is the only place a person
// can add to it. A tool registered in the backend and missing here is invisible:
// it exists, it is documented, it is tested, and no agent can ever call it,
// because nobody can tick the box. That is how read_meeting_transcript and
// find_people first shipped, which is worse than not shipping them, because
// everything looks finished.
//
// Adding a backend tool is two edits, not one. If this list ever grows tedious,
// serve it from the registry rather than copying it.
export const TOOL_CATALOG: ToolCatalogGroup[] = [
  {
    group: "Tasks & projects",
    tools: [
      { name: "list_tasks", label: "List my tasks", write: false },
      { name: "list_project_tasks", label: "List a project's tasks", write: false },
      { name: "list_projects", label: "List projects", write: false },
      { name: "read_project", label: "Read a project", write: false },
      { name: "create_task", label: "Create a task", write: true },
      { name: "update_task_status", label: "Update task status", write: true },
      { name: "assign_task", label: "Assign a task", write: true },
      { name: "set_task_due_date", label: "Set a task due date", write: true },
      { name: "create_project", label: "Create a project", write: true },
      { name: "list_teams", label: "List teams", write: false },
    ],
  },
  {
    group: "Messaging",
    tools: [
      { name: "send_message", label: "Post in a channel", write: true },
      { name: "send_dm", label: "Send a direct message", write: true },
      { name: "send_group_chat", label: "Message a group chat", write: true },
      { name: "summarize_channel", label: "Summarize a channel", write: false },
      { name: "summarize_dm", label: "Summarize a DM", write: false },
      { name: "summarize_group_chat", label: "Summarize a group chat", write: false },
    ],
  },
  {
    group: "Docs & reminders",
    tools: [
      { name: "read_doc", label: "Read a doc", write: false },
      { name: "create_doc", label: "Create a doc", write: true },
      { name: "set_reminder", label: "Set a reminder / event", write: true },
    ],
  },
  {
    group: "Tables",
    tools: [
      { name: "list_tables", label: "List tables", write: false },
      { name: "read_table", label: "Read a table", write: false },
      { name: "query_table", label: "Analyze a table (totals & charts)", write: false },
      { name: "query_plan", label: "Analyze a table — multi-step (top-N, %, having)", write: false },
      { name: "create_table_row", label: "Add a table row", write: true },
      { name: "update_table_row", label: "Update a table row", write: true },
    ],
  },
  {
    group: "External data sources",
    note: "Query a connected read-only external database/warehouse the way the agent queries native tables. Deterministic and read-only — the agent describes the query, never SQL. Only sources the agent's owner can access are reachable.",
    tools: [
      { name: "list_data_sources", label: "List data sources", write: false },
      { name: "read_data_source", label: "Read a data source's schema", write: false },
      { name: "query_data_source", label: "Analyze a data source (totals & charts)", write: false },
      { name: "query_data_source_plan", label: "Analyze a data source — multi-step (top-N, %, having)", write: false },
    ],
  },
  {
    group: "Knowledge & search",
    tools: [
      { name: "search_workspace", label: "Search workspace & connected apps", write: false },
      { name: "find_people", label: "Look up a person (name, title, team)", write: false },
      { name: "read_meeting_transcript", label: "Read what was said in a call", write: false },
    ],
  },
  {
    group: "Web",
    tools: [
      { name: "web_search", label: "Search the web", write: false },
    ],
  },
  {
    group: "Code (GitHub, read-only)",
    note: "Read + understand the workspace's connected GitHub repo. Read-only — safe to grant broadly.",
    tools: [
      { name: "repo_summary", label: "Summarize the repo", write: false },
      { name: "search_repo_code", label: "Search code", write: false },
      { name: "read_repo_file", label: "Read a file", write: false },
      { name: "list_commits", label: "List commits", write: false },
      { name: "list_recent_changes", label: "List merged PRs", write: false },
      { name: "code_analyze", label: "Analyze a bug / propose a fix", write: false },
    ],
  },
  {
    group: "Connected accounts",
    note: "These act through the agent owner's own connected account. They do nothing if the owner hasn't connected that account.",
    tools: [
      { name: "gmail_search", label: "Search Gmail", write: false },
      { name: "gmail_send", label: "Send an email (Gmail)", write: true },
      { name: "calendar_list_events", label: "List calendar events", write: false },
      { name: "calendar_create_event", label: "Create a calendar event", write: true },
      { name: "github_list_prs", label: "List GitHub pull requests", write: false },
      { name: "github_list_issues", label: "List GitHub issues", write: false },
      { name: "github_comment", label: "Comment on a GitHub issue/PR", write: true },
    ],
  },
  {
    group: "Code analysis (sandboxed)",
    note: "Runs short Python in a locked-down sandbox — no network, ephemeral filesystem, hard limits — over data the agent can already see, to compute results and draw charts. Available only when an admin has enabled the code sandbox.",
    tools: [
      { name: "run_analysis", label: "Run a data analysis", write: false },
    ],
  },
  {
    group: "Code changes (open a PR)",
    note: "Lets the agent WRITE code and open a pull request for a human to review. The change is made in an isolated, network-locked runner, verified against the repo's own build/tests, and opened as a reviewable PR on a fresh branch — never merged automatically. Available only when an admin has enabled code PRs and deployed a coding runner.",
    tools: [
      { name: "code_pr", label: "Open a pull request", write: true },
    ],
  },
]

// WEB_TOOL_GROUP is the catalog group gated on the workspace having a web
// search provider configured (admin AI settings). The editor hides it when web
// search is off so owners aren't offered a tool that can't run.
export const WEB_TOOL_GROUP = "Web"

// SANDBOX_TOOL_GROUP is gated on the admin having enabled the code sandbox. The
// editor hides it otherwise so owners aren't offered a tool that can't run.
export const SANDBOX_TOOL_GROUP = "Code analysis (sandboxed)"

// CODE_PR_TOOL_GROUP is gated on the admin having enabled code PRs (and, in
// practice, deployed a coding runner). The editor hides it otherwise so owners
// aren't offered the code_pr tool when it would just refuse.
export const CODE_PR_TOOL_GROUP = "Code changes (open a PR)"

const TOOL_LABELS: Record<string, string> = TOOL_CATALOG.flatMap((g) => g.tools).reduce(
  (acc, t) => {
    acc[t.name] = t.label
    return acc
  },
  {} as Record<string, string>,
)

export function toolLabel(name: string): string {
  return TOOL_LABELS[name] || name
}

export async function createAgent(input: AgentInput): Promise<Agent> {
  const res = await axiosInstance.post(PostEndpointUrl.CreateAgent, input)
  return res.data?.data as Agent
}

export async function updateAgent(id: string, input: AgentInput): Promise<Agent> {
  const res = await axiosInstance.post(`${PostEndpointUrl.UpdateAgent}/${id}/update`, input)
  return res.data?.data as Agent
}

export async function setAgentActive(id: string, isActive: boolean): Promise<void> {
  await axiosInstance.post(`${PostEndpointUrl.SetAgentActive}/${id}/active`, { is_active: isActive })
}

export async function deleteAgent(id: string): Promise<void> {
  await axiosInstance.post(`${PostEndpointUrl.DeleteAgent}/${id}/delete`)
}

export async function runAgent(id: string, prompt: string, dryRun: boolean): Promise<AgentRunOutcome> {
  const res = await axiosInstance.post(`${PostEndpointUrl.RunAgent}/${id}/run`, { prompt, dry_run: dryRun })
  return res.data?.data as AgentRunOutcome
}

// listAgentRuns fetches recent run history (transcript + status + tokens) for
// an agent the caller can manage. Powers the run-transparency view.
export async function listAgentRuns(id: string, limit = 25): Promise<AgentRun[]> {
  const res = await axiosInstance.get(`${GetEndpointUrl.GetAgentRuns}/${id}/runs?limit=${limit}`)
  return (res.data?.data as AgentRun[]) || []
}

// AgentActivityItem is one entry in the cross-agent "show your work" feed: what
// an agent did, when, and how it turned out (derived server-side from the run
// transcript). Scoped to agents the caller can see (admins: all; members: own).
export interface AgentActivityItem {
  run_id: string
  agent_id: string
  agent_name: string
  agent_avatar_key?: string
  status: string // succeeded | failed | running | stopped
  trigger_source: string
  tools_used: string[]
  action_count: number
  summary: string
  error?: string
  steps: number
  tokens: number
  started_at: string
  ended_at?: string
}

// listAgentActivity loads the recent cross-agent activity feed.
export async function listAgentActivity(limit = 50): Promise<AgentActivityItem[]> {
  const res = await axiosInstance.get(`${GetEndpointUrl.GetAgentActivity}?limit=${limit}`, {
    // @ts-expect-error — suppress the global loading bar for this background fetch
    silent: true,
  })
  return (res.data?.data as AgentActivityItem[]) || []
}

// ActiveWorkItem is one live durable job an AI teammate is currently handling:
// lined up (queued), actively working, or blocked waiting on a human. Powers
// the "what are my teammates doing right now, and where are they stuck" view —
// the observability loop for background/async runs.
// "stopping" is a real, brief state: cancellation is cooperative, so the worker
// running the job wraps up (and posts what it managed to do) before the job goes
// terminal. "stopped" is that terminal state — open feeds never list it, but the
// stop call reports it back when a job was ended before it ever started.
export type ActiveWorkState = "queued" | "working" | "blocked" | "stopping" | "stopped"

export interface ActiveWorkItem {
  task_id: string
  agent_id: string
  agent_name: string
  agent_avatar_key?: string
  state: ActiveWorkState
  where: string // generic, e.g. "in a channel thread", "in a direct message"
  note?: string // blocker/pause reason for a blocked job ("waiting on you for …")
  // Display name of the PERSON the work is attributed to — who asked. Absent for
  // a scheduled routine (nobody asked) or an unresolvable user.
  //
  // Useful even without agent-to-agent delegation: in a shared channel where
  // several people ping the same teammate, "working…" alone doesn't say whose
  // request is in flight. With delegation it is what makes a chain accountable,
  // because the backend attributes a delegated run to the originating human
  // rather than to the agent that relayed it.
  requested_by?: string
  started_at: string
  updated_at: string
  // Whether THIS caller may stop the job. Decided server-side (agent owner, the
  // person who asked, the user it runs as, or an admin) — never inferred from
  // being able to see the row.
  can_stop?: boolean
  // The surface entity the work is attached to (channel post, chat message, or
  // task uuid) and its kind — what lets a thread or task find its own work.
  entity_id?: string
  surface?: string
}

// StopAgentWorkResult reports what a stop actually did, so the UI can say
// something true: "stopped" (it hadn't started), "requested" (its worker is
// wrapping up), or "noop" (it had already finished).
export interface StopAgentWorkResult {
  outcome: "stopped" | "requested" | "noop"
  state: ActiveWorkState
  message: string
}

// stopAgentWork stops an AI teammate's in-flight work. Idempotent server-side:
// stopping something already stopping or finished reports what is true instead of
// failing, so a double click is harmless.
export async function stopAgentWork(taskId: string): Promise<StopAgentWorkResult> {
  const res = await axiosInstance.post(`${PostEndpointUrl.StopAgentWork}/${taskId}/stop`, {})
  return res.data?.data as StopAgentWorkResult
}

// listActiveAgentWork loads the open durable jobs (queued/working/blocked)
// across the agents the caller may see. Background fetch (no global loading bar).
export async function listActiveAgentWork(limit = 100): Promise<ActiveWorkItem[]> {
  const res = await axiosInstance.get(`${GetEndpointUrl.GetAgents}/work?limit=${limit}`, {
    // @ts-expect-error — suppress the global loading bar for this background fetch
    silent: true,
  })
  return (res.data?.data as ActiveWorkItem[]) || []
}

// listAgentWorkForEntity loads the live agent work happening on ONE thing — a
// channel post/thread, a chat message, or a task — so the surface a person is
// already looking at can show it and offer to stop it, instead of sending them to
// a separate panel. Filtered server-side: a caller sees a job only if they are
// party to it or can see the surface it runs on, and each item reports whether
// THEY may stop it. An empty list is the normal case.
export async function listAgentWorkForEntity(entityId: string): Promise<ActiveWorkItem[]> {
  if (!entityId) return []
  const res = await axiosInstance.get(`${GetEndpointUrl.AgentWorkForEntity}/${entityId}`, {
    // @ts-expect-error — suppress the global loading bar for this background fetch
    silent: true,
  })
  return (res.data?.data as ActiveWorkItem[]) || []
}

// listMyAgentWork loads the open durable jobs the current user is personally
// involved in (ones they triggered or that run as them), across ANY agent —
// the member-facing "AI teammates" view. Needs no agent.manage capability;
// strictly self-scoped server-side. Same ActiveWorkItem shape.
export async function listMyAgentWork(limit = 100): Promise<ActiveWorkItem[]> {
  const res = await axiosInstance.get(`${GetEndpointUrl.MyAgentWork}?limit=${limit}`, {
    // @ts-expect-error — suppress the global loading bar for this background fetch
    silent: true,
  })
  return (res.data?.data as ActiveWorkItem[]) || []
}

// AgentDraft is an AI-proposed starting configuration for a new agent. It maps
// onto the subset of the builder form the AI can sensibly fill; the human
// reviews and saves via the normal create flow.
export interface AgentDraft {
  name: string
  description: string
  instructions: string
  enabled_tools: string[]
  trigger_type: AgentTriggerType
  autonomy: "auto" | "approval" | "plan"
  max_steps: number
  dm_able: boolean
}

// draftAgent turns a natural-language description into a starting agent
// configuration to prefill the builder. Never creates the agent.
export async function draftAgent(prompt: string): Promise<AgentDraft> {
  const res = await axiosInstance.post(PostEndpointUrl.DraftAgent, { prompt })
  return res.data?.data as AgentDraft
}

// AgentRunStats mirrors the backend reliability/activity rollup over an agent's
// run history. Powers the reliability panel (success mix, spend, latency,
// recent activity) — the "can I trust it running / is it worth the cost" view.
export interface AgentRunStats {
  total_runs: number
  succeeded: number
  failed: number
  stopped: number
  running: number
  total_tokens: number
  avg_steps: number
  avg_duration_ms: number
  last_7d_runs: number
  last_7d_tokens: number
  last_run_at?: string | null
  tokens_today?: number
  max_daily_tokens?: number
  // Per-agent execution-sandbox usage today + caps (populated only when the
  // sandbox feature is enabled). 0 caps = no per-agent cap.
  sandbox_runs_today?: number
  sandbox_seconds_today?: number
  sandbox_daily_runs?: number
  sandbox_daily_seconds?: number
  working_notes?: string
}

// AgentRoutine is a recurring job a user handed the agent from chat (e.g.
// "every weekday at 9am summarize this channel"). Created conversationally;
// listed/paused/cancelled from the builder.
export interface AgentRoutine {
  id: string
  agent_id: string
  channel_id?: string | null
  group_id: string
  name: string
  prompt: string
  recurrence: string
  at_minute_utc: number
  enabled: boolean
  last_run_at?: string | null
  created_at: string
}

// listAgentRoutines fetches an agent's active routines (owner/admin only).
export async function listAgentRoutines(id: string): Promise<AgentRoutine[]> {
  const res = await axiosInstance.get(`${GetEndpointUrl.GetAgentRuns}/${id}/routines`)
  return (res.data?.data as AgentRoutine[]) || []
}

// setAgentRoutineEnabled pauses (false) or resumes (true) a routine.
export async function setAgentRoutineEnabled(agentId: string, routineId: string, enabled: boolean): Promise<void> {
  await axiosInstance.post(`${GetEndpointUrl.GetAgentRuns}/${agentId}/routines/${routineId}/enabled`, { enabled })
}

// deleteAgentRoutine cancels (soft-deletes) a routine.
export async function deleteAgentRoutine(agentId: string, routineId: string): Promise<void> {
  await axiosInstance.delete(`${GetEndpointUrl.GetAgentRuns}/${agentId}/routines/${routineId}`)
}

export async function getAgentStats(id: string): Promise<AgentRunStats | null> {
  const res = await axiosInstance.get(`${GetEndpointUrl.GetAgentRuns}/${id}/stats`)
  return (res.data?.data as AgentRunStats) || null
}

// WorkspaceAgentStats is the fleet-level rollup across agents (scoped to the
// caller — admins see the workspace, members their own). Powers the agent
// overview strip: fleet health + spend at a glance.
export interface WorkspaceAgentStats {
  total_agents: number
  active_agents: number
  total_runs: number
  succeeded: number
  failed: number
  stopped: number
  running: number
  total_tokens: number
  last_7d_runs: number
  last_7d_tokens: number
}

export async function getWorkspaceAgentStats(): Promise<WorkspaceAgentStats | null> {
  const res = await axiosInstance.get(`${GetEndpointUrl.GetAgents}/overview`, {
    // @ts-expect-error — suppress the global loading bar for this background fetch
    silent: true,
  })
  return (res.data?.data as WorkspaceAgentStats) || null
}

// AgentHealth is the compact per-agent reliability signal for the agents list:
// just enough to render an at-a-glance status dot + tooltip per row. Success
// rate is computed on the client over the terminal (completed) runs.
export interface AgentHealth {
  agent_id: string
  total_runs: number
  succeeded: number
  failed: number
  stopped: number
  running: number
  last_7d_runs: number
  last_run_at?: string | null
}

// getAgentHealthBatch fetches the per-agent health signal for every agent the
// caller may see, keyed by agent id, in one request (no N+1). Agents with no
// runs yet are simply absent from the map.
export async function getAgentHealthBatch(): Promise<Record<string, AgentHealth>> {
  const res = await axiosInstance.get(`${GetEndpointUrl.GetAgents}/health`, {
    // @ts-expect-error — suppress the global loading bar for this background fetch
    silent: true,
  })
  return (res.data?.data as Record<string, AgentHealth>) || {}
}

// ─── In-channel "AI teammates" ──────────────────────────────────────────────
// Adding an AI agent to a channel (the Slack "add the app to a channel" model).
// An agent that is "in" a channel answers @mentions there; managed through the
// agent's channel scope, so this stays one source of truth with the builder.

export interface ChannelAgentOption {
  id: string
  name: string
  avatar_key?: string
  in_channel: boolean
  // global = the agent currently has no channel scope, so it answers anywhere;
  // adding it to a channel narrows it to only the channels you pick.
  global: boolean
}

export async function getChannelAITeammates(channelId: string): Promise<ChannelAgentOption[]> {
  const res = await axiosInstance.get(`/ch/${channelId}/ai-teammates`, {
    // @ts-expect-error — suppress the global loading bar for this background fetch
    silent: true,
  })
  const data = (res.data as { data?: ChannelAgentOption[] })?.data
  return Array.isArray(data) ? data : []
}

export async function setChannelAITeammate(
  channelId: string,
  agentId: string,
  enabled: boolean,
): Promise<void> {
  await axiosInstance.post("/ch/ai-teammates", { channel_id: channelId, agent_id: agentId, enabled })
}

// ChannelAIBudget is a channel's per-day AI token cap (0 = no cap), today's
// spend across all AI in the channel (the shared coworker + every agent), and
// the channel's pinned default AI model id ("" = no override).
export interface ChannelAIBudget {
  max_daily_tokens: number
  tokens_today: number
  ai_model_id?: string
}

export async function getChannelAIBudget(channelId: string): Promise<ChannelAIBudget> {
  const res = await axiosInstance.get(`/ch/${channelId}/ai-budget`, {
    // @ts-expect-error — suppress the global loading bar for this background fetch
    silent: true,
  })
  return (res.data as { data?: ChannelAIBudget })?.data || { max_daily_tokens: 0, tokens_today: 0 }
}

// setChannelAIBudget updates a channel's AI settings. maxDailyTokens is always
// sent; aiModelId is sent only when provided ("" clears the model override, a
// uuid pins it) so callers that only change the cap leave the model untouched.
export async function setChannelAIBudget(
  channelId: string,
  maxDailyTokens: number,
  aiModelId?: string,
): Promise<void> {
  const body: Record<string, unknown> = { channel_id: channelId, max_daily_tokens: maxDailyTokens }
  if (aiModelId !== undefined) body.ai_model_id = aiModelId
  await axiosInstance.post("/ch/ai-budget", body)
}

// ─── Agent evaluation harness ────────────────────────────────────────────────
// Saved, scored test scenarios for an agent. Turns the one-shot test into a
// repeatable suite so an owner can prove behavior and catch regressions.

export interface EvalExpectations {
  must_contain?: string[]
  must_not_contain?: string[]
  expected_tools?: string[]
  forbidden_tools?: string[]
  expected_status?: string
}

export interface EvalScenario {
  id: string
  agent_id: string
  name: string
  prompt: string
  expectations: EvalExpectations
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface EvalScenarioInput {
  name: string
  prompt: string
  expectations: EvalExpectations
  is_active: boolean
}

export interface EvalCheck {
  kind: string
  target: string
  passed: boolean
  reason: string
}

export interface EvalScore {
  passed: boolean
  score: number
  inconclusive?: boolean
  reason?: string
  checks: EvalCheck[]
}

export interface ScenarioRunResult {
  scenario_id: string
  name: string
  run_id: string
  result: EvalScore
}

export interface SuiteRunResult {
  agent_id: string
  total: number
  passed: number
  scored: number
  scenarios: ScenarioRunResult[]
}

export interface AgentEvalSummary {
  scenario_count: number
  passed: number
  scored: number
  last_evaluated_at?: string | null
  /**
   * The agent was edited after these numbers were measured, so the pass rate
   * describes a version that no longer exists. The backend reruns stale suites
   * on its own, so this clears without anyone pressing anything.
   */
  stale?: boolean
}

export async function listEvalScenarios(agentId: string): Promise<EvalScenario[]> {
  const res = await axiosInstance.get(`${GetEndpointUrl.GetAgents}/${agentId}/eval/scenarios`)
  return (res.data?.data as EvalScenario[]) || []
}

export async function createEvalScenario(agentId: string, input: EvalScenarioInput): Promise<EvalScenario> {
  const res = await axiosInstance.post(`${GetEndpointUrl.GetAgents}/${agentId}/eval/scenarios`, input)
  return res.data?.data as EvalScenario
}

export async function updateEvalScenario(scenarioId: string, input: EvalScenarioInput): Promise<EvalScenario> {
  const res = await axiosInstance.post(`${GetEndpointUrl.GetAgents}/eval/scenarios/${scenarioId}/update`, input)
  return res.data?.data as EvalScenario
}

export async function deleteEvalScenario(scenarioId: string): Promise<void> {
  await axiosInstance.post(`${GetEndpointUrl.GetAgents}/eval/scenarios/${scenarioId}/delete`)
}

export async function runEvalScenario(scenarioId: string): Promise<ScenarioRunResult> {
  const res = await axiosInstance.post(`${GetEndpointUrl.GetAgents}/eval/scenarios/${scenarioId}/run`)
  return res.data?.data as ScenarioRunResult
}

export async function runEvalSuite(agentId: string): Promise<SuiteRunResult> {
  const res = await axiosInstance.post(`${GetEndpointUrl.GetAgents}/${agentId}/eval/run`)
  return res.data?.data as SuiteRunResult
}

export async function getAgentEvalSummary(agentId: string): Promise<AgentEvalSummary | null> {
  const res = await axiosInstance.get(`${GetEndpointUrl.GetAgents}/${agentId}/eval/summary`, {
    // @ts-expect-error — suppress the global loading bar for this background fetch
    silent: true,
  })
  return (res.data?.data as AgentEvalSummary) || null
}

// getAgentEvalSummaryBatch fetches the per-agent eval rollup for the whole list
// in one request (no N+1), keyed by agent id. Agents with no active tests are
// simply absent from the map.
export async function getAgentEvalSummaryBatch(): Promise<Record<string, AgentEvalSummary>> {
  const res = await axiosInstance.get(`${GetEndpointUrl.GetAgents}/eval/summary`, {
    // @ts-expect-error — suppress the global loading bar for this background fetch
    silent: true,
  })
  return (res.data?.data as Record<string, AgentEvalSummary>) || {}
}

// ─── Agent outcomes: what people did with what an agent proposed ─────────────
//
// The other half of "is this agent any good". The eval rollup above scores an
// agent against test cases its own author wrote; this counts the decisions real
// people made on its real proposals. Kept as a separate call, and rendered as a
// separate badge, because reading one as the other is the mistake worth
// preventing.

/** An agent has proposed nothing anybody has ruled on yet. */
export const OUTCOME_UNMEASURED = -1

export interface AgentOutcome {
  approved: number
  rejected: number
  expired: number
  pending: number
  /** Approved, then the execution failed. An execution bug, not a rejection. */
  failed: number
  /** approved + rejected: the proposals a person actually ruled on. */
  decided: number
  /** approved/decided, or OUTCOME_UNMEASURED when nobody has decided yet. */
  acceptance_rate: number
  /**
   * Proposals are expiring unanswered rather than being decided. Reported apart
   * from a low acceptance rate on purpose: an agent people argue with is being
   * used, an agent people scroll past is not.
   */
  ignored: boolean
}

/** True when nobody has ruled on this agent yet, which is not the same as 0%. */
export function outcomeMeasured(o: AgentOutcome | undefined | null): boolean {
  return !!o && o.acceptance_rate !== OUTCOME_UNMEASURED && o.decided > 0
}

/** Which of the three things the outcome badge can say. */
export type OutcomeBadgeState = "none" | "ignored" | "scored"

/**
 * The badge's decision, exported so the component and its test share one copy.
 *
 * The eval badge next to it keeps this logic inline and restates it in its own
 * test, which the test itself notes it is mirroring. Two copies of a branch is
 * two things to keep in step, and the point of a badge test is that the badge
 * cannot quietly start saying something else.
 *
 * "ignored" outranks "scored" for the same reason "stale" outranks a pass rate:
 * "3 of 4 kept" is a true number and the wrong headline for an agent whose
 * proposals nobody is answering any more.
 */
export function outcomeBadgeState(o: AgentOutcome | undefined | null): OutcomeBadgeState {
  if (o?.ignored) return "ignored"
  return outcomeMeasured(o) ? "scored" : "none"
}

/**
 * Roll every visible agent's record into one workspace figure.
 *
 * Summed on the client from the map the page already has rather than added as
 * another endpoint: it is the same numbers, the request is already in flight,
 * and a second query would be a second definition of the same total to keep in
 * step with this one.
 *
 * Returns decided === 0 when nobody has ruled on anything, which callers must
 * render as "nothing yet" rather than as 0%.
 */
export function sumOutcomes(byAgent: Record<string, AgentOutcome> | undefined | null): AgentOutcome {
  const total: AgentOutcome = {
    approved: 0, rejected: 0, expired: 0, pending: 0, failed: 0,
    decided: 0, acceptance_rate: OUTCOME_UNMEASURED, ignored: false,
  }
  for (const o of Object.values(byAgent ?? {})) {
    total.approved += o.approved
    total.rejected += o.rejected
    total.expired += o.expired
    total.pending += o.pending
    total.failed += o.failed
    total.decided += o.decided
  }
  if (total.decided > 0) total.acceptance_rate = total.approved / total.decided
  return total
}

export async function getAgentOutcome(agentId: string): Promise<AgentOutcome | null> {
  const res = await axiosInstance.get(`${GetEndpointUrl.GetAgents}/${agentId}/outcome`, {
    // @ts-expect-error — suppress the global loading bar for this background fetch
    silent: true,
  })
  return (res.data?.data as AgentOutcome) || null
}

// One request for the whole list (no N+1), keyed by agent id. Every visible
// agent is present, including one with nothing decided yet, so an absent key
// means "not visible to you" rather than "no data".
export async function getAgentOutcomeBatch(): Promise<Record<string, AgentOutcome>> {
  const res = await axiosInstance.get(`${GetEndpointUrl.GetAgents}/outcomes`, {
    // @ts-expect-error — suppress the global loading bar for this background fetch
    silent: true,
  })
  return (res.data?.data as Record<string, AgentOutcome>) || {}
}

// ─── Reusable agent skills (workspace library) ───────────────────────────────

export interface AgentSkill {
  id: string
  name: string
  instructions: string
  created_by: string
  created_at: string
  updated_at: string
}

export interface SkillInput {
  name: string
  instructions: string
}

export async function listAgentSkills(): Promise<AgentSkill[]> {
  const res = await axiosInstance.get(`/agent-skills`)
  return (res.data?.data as AgentSkill[]) || []
}

export async function createAgentSkill(input: SkillInput): Promise<AgentSkill> {
  const res = await axiosInstance.post(`/agent-skills`, input)
  return res.data?.data as AgentSkill
}

export async function deleteAgentSkill(id: string): Promise<void> {
  await axiosInstance.post(`${GetEndpointUrl.GetAgents}-skills/${id}/delete`)
}
