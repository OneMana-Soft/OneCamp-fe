/**
 * Project templates on the client (business/ProjectTemplate on the server):
 * what the picker lists, a template in full, what starting a project from one
 * made, and the file a template travels in from one workspace to another.
 * Pure.
 */

import { slugify } from "@/lib/calendar/availability"

export interface TemplateSummary {
  /** A built-in template's slug, or a saved one's id. */
  id: string
  name: string
  description: string
  built_in: boolean
  /** Tasks and subtasks it makes. */
  task_count: number
  /** Its first few task names. */
  preview: string[]
  created_by?: string
  created_at?: string
  can_delete: boolean
}

interface TemplateTask {
  name: string
  description?: string
  status?: string
  priority?: string
  tags?: string
  start_day?: number
  due_day?: number
  subtasks?: { name: string; due_day?: number }[]
}

export interface ProjectTemplate {
  id?: string
  name: string
  description?: string
  statuses?: { name: string; category: string; color: string }[]
  tasks: TemplateTask[]
}

/** What starting a project from a template made. */
export interface AppliedTemplate {
  statuses: number
  tasks: number
  failed: number
}

/**
 * Whether a value names a template: a built-in one's slug (lowercase, starting
 * with a letter, so ?new=1 names none) or a saved one's id. What a link may
 * ask New project to start from.
 */
export function isTemplateId(v: string | null | undefined): v is string {
  return !!v && (/^[a-z][a-z0-9-]{0,59}$/.test(v) || /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v))
}

/**
 * What the server accepts, kept in step with business/ProjectTemplate
 * (MaxNameLength, MaxAboutLength) and the AI edition's plan drafts
 * (business/AI/projectPlanDraft.go: planMinInput, planMaxInput).
 */
export const TEMPLATE_LIMITS = { name: 60, about: 280, planMin: 8, planMax: 600 } as const

/** A plan the AI is drafting: until it's done, the app asks for it again. */
export interface PlanDraft {
  id: string
  state: "drafting" | "done" | "failed"
  template?: ProjectTemplate
  msg?: string
}

/** The picker's choice of no template. */
export const BLANK = ""

/** The picker's choice of the plan the AI drafted (AI edition). */
export const AI_DRAFT = "ai-draft"

/** How many tasks a template makes, subtasks included. */
const templateSize = (t: ProjectTemplate) => t.tasks.reduce((n, task) => n + 1 + (task.subtasks?.length ?? 0), 0)

/** A template in full as the picker lists one. */
export function summaryOf(t: ProjectTemplate, id: string): TemplateSummary {
  return {
    id,
    name: t.name,
    description: t.description ?? "",
    built_in: false,
    task_count: templateSize(t),
    preview: t.tasks.slice(0, 4).map((task) => task.name),
    can_delete: false,
  }
}

/** Marks a file as a OneCamp template, and the version of its shape. */
const FILE_MARK = "onecamp_template"
const FILE_VERSION = 1

/** A template as a file to keep or send to another workspace. */
export function templateFile(t: ProjectTemplate): string {
  const { name, description, statuses, tasks } = t
  return JSON.stringify({ [FILE_MARK]: FILE_VERSION, name, description, statuses, tasks }, null, 2)
}

export function templateFileName(name: string): string {
  return `${slugify(name) || "template"}.onecamp-template.json`
}

/** A file that isn't a template this OneCamp can read; its message is for the person. */
export class TemplateFileError extends Error {}

/** The template in a file. The server checks the rest and says what to fix. */
export function readTemplateFile(text: string): ProjectTemplate {
  let v: unknown
  try {
    v = JSON.parse(text)
  } catch {
    throw new TemplateFileError("That file isn't a OneCamp template.")
  }
  if (!v || typeof v !== "object" || Array.isArray(v) || !(FILE_MARK in v)) {
    throw new TemplateFileError("That file isn't a OneCamp template.")
  }
  const { [FILE_MARK]: version, ...t } = v as Record<string, unknown>
  if (typeof version !== "number" || version > FILE_VERSION) {
    throw new TemplateFileError("That template was made by a newer OneCamp. Update this one to use it.")
  }
  if (typeof t.name !== "string" || !Array.isArray(t.tasks)) {
    throw new TemplateFileError("That template has no name or no tasks.")
  }
  return t as unknown as ProjectTemplate
}

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`

/** "1 task", "9 tasks"; subtasks count as tasks. */
export const taskCount = (n: number) => plural(n, "task")

/** The picker's line under a template: its first tasks, then how many more. */
export function previewLine(t: Pick<TemplateSummary, "preview" | "task_count">): string {
  const more = t.task_count - t.preview.length
  return more > 0 ? `${t.preview.join(" · ")} · ${more} more` : t.preview.join(" · ")
}

/**
 * What to tell the person once a project was made from a template: a toast
 * for the case where some of it couldn't be made, nothing when all of it was
 * (the project opening full of tasks says so).
 */
export function appliedNotice(a: AppliedTemplate | undefined): { title: string; description: string } | null {
  if (!a || a.failed === 0) return null
  const all = a.tasks + a.failed
  return {
    title: a.tasks === 0 ? "The project was made without its tasks" : `${a.tasks} of ${plural(all, "task")} were made`,
    description: "The rest couldn't be added just now. You can add them yourself, or delete the project and try again.",
  }
}
