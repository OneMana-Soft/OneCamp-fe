
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

// Safe JSON parse helpers for the raw string columns.
export function parseEnabledTools(a: Agent): string[] {
  try {
    const v = JSON.parse(a.enabled_tools || "[]")
    return Array.isArray(v) ? v : []
  } catch {
    return []
  }
}

// Tool catalog shown in the builder, grouped by domain. Mirrors the backend
// ai.ToolRegistry. `write` flags a side-effecting tool (shown with a warning).
interface ToolCatalogEntry {
  name: string
  label: string
  write: boolean
}
interface ToolCatalogGroup {
  group: string
  tools: ToolCatalogEntry[]
  // Optional helper line shown under the group header in the builder.
  note?: string
}

const TOOL_CATALOG: ToolCatalogGroup[] = [
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
      { name: "query_plan", label: "Analyze a table in several steps (top-N, %, having)", write: false },
      { name: "create_table_row", label: "Add a table row", write: true },
      { name: "update_table_row", label: "Update a table row", write: true },
    ],
  },
  {
    group: "External data sources",
    note: "Query a connected read-only external database/warehouse the way the agent queries native tables. Deterministic and read-only: the agent describes the query, never SQL. Only sources the agent's owner can access are reachable.",
    tools: [
      { name: "list_data_sources", label: "List data sources", write: false },
      { name: "read_data_source", label: "Read a data source's schema", write: false },
      { name: "query_data_source", label: "Analyze a data source (totals & charts)", write: false },
      { name: "query_data_source_plan", label: "Analyze a data source in several steps (top-N, %, having)", write: false },
    ],
  },
  {
    group: "Knowledge & search",
    tools: [
      { name: "search_workspace", label: "Search workspace & connected apps", write: false },
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
    note: "Read + understand the workspace's connected GitHub repo. Read-only, so safe to grant broadly.",
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
    note: "Runs short Python in a locked-down sandbox (no network, ephemeral filesystem, hard limits) over data the agent can already see, to compute results and draw charts. Available only when an admin has enabled the code sandbox.",
    tools: [
      { name: "run_analysis", label: "Run a data analysis", write: false },
    ],
  },
  {
    group: "Code changes (open a PR)",
    note: "Lets the agent WRITE code and open a pull request for a human to review. The change is made in an isolated, network-locked runner, verified against the repo's own build/tests, and opened as a reviewable PR on a fresh branch, never merged automatically. Available only when an admin has enabled code PRs and deployed a coding runner.",
    tools: [
      { name: "code_pr", label: "Open a pull request", write: true },
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
