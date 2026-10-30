/**
 * A project's rules (package 9 R1, backend business/Workflow): a trigger, the
 * conditions read against the task when it runs, what it does then and,
 * optionally, otherwise. The shapes are the server's JSON.
 */

export type RuleTrigger =
  | "task_created"
  | "task_status_changed"
  | "task_assigned"
  | "task_field_changed"
  | "schedule"
  | "task_due_soon"
  | "task_overdue"
  | "form_submitted"
  | "approval_decided"

export type RuleActionType =
  | "set_status"
  | "set_priority"
  | "assign"
  | "set_due"
  | "add_comment"
  | "add_subtask"
  | "notify"
  | "reply"
  | "create_task"
  | "ask_agent"

export type AssignHow = "person" | "round_robin" | "least_loaded" | "creator" | "actor" | "nobody"
export type NotifyWhom = "assignee" | "creator" | "actor" | "people"
export type Priority = "low" | "medium" | "high"
export type WatchedField = "priority" | "due" | "tags" | "name"

export interface RuleAction {
  type: RuleActionType
  status?: string
  priority?: Priority | ""
  assign?: AssignHow
  user_ids?: string[]
  due_in_days?: number | null
  notify?: NotifyWhom
  text?: string
  task_name?: string
  project_id?: string
  /** ask_agent: the AI teammate asked (its principal's user id); none asks OneCamp AI. */
  agent_id?: string
}

export type ConditionField = "priority" | "status" | "assignee" | "tags" | "name" | "due" | "creator"
export type ConditionOp =
  | "is"
  | "is_not"
  | "is_empty"
  | "is_set"
  | "has"
  | "has_not"
  | "contains"
  | "not_contains"
  | "within_days"
  | "overdue"

export interface RuleCondition {
  field: ConditionField
  op: ConditionOp
  value?: string
}

export interface RuleConditions {
  match?: "all" | "any"
  items?: RuleCondition[]
}

export interface RuleTriggerConfig {
  to_status?: string
  fields?: WatchedField[]
  /** The zone of whoever saved the rule: where its due dates are days and its schedule keeps time. */
  tz?: string
  /** A schedule: its repeat rule (lib/rules/schedule), its first day ("2026-10-20"), and whether it acts for each task. */
  repeat?: string
  from?: string
  each_task?: boolean
  /** A schedule's or a due trigger's time of day, "09:00". */
  at?: string
  /** Due soon: how many days before the due day (0 is the day itself). */
  days?: number
  /** A form's rule: the project's form it runs on (package 9 R4). */
  form_id?: string
  /** An answered approval's rule: how the request must end; none is any ending (package 9 R2b). */
  outcome?: ApprovalOutcome
}

export type ApprovalOutcome = "approved" | "changes" | "rejected"

export interface Rule {
  id: string
  name: string
  is_active: boolean
  created_by: string
  trigger_type: RuleTrigger
  trigger_config: RuleTriggerConfig
  conditions: RuleConditions
  actions: RuleAction[]
  else_actions: RuleAction[]
  run_count: number
  last_run_at?: string | null
  last_error?: string | null
  paused_reason?: string | null
  /** A schedule's next run, while it is on. */
  next_run_at?: string | null
  updated_at: string
}

export interface RuleTemplate {
  key: string
  name: string
  description: string
  hue: string
  trigger_type: RuleTrigger
  trigger_config?: RuleTriggerConfig
  conditions: RuleConditions
  actions: RuleAction[]
  else_actions?: RuleAction[]
  /** Only the AI edition offers it ("ask an agent"). */
  needs_ai?: boolean
}

export interface RuleDraft {
  name: string
  is_active: boolean
  trigger_type: RuleTrigger
  trigger_config: RuleTriggerConfig
  conditions: RuleConditions
  actions: RuleAction[]
  else_actions: RuleAction[]
}

export type RunStatus = "running" | "ok" | "failed" | "skipped" | "undone"

export interface RunStep {
  type: string
  status: "ok" | "failed" | "skipped" | "undone"
  detail?: string
  task_id?: string
  field?: string
  before?: unknown
  after?: unknown
  made?: string
}

export interface RuleRun {
  id: string
  workflow_id: string
  trigger: string
  subject_id?: string
  subject?: string
  status: RunStatus
  branch?: "then" | "else" | ""
  error?: string
  steps: RunStep[]
  started_at: string
  finished_at?: string | null
  undone_by?: string | null
  undone_at?: string | null
  /** A schedule run for each task: how many tasks its conditions held for. */
  matched?: number | null
}

export interface RulesPayload {
  rules: Rule[]
  can_manage: boolean
  templates: RuleTemplate[]
  max: number
  /** Whether this build can ask an agent (the AI edition). */
  agents?: boolean
}

/** The most actions a branch takes, as the server allows. */
export const MAX_ACTIONS = 10
/** The most conditions a rule has. */
export const MAX_CONDITIONS = 10
