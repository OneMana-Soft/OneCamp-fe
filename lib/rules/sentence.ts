import type { SentencePart } from "@/components/admin/workflowsParts"
import { AlarmClock, BadgeCheck, Bell, CalendarClock, ClipboardList, Clock, Flag, Hash, ListTodo, MessageSquare, Pencil, Gauge, Repeat, Tag, Type, User, UserPlus, type LucideIcon } from "@/lib/icons"
import { dueText, scheduleText } from "@/lib/rules/schedule"
import type { ApprovalOutcome, RuleAction, RuleCondition, RuleDraft } from "@/lib/rules/types"
import { orList } from "@/lib/utils/format/orList"

const OUTCOME: Record<ApprovalOutcome, string> = { approved: "a task is approved", changes: "changes are asked for on a task", rejected: "a task's approval is rejected" }

/**
 * A project's rule said as one sentence, in the grammar the workspace's
 * workflows use (components/admin/workflowsParts): "When [a task moves to
 * Done] if [it's high priority] → [tell its creator] otherwise → [...]".
 * Tokens are neutral chips (a trigger, a condition and an action are
 * categories, never hues); the data inside them (a status, a person) carries
 * its own colour where the builder draws it.
 */
export interface RuleNames {
  status?: (value: string) => string | undefined
  person?: (id: string) => string | undefined
  /** An AI teammate's name, by its principal's id. */
  agent?: (id: string) => string | undefined
  /** One of the project's forms, by id. */
  form?: (id: string) => string | undefined
}


const PRIORITY: Record<string, string> = { low: "low", medium: "medium", high: "high" }
const FIELD: Record<string, string> = { priority: "priority", due: "due date", tags: "tags", name: "name" }

const token = (role: "trigger" | "condition" | "action", text: string, icon?: LucideIcon): SentencePart => ({ kind: "token", role, text, icon })

function personOf(id: string | undefined, names: RuleNames) {
  return (id && names.person?.(id)) || "someone"
}

/** The trigger, said. */
export function triggerText(r: Pick<RuleDraft, "trigger_type" | "trigger_config">, names: RuleNames = {}): string {
  switch (r.trigger_type) {
    case "task_created":
      return "a task is made"
    case "task_assigned":
      return "a task is assigned"
    case "task_field_changed": {
      const f = (r.trigger_config.fields ?? []).map((x) => FIELD[x] ?? x)
      return f.length ? `a task's ${orList(f)} changes` : "a task changes"
    }
    case "task_status_changed": {
      const to = r.trigger_config.to_status
      return to ? `a task moves to ${names.status?.(to) ?? to}` : "a task changes status"
    }
    case "schedule":
      return scheduleText(r.trigger_config.repeat, r.trigger_config.at)
    case "task_due_soon":
    case "task_overdue":
      return dueText(r.trigger_type, r.trigger_config.days)
    case "form_submitted": {
      const form = r.trigger_config.form_id ? names.form?.(r.trigger_config.form_id) : undefined
      return form ? `‘${form}’ is sent` : "a form is sent"
    }
    case "approval_decided":
      return r.trigger_config.outcome ? OUTCOME[r.trigger_config.outcome] : "a task's approval is answered"
  }
  return "something happens"
}

/** The trigger's glyph: a clock for time, a tag for a change of details, a form's clipboard, an approval's badge, a task for the rest. */
function triggerGlyph(r: Pick<RuleDraft, "trigger_type">): LucideIcon {
  if (r.trigger_type === "schedule") return Clock
  if (r.trigger_type === "form_submitted") return ClipboardList
  if (r.trigger_type === "approval_decided") return BadgeCheck
  if (r.trigger_type === "task_due_soon" || r.trigger_type === "task_overdue") return AlarmClock
  return r.trigger_type === "task_field_changed" ? Tag : ListTodo
}

/** Whether a rule is a schedule that acts for each task its conditions choose. */
export const forEachTask = (r: Pick<RuleDraft, "trigger_type" | "trigger_config">) => r.trigger_type === "schedule" && !!r.trigger_config.each_task

/** One condition, said. */
export function conditionText(c: RuleCondition, names: RuleNames = {}): string {
  const v = c.value ?? ""
  switch (c.field) {
    case "priority":
      return `${c.op === "is_not" ? "it isn't" : "it's"} ${PRIORITY[v] ?? v} priority`
    case "status":
      return `${c.op === "is_not" ? "it isn't" : "it's"} in ${names.status?.(v) ?? v}`
    case "assignee":
      if (c.op === "is_empty") return "nobody has it"
      if (c.op === "is_set") return "someone has it"
      return `${personOf(v, names)} ${c.op === "is_not" ? "doesn't have" : "has"} it`
    case "creator":
      return `${personOf(v, names)} ${c.op === "is_not" ? "didn't make" : "made"} it`
    case "tags":
      if (c.op === "is_empty") return "it has no tags"
      return `it's ${c.op === "has_not" ? "not " : ""}tagged ${v}`
    case "name":
      return `its name ${c.op === "not_contains" ? "doesn't say" : "says"} ‘${v}’`
    case "due":
      if (c.op === "is_empty") return "it has no due date"
      if (c.op === "is_set") return "it has a due date"
      if (c.op === "overdue") return "it's overdue"
      return `it's due within ${v} ${v === "1" ? "day" : "days"}`
  }
  return "a condition"
}

