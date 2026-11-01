import { dueDateOf, dueState, dueWords, type DueState } from "@/components/task/DueLabel"
import type { StatusKind } from "@/components/ui/graphics/glyphs"
import { displayNameOf } from "@/lib/personName"
import { splitTags } from "@/lib/tags"
import { CATEGORY_KIND, isBuiltInStatus, isClosedStatus } from "@/lib/taskStatus"
import { removeHtmlTags } from "@/lib/utils/removeHtmlTags"
import type { SearchResult } from "@/services/searchService"
import type { TaskInfoInterface } from "@/types/task"
import { TASK_PRIORITIES, taskStatusLabel } from "@/types/taskScale"

// What ⌘K's Space preview shows beyond its row (V-db63-1 S2). The row already
// has the title and where it's from. A preview earns its place with what the
// row can't show, as Linear's peek opens an issue's properties and body: a
// task's status, priority, assignee, due date and label, and the first line
// a task, doc or board says.

/** A task's properties as a preview reads them, from its search hit or from the task's own read. */
export interface TaskPeekFields {
  id: string
  /** The built-in status, or the category a project's own status counts as (task_status). */
  status?: string
  /** A project's own status, by name. Only the task's read has it. */
  statusName?: string
  priority?: string
  assignee?: string
  /** When it is due. Only the task's read has it: the search index carries no due date. */
  due?: string
  label?: string
}

/** One of a preview's properties, ready to draw. */
export type PeekFact =
  | { kind: "status"; text: string; glyph: StatusKind }
  | { kind: "priority"; text: string; level: 1 | 2 | 3 | 4 }
  | { kind: "assignee"; text: string }
  /** The task row's words and state for the date (components/task/DueLabel): "Today" is never late; a finished task's date is "done". */
  | { kind: "due"; text: string; state: DueState }
  /** One of the task's labels (lib/tags): a label holds several, as its card shows. */
  | { kind: "label"; text: string }

const text = (v: unknown): string | undefined => (typeof v === "string" && v.trim() ? v.trim() : undefined)

/** The fields a task's search hit carries (models/openSearch OpenSearchTask). Pure. */
export function taskFieldsOfHit(t: Record<string, unknown> | undefined): TaskPeekFields | undefined {
  const id = text(t?.task_id)
  if (!t || !id) return undefined
  return {
    id,
    status: text(t.task_status),
    priority: text(t.task_priority),
    assignee: text(t.task_assignee_user_full_name),
    label: text(t.task_label),
  }
}

/** The fields the task's own read carries: GET /task/info, the one the task panel and the link cards make. Pure. */
export function taskFieldsOfRead(id: string, t: TaskInfoInterface): TaskPeekFields {
  return {
    id,
    status: text(t.task_status),
    statusName: text(t.task_custom_status_name),
    priority: text(t.task_priority),
    assignee: text(displayNameOf(t.task_assignee)),
    due: text(t.task_due_date),
    label: text(t.task_label),
  }
}

/**
 * A task's properties, in the order Linear's peek reads them: status,
 * priority, assignee, due date, labels. Each is left out when the task has
 * none. The due date follows the task UI's one rule (DueLabel's dueDateOf,
 * dueWords and dueState): a date is a day, so one due today is "Today" and
 * never late, and a finished task's date is never late. Pure.
 */
export function taskFacts(f: TaskPeekFields, now: Date): PeekFact[] {
  const facts: PeekFact[] = []
  if (f.statusName || f.status) {
    const glyph = f.status && isBuiltInStatus(f.status) ? CATEGORY_KIND[f.status] : "todo"
    facts.push({ kind: "status", text: f.statusName || taskStatusLabel(f.status ?? ""), glyph })
  }
  const priority = TASK_PRIORITIES.find((p) => p.value === f.priority)
  if (priority) facts.push({ kind: "priority", text: priority.label, level: priority.level })
  if (f.assignee) facts.push({ kind: "assignee", text: f.assignee })
  const due = dueDateOf(f.due)
  if (due) facts.push({ kind: "due", text: dueWords(due, now), state: dueState(due, isClosedStatus(f.status), now) })
  for (const label of splitTags(f.label)) facts.push({ kind: "label", text: label })
  return facts
}

// A stored body is HTML, so a block's end is a line's end. Markdown that came
// in from GitHub or an import keeps its marks; a line's leading ones go.
const BLOCK_END = /<\/(?:p|div|li|h[1-6]|blockquote|pre|tr)>|<br\s*\/?>/gi
const LEADING_MARK = /^(?:#{1,6}\s+|[-*+]\s+(?:\[[ xX]\]\s+)?|>\s*|\d+[.)]\s+)/

/**
 * The first line a body says, as plain text, cut near `max` at a word with an
 * ellipsis. "" when it says nothing. Pure.
 */
export function firstLine(body: string | null | undefined, max = 160): string {
  if (!body) return ""
  const lines = removeHtmlTags(body.replace(BLOCK_END, "\n")).split("\n")
  const line = lines.map((l) => l.replace(/\s+/g, " ").trim().replace(LEADING_MARK, "").trim()).find(Boolean) ?? ""
  if (line.length <= max) return line
  const cut = line.slice(0, max)
  const space = cut.lastIndexOf(" ")
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).trimEnd()}…`
}

/** What a search hit's preview adds to its row. `meta` is set only where the row's own would repeat a property. */
export interface HitPeek {
  task?: TaskPeekFields
  line?: string
  meta?: string
}

/**
 * What a search hit's preview adds to its row: a task's properties and the
 * first line of a task, doc or board. A task's preview says its project
 * alone where it's from, since its assignee has a property of its own. Pure.
 */
export function hitPeek(result: SearchResult): HitPeek {
  const out: HitPeek = {}
  let line = ""
  if (result.type === "task") {
    const task = taskFieldsOfHit(result.task)
    if (task) out.task = task
    const project = text(result.task?.task_project_name)
    if (project) out.meta = project
    line = firstLine(result.task?.task_desc)
  } else if (result.type === "doc") {
    line = firstLine(result.doc?.doc_snippet || result.doc?.doc_body)
  } else if (result.type === "board") {
    line = firstLine(result.board?.board_snippet)
  }
  if (line) out.line = line
  return out
}
