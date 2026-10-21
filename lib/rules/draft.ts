import type { Rule, RuleAction, RuleActionType, RuleCondition, ConditionField, ConditionOp, RuleDraft, RuleTemplate } from "@/lib/rules/types"

/** A new rule's starting point. */
export const BLANK_DRAFT: RuleDraft = {
  name: "",
  is_active: true,
  trigger_type: "task_created",
  trigger_config: {},
  conditions: { match: "all", items: [] },
  actions: [{ type: "assign", assign: "round_robin" }],
  else_actions: [],
}

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v ?? null)) as T

export function draftFromRule(r: Rule): RuleDraft {
  return {
    name: r.name,
    is_active: r.is_active,
    trigger_type: r.trigger_type,
    trigger_config: clone(r.trigger_config ?? {}),
    conditions: { match: r.conditions?.match ?? "all", items: clone(r.conditions?.items ?? []) },
    actions: clone(r.actions ?? []),
    else_actions: clone(r.else_actions ?? []),
  }
}

export function draftFromTemplate(t: RuleTemplate): RuleDraft {
  return {
    name: t.name,
    is_active: true,
    trigger_type: t.trigger_type,
    trigger_config: clone(t.trigger_config ?? {}),
    conditions: { match: t.conditions?.match ?? "all", items: clone(t.conditions?.items ?? []) },
    actions: clone(t.actions),
    else_actions: clone(t.else_actions ?? []),
  }
}

/** The ops each field takes, in the order the builder offers them, and how they read. */
export const FIELD_OPS: Record<ConditionField, { op: ConditionOp; label: string }[]> = {
  priority: [{ op: "is", label: "is" }, { op: "is_not", label: "isn't" }],
  status: [{ op: "is", label: "is" }, { op: "is_not", label: "isn't" }],
  assignee: [{ op: "is", label: "is" }, { op: "is_not", label: "isn't" }, { op: "is_empty", label: "is nobody" }, { op: "is_set", label: "is someone" }],
  creator: [{ op: "is", label: "is" }, { op: "is_not", label: "isn't" }],
  tags: [{ op: "has", label: "include" }, { op: "has_not", label: "don't include" }, { op: "is_empty", label: "are empty" }],
  name: [{ op: "contains", label: "says" }, { op: "not_contains", label: "doesn't say" }],
  due: [{ op: "within_days", label: "is within" }, { op: "overdue", label: "has passed" }, { op: "is_empty", label: "isn't set" }, { op: "is_set", label: "is set" }],
}

export const FIELD_LABEL: Record<ConditionField, string> = {
  priority: "Priority", status: "Status", assignee: "Assignee", creator: "Made by", tags: "Tags", name: "Name", due: "Due date",
}

const VALUELESS: ConditionOp[] = ["is_empty", "is_set", "overdue"]
export const needsValue = (op: ConditionOp) => !VALUELESS.includes(op)

/** A condition on a field, with its first op and a sensible value. */
export function newCondition(field: ConditionField): RuleCondition {
  const op = FIELD_OPS[field][0].op
  const value = field === "priority" ? "high" : field === "due" ? "3" : field === "status" ? "todo" : ""
  return { field, op, value }
}

/** An action of a kind, with what it needs filled in where there's a default. */
export function newAction(type: RuleActionType): RuleAction {
  switch (type) {
    case "set_status":
      return { type, status: "inProgress" }
    case "set_priority":
      return { type, priority: "high" }
    case "assign":
      return { type, assign: "round_robin" }
    case "set_due":
      return { type, due_in_days: 3 }
    case "add_comment":
      return { type, text: "" }
    case "add_subtask":
      return { type, task_name: "" }
    case "notify":
      return { type, notify: "assignee", text: "{task} needs you" }
    default:
      return { type }
  }
}

/** What's missing before a draft saves, in words, or "" when it's ready. */
export function draftProblem(d: RuleDraft): string {
  if (!d.name.trim()) return "Name the rule."
  if (d.actions.length === 0) return "Add something for the rule to do."
  for (const c of d.conditions.items ?? []) {
    if (needsValue(c.op) && !(c.value ?? "").trim()) return `Fill in the ${FIELD_LABEL[c.field].toLowerCase()} condition.`
    if (c.field === "due" && c.op === "within_days" && !/^\d{1,3}$/.test(c.value ?? "")) return "Say the due date's days as a number."
  }
  for (const a of [...d.actions, ...d.else_actions]) {
    if (a.type === "add_comment" && !(a.text ?? "").trim()) return "Write the comment."
    if (a.type === "notify" && !(a.text ?? "").trim()) return "Write what the notice says."
    if (a.type === "notify" && a.notify === "people" && !(a.user_ids ?? []).length) return "Pick who to tell."
    if (a.type === "add_subtask" && !(a.task_name ?? "").trim()) return "Name the sub-task."
    if (a.type === "assign" && a.assign === "person" && !(a.user_ids ?? []).length) return "Pick who gets it."
  }
  return ""
}

/**
 * A draft as it is saved: in the zone of whoever saves it, who the rule then
 * acts as. Its due dates are days there (a task due today isn't overdue until
 * tomorrow), and "due in N days" is that day's midnight there, as the date
 * picker writes one. Pure: the caller passes the browser's zone.
 */
export function savedIn(d: RuleDraft, tz: string): RuleDraft {
  return { ...d, trigger_config: { ...d.trigger_config, tz } }
}

/** The words a rule's message may carry, for the hint under a text field. */
export const VARIABLES = ["{task}", "{status}", "{by}", "{project}", "{link}"]