const ASSIGN: Record<string, [string, LucideIcon]> = {
  round_robin: ["share it out by turns", Repeat],
  least_loaded: ["give it to whoever has least", Gauge],
  creator: ["give it to its creator", UserPlus],
  actor: ["give it to whoever moved it", UserPlus],
  nobody: ["unassign it", User],
}

/** One action, said, with its glyph. */
export function actionPart(a: RuleAction, names: RuleNames = {}): [string, LucideIcon] {
  switch (a.type) {
    case "set_status":
      return [`move it to ${names.status?.(a.status ?? "") ?? a.status ?? "a status"}`, Flag]
    case "set_priority":
      return [`make it ${PRIORITY[a.priority ?? ""] ?? a.priority} priority`, Hash]
    case "assign":
      if (a.assign === "person") return [`give it to ${personOf(a.user_ids?.[0], names)}`, UserPlus]
      return ASSIGN[a.assign ?? ""] ?? ["assign it", UserPlus]
    case "set_due":
      if (a.due_in_days == null) return ["clear its due date", CalendarClock]
      if (a.due_in_days === 0) return ["make it due today", CalendarClock]
      return [`make it due in ${a.due_in_days} ${a.due_in_days === 1 ? "day" : "days"}`, CalendarClock]
    case "add_comment":
      return ["comment on it", MessageSquare]
    case "add_subtask":
      return [a.task_name ? `add ‘${a.task_name}’` : "add a subtask", ListTodo]
    case "notify": {
      const who =
        a.notify === "assignee" ? "whoever has it" : a.notify === "creator" ? "its creator" : a.notify === "actor" ? "whoever changed it" : orList((a.user_ids ?? []).map((id) => personOf(id, names)))
      return [`tell ${who || "people"}`, Bell]
    }
    case "reply":
      return ["post in a channel", MessageSquare]
    case "create_task":
      return [a.task_name ? `make ‘${a.task_name}’` : "make a task", ListTodo]
  }
  return [String(a.type), Pencil]
}

function actions(parts: SentencePart[], items: RuleAction[], names: RuleNames, max: number) {
  items.slice(0, max).forEach((a, i) => {
    if (i > 0) parts.push({ kind: "text", text: "and" })
    const [text, icon] = actionPart(a, names)
    parts.push(token("action", text, icon))
  })
  if (items.length > max) parts.push({ kind: "text", text: `+${items.length - max}` })
}

/** The parts of a rule's sentence. Pure: the list, the builder's preview and the tests share it. */
export function ruleSentence(r: RuleDraft, names: RuleNames = {}, max = 3): SentencePart[] {
  const parts: SentencePart[] = [{ kind: "text", text: "When" }, token("trigger", triggerText(r, names), triggerGlyph(r))]
  const each = forEachTask(r)
  const conds = r.conditions.items ?? []
  if (each) parts.push({ kind: "text", text: conds.length ? "for each open task where" : "for each open task" })
  conds.slice(0, 2).forEach((c, i) => {
    const joint = i === 0 ? (each ? "" : "if") : r.conditions.match === "any" ? "or" : "and"
    if (joint) parts.push({ kind: "text", text: joint })
    parts.push(token("condition", conditionText(c, names), Type))
  })
  if (conds.length > 2) parts.push({ kind: "text", text: `+${conds.length - 2}` })
  if (r.actions.length) {
    parts.push({ kind: "arrow" })
    actions(parts, r.actions, names, max)
  }
  if (r.else_actions.length) {
    parts.push({ kind: "text", text: "otherwise" })
    actions(parts, r.else_actions, names, Math.max(1, max - 1))
  }
  return parts
}

/** The sentence as plain words (an accessible name, a toast). */
export function sentenceText(parts: SentencePart[]): string {
  return parts.map((p) => (p.kind === "arrow" ? "then" : p.text)).join(" ")
}

/**
 * A name for a rule, from what it does, until someone types their own: "Every
 * Monday at 9:00 AM: make ‘Review the week’", "A task is due tomorrow: ask
 * OneCamp AI". Pure.
 */
export function suggestedName(r: RuleDraft, names: RuleNames = {}): string {
  const when = triggerText(r, names)
  const first = r.actions[0]
  const what = first ? actionPart(first, names)[0] : ""
  const name = `${when.charAt(0).toUpperCase()}${when.slice(1)}${what ? `: ${what}` : ""}`
  return name.length > 120 ? `${name.slice(0, 119)}…` : name
}
