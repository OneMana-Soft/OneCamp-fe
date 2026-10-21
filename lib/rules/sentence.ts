import type { SentencePart } from "@/components/admin/workflowsParts"
import { Bell, CalendarClock, Flag, Hash, ListTodo, MessageSquare, Pencil, Gauge, Repeat, Tag, Type, User, UserPlus, type LucideIcon } from "@/lib/icons"
import type { RuleAction, RuleCondition, RuleDraft } from "@/lib/rules/types"

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
}

const PRIORITY: Record<string, string> = { low: "low", medium: "medium", high: "high" }
const FIELD: Record<string, string> = { priority: "priority", due: "due date", tags: "tags", name: "name" }

const token = (role: "trigger" | "condition" | "action", text: string, icon?: LucideIcon): SentencePart => ({ kind: "token", role, text, icon })

function personOf(id: string | undefined, names: RuleNames) {
  return (id && names.person?.(id)) || "someone"
}

function list(items: string[]) {
  if (items.length <= 1) return items.join("")
  return `${items.slice(0, -1).join(", ")} or ${items[items.length - 1]}`
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
      return f.length ? `a task's ${list(f)} changes` : "a task changes"
    }
    case "task_status_changed": {
      const to = r.trigger_config.to_status
      return to ? `a task moves to ${names.status?.(to) ?? to}` : "a task changes status"
    }
  }
  return "something happens"
}

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
      return [a.task_name ? `add ‘${a.task_name}’` : "add a sub-task", ListTodo]
    case "notify": {
      const who =
        a.notify === "assignee" ? "whoever has it" : a.notify === "creator" ? "its creator" : a.notify === "actor" ? "whoever changed it" : list((a.user_ids ?? []).map((id) => personOf(id, names)))
      return [`tell ${who || "people"}`, Bell]
    }
    case "reply":
      return ["post in a channel", MessageSquare]
    case "create_task":
      return ["make a task", ListTodo]
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
  const parts: SentencePart[] = [{ kind: "text", text: "When" }, token("trigger", triggerText(r, names), r.trigger_type === "task_field_changed" ? Tag : ListTodo)]
  const conds = r.conditions.items ?? []
  conds.slice(0, 2).forEach((c, i) => {
    parts.push({ kind: "text", text: i === 0 ? "if" : r.conditions.match === "any" ? "or" : "and" })
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
