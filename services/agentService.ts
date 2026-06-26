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
  }>
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

// Parsed trigger configuration. Only the fields relevant to the agent's
// trigger_type are meaningful; mirrors the backend triggerConfig struct.
export interface TriggerConfig {
  interval_minutes?: number // schedule
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
}

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
      { name: "create_table_row", label: "Add a table row", write: true },
      { name: "update_table_row", label: "Update a table row", write: true },
    ],
  },
]

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
