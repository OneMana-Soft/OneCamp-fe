/**
 * A project's rules (package 9 R1, backend business/Workflow): a trigger, the
 * conditions read against the task when it runs, what it does then and,
 * optionally, otherwise. The shapes are the server's JSON.
 */

export type RuleTrigger = "task_created" | "task_status_changed" | "task_assigned" | "task_field_changed"

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
  /** The zone of whoever saved the rule: where its due dates are days. */
  tz?: string
}

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
}

export interface RulesPayload {
  rules: Rule[]
  can_manage: boolean
  templates: RuleTemplate[]
  max: number
}

/** The most actions a branch takes, as the server allows. */
export const MAX_ACTIONS = 10
/** The most conditions a rule has. */
export const MAX_CONDITIONS = 10
