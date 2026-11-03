import { htmlOfMarkdown, markdownOfHTML } from "@/lib/codec/htmlMarkdown"
import { draftOf as typedDraft, type FieldValue, type TaskField } from "@/lib/tasks/fields"
import { readAnswer } from "@/lib/tasks/fieldInput"
import { ASKS, type TaskTemplate, type TemplateShape } from "@/lib/work/taskTemplates"
import type { Kept } from "@/lib/work/taskTemplatesKeep"

/**
 * A task template as the manager's editor holds it (linear-09), and back as the server keeps it. Each value is
 * as its box shows it: the body as Markdown (kept as HTML, as a task's description is: lib/codec/htmlMarkdown), a
 * field's value as the shared answer box holds it (components/forms/AnswerInput), a day as typed, the status
 * by its value and the assignee by their id. A field the project no longer has stays as the template had it.
 */
export interface Draft {
  name: string
  about: string
  /** The task's own name. */
  title: string
  /** The task's description, as Markdown ("" for none); the server keeps it as HTML, as a task's. */
  body: string
  /** The status a task starts in, by its value ("": the project's first). */
  status: string
  /** Who a task is given to: a person or an AI teammate, by id ("": nobody). */
  assignee: string
  type: string
  /** The template a new task of its type starts from. */
  isDefault: boolean
  priority: string
  labels: string
  startDay: string
  dueDay: string
  subtasks: string[]
  /** The project's fields it sets, by id, as the answer box holds each. */
  fields: Record<string, unknown>
  /** What it asks for before a task is made: a property's name, or "field:<id>". */
  asks: string[]
}

/** A day counts from the day a task is made (projectTemplate.MaxDay on the server). */
export const MOST_DAYS = 365

/** A field's value as the shared answer box holds it: a tick, the ids ticked, a choice's id, or what's typed. */
function answerOf(field: TaskField, value: unknown): unknown {
  switch (field.type) {
    case "checkbox":
      return value === true
    case "multi_select":
      return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : []
    case "select":
    case "person":
    case "date":
      return typeof value === "string" ? value : ""
    default:
      return typedDraft(field, value as FieldValue | undefined)
  }
}

/** A template (none: a new one) as the editor shows it, its fields read by the project's. */
export function draftOf(t: TaskTemplate | undefined, fields: readonly TaskField[]): Draft {
  const s: Partial<TemplateShape> = t?.shape ?? {}
  const set = s.fields ?? {}
  return {
    name: t?.name ?? "",
    about: t?.description ?? "",
    title: s.name ?? "",
    body: markdownOfHTML(s.description),
    status: s.status ?? "",
    assignee: s.assignee ?? "",
    type: s.type ?? "",
    isDefault: !!t?.default_for,
    priority: s.priority ?? "",
    labels: s.tags ?? "",
    startDay: typeof s.start_day === "number" ? String(s.start_day) : "",
    dueDay: typeof s.due_day === "number" ? String(s.due_day) : "",
    subtasks: (s.subtasks ?? []).map((st) => st.name),
    fields: Object.fromEntries(fields.filter((f) => f.id in set).map((f) => [f.id, answerOf(f, set[f.id])])),
    asks: s.required ?? [],
  }
}

/** What a template may ask for here: the form's properties, then the project's fields. */
export function askable(fields: readonly Pick<TaskField, "id">[]): string[] {
  return [...Object.keys(ASKS), ...fields.map((f) => `field:${f.id}`)]
}

/** A typed day: none, or a whole number from 0 to MOST_DAYS; null for anything else. */
function dayOf(typed: string): number | undefined | null {
  const t = typed.trim()
  if (t === "") return undefined
  if (!/^\d+$/.test(t)) return null
  const n = Number(t)
  return n <= MOST_DAYS ? n : null
}

/**
 * The draft as the server keeps it, over the template it was read from (none: a new one), or what to fix, in
 * words. The body goes back as it came while its Markdown is unchanged, so an edit elsewhere never rewrites it;
 * the fields the editor shows are read as their boxes hold them, and one the project no longer has stays.
 */
export function keptOf(d: Draft, was: TaskTemplate | undefined, fields: readonly TaskField[]): { kept: Kept } | { error: string } {
  const name = d.name.trim()
  if (!name) return { error: "Give the template a name." }
  const start = dayOf(d.startDay)
  const due = dayOf(d.dueDay)
  if (start === null || due === null) return { error: `A day counts from the day the task is made: a whole number from 0 to ${MOST_DAYS}.` }
  if (start !== undefined && due !== undefined && due < start) return { error: `The task would be due before it starts: make its due day ${start} or later.` }
  const shown = new Set(fields.map((f) => f.id))
  const values: Record<string, FieldValue> = {}
  for (const [id, v] of Object.entries(was?.shape.fields ?? {})) if (!shown.has(id)) values[id] = v as FieldValue
  for (const f of fields) {
    if (!(f.id in d.fields)) continue
    const read = readAnswer(f, d.fields[f.id])
    if ("error" in read) return { error: read.error }
    if (read.value !== null) values[f.id] = read.value
  }
  const html = d.body === markdownOfHTML(was?.shape.description) ? was?.shape.description : htmlOfMarkdown(d.body)
  const type = d.type || undefined
  const shape: TemplateShape = {
    ...was?.shape,
    // Where New task's title starts (the maker types after "Bug: "): kept as typed, and none when only spaces.
    name: d.title.trim() ? d.title : "",
    description: html || undefined,
    status: d.status || undefined,
    assignee: d.assignee || undefined,
    priority: d.priority || undefined,
    tags: d.labels.trim() || undefined,
    type,
    start_day: start,
    due_day: due,
    subtasks: d.subtasks.map((s) => s.trim()).filter(Boolean).map((n) => ({ name: n })),
    fields: Object.keys(values).length ? values : undefined,
    required: d.asks.length ? d.asks : undefined,
  }
  return { kept: { name, description: d.about.trim(), default_for: d.isDefault && type ? type : "", shape } }
}
