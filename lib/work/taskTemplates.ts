import type { FieldValue, TaskField } from "@/lib/tasks/fields"
import type { ProjectType } from "@/lib/work/keysApi"
import type { UserProfileDataInterface } from "@/types/user"

/** A template as the project's list names it (business/TaskTemplate Summary): project_id is "" for the workspace's. */
export interface TemplateSummary {
  id: string
  project_id?: string
  name: string
  description?: string
  default_for?: string
  updated_at?: string
}

/** What a template fills in on the task it makes (business/TaskTemplate Shape). */
export interface TemplateShape {
  name: string
  description?: string
  status?: string
  priority?: string
  tags?: string
  start_day?: number
  due_day?: number
  subtasks?: { name: string }[]
  type?: string
  assignee?: string
  fields?: Record<string, unknown>
  required?: string[]
}

/** A template in full. */
export interface TaskTemplate {
  id: string
  project_id?: string
  name: string
  description?: string
  default_for?: string
  shape: TemplateShape
  /** The preset assignee as the server knows them (a person or an AI teammate), while they may be given its tasks. */
  assignee_who?: UserProfileDataInterface
}

/** A place's list, the template each type starts from, who keeps them, and the types a template there may have. */
export interface TemplateList {
  templates: TemplateSummary[]
  defaults: Record<string, string>
  can_manage: boolean
  can_manage_workspace?: boolean
  types?: ProjectType[]
}

/** What the form shows, as make takes it over the template (business/TaskTemplate Typed). */
export interface Typed {
  name?: string
  description?: string
  priority?: string
  tags?: string
  status?: string
  assignee?: string
  type?: string
  start?: string
  due?: string
  clear_start?: boolean
  clear_due?: boolean
  fields?: Record<string, FieldValue>
}

/** The form's starting values from a template. */
export interface Prefill {
  name?: string
  description?: string
  priority?: string
  status?: string
  tags?: string
  assignee?: string
  start?: Date
  due?: Date
}

/** The form's values, as typedOf reads them. */
export interface FormValues {
  name: string
  description?: string
  priority?: string
  tags?: string
  status?: string
  assignee?: string
  type?: string
  start?: Date
  due?: Date
  fields?: Record<string, FieldValue>
}

/** The properties a template may ask for, as the form names them (taskWriter.Prop*), in the order the manager offers them. */
export const ASKS: Record<string, string> = {
  description: "Description",
  priority: "Priority",
  due: "Due date",
  start: "Start date",
  tags: "Labels",
  assignee: "Assignee",
  type: "Type",
}
const FIELD_ASK = "field:"

/** The field an ask names ("field:<id>"), or null for one of the form's own properties. */
export function askedField(prop: string): string | null {
  return prop.startsWith(FIELD_ASK) ? prop.slice(FIELD_ASK.length) : null
}

/** What a template asks for, in the form's words; a field by the project's name for it. */
export function askLabel(prop: string, fields: Pick<TaskField, "id" | "name">[]): string {
  const field = askedField(prop)
  if (field !== null) return fields.find((f) => f.id === field)?.name ?? "A field"
  return ASKS[prop] ?? prop
}

/** The day n days after today's, at its start, in the maker's own calendar. */
const dayFrom = (today: Date, n: number) => new Date(today.getFullYear(), today.getMonth(), today.getDate() + n)

/** A template's shape as the form's starting values: only what it sets, its days counted from today. */
export function prefillOf(shape: TemplateShape, today: Date): Prefill {
  const out: Prefill = {}
  for (const key of ["name", "description", "priority", "status", "tags", "assignee"] as const) {
    if (shape[key]) out[key] = shape[key]
  }
  if (typeof shape.start_day === "number") out.start = dayFrom(today, shape.start_day)
  if (typeof shape.due_day === "number") out.due = dayFrom(today, shape.due_day)
  return out
}

/** HTML with no words and nothing in it (an emptied editor's "<p></p>"). */
const blankHtml = (html: string) => !/<(img|video|iframe|hr)\b/i.test(html) && html.replace(/<[^>]*>|&nbsp;/g, "").trim() === ""

/**
 * The form's values as make's typed ones: everything the form shows goes, so
 * a value typed over the template's wins, and one the form emptied goes as ""
 * (make's clear) rather than left to the template, as does a date the
 * template sets that the form no longer has. The form never empties the type:
 * its chip shows the template's when the project has it, and make names why
 * the task is a Task when it doesn't.
 */
export function typedOf(v: FormValues, shape: TemplateShape): Typed {
  const out: Typed = { name: v.name }
  const description = v.description && !blankHtml(v.description) ? v.description : ""
  if (description || shape.description) out.description = description
  for (const key of ["priority", "tags", "status", "assignee"] as const) {
    if (v[key] || shape[key]) out[key] = v[key] ?? ""
  }
  if (v.type) out.type = v.type
  if (v.start) out.start = v.start.toISOString()
  else if (typeof shape.start_day === "number") out.clear_start = true
  if (v.due) out.due = v.due.toISOString()
  else if (typeof shape.due_day === "number") out.clear_due = true
  if (v.fields && Object.keys(v.fields).length > 0) out.fields = v.fields
  return out
}

/** A value of the form a template filled: what the form held before, and what the template set. */
export type Filled = Partial<Record<keyof Prefill, { was: unknown; set: unknown }>>

const same = (a: unknown, b: unknown) => (a instanceof Date && b instanceof Date ? a.getTime() === b.getTime() : a === b)

/**
 * What goes back when the template that filled the form is swapped or
 * dropped: each value it set that the form still holds, as the form held it
 * before. A value the maker changed since stays theirs.
 */
export function unfilled(filled: Filled, now: Partial<Record<keyof Prefill, unknown>>): Partial<Record<keyof Prefill, unknown>> {
  const back: Partial<Record<keyof Prefill, unknown>> = {}
  for (const [key, f] of Object.entries(filled) as [keyof Prefill, { was: unknown; set: unknown }][]) {
    if (same(now[key], f.set)) back[key] = f.was
  }
  return back
}

/** The picker's two groups: the project's own, then the workspace's, each in the server's order (by name). */
export function groupTemplates(list: TemplateSummary[]): { project: TemplateSummary[]; workspace: TemplateSummary[] } {
  return { project: list.filter((t) => t.project_id), workspace: list.filter((t) => !t.project_id) }
}

/** The template a new task of the type starts from, if the project or the workspace names one. */
export function defaultFor(defaults: Record<string, string> | undefined, typeId: string | undefined): string | undefined {
  return typeId ? defaults?.[typeId] : undefined
}
