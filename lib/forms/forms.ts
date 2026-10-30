/**
 * Intake forms on the client: a form's items as the server keeps them
 * (business/Form), the kinds of question, and the builder's small moves.
 * Branching is lib/forms/branch, answers lib/forms/answers, and what saves
 * lib/forms/build. Pure.
 */

import { hueFor, type CampHue } from "@/lib/campHue"

/** What a question asks for. */
export type QuestionType =
  | "short_text"
  | "long_text"
  | "email"
  | "phone"
  | "url"
  | "number"
  | "date"
  | "select"
  | "multi_select"
  | "checkbox"
  | "file"

/** An item of a form: a question, or a section, which asks nothing and starts a page. */
export type FieldType = QuestionType | "section"

export type ShowOp = "is" | "is_not" | "any_of" | "answered"

/** When an item shows: an earlier question's answer is, isn't or is any of some choices, or is answered at all. */
export interface ShowIf {
  question: string
  op: ShowOp
  values?: string[]
}

export type FormPriority = "low" | "medium" | "high"

export interface FormField {
  id: string
  label: string
  type: FieldType
  required: boolean
  options?: string[]
  /** A line under the question, or under a section's title. */
  help?: string
  show_if?: ShowIf
  /** What the answer fills besides the description: "priority", "due", "tags" or "field:<id>"; none for the description only. A form that adds table rows: "column:<id>". Never sent to visitors. */
  maps_to?: string
  /** For the priority: the one each choice sets. */
  map?: Record<string, FormPriority>
  /** Never shown: only the form's link fills it (?prefill_<id>=…), so it's never required (tables B5b). */
  hidden?: boolean
  /** Its managers let a link that fills it hide it for that visit (?hide_<id>=true, tables B5c); off unless they turn it on. */
  link_hides?: boolean
}

export interface ProjectForm {
  id?: string
  token?: string
  title: string
  description: string
  fields: FormField[]
  title_field: string
  priority: FormPriority
  active: boolean
  /** What a visitor reads once it's sent; empty for the app's own words. */
  confirmation?: string
  /** The page a visitor goes to once it's sent, in place of the message (tables B5b); "" for the message. */
  redirect?: string
  assignee_uuid?: string
  submissions?: number
  /** The data table a row is added to, instead of a task being made. */
  target_table?: string | null
  /** The pictures it wears (tables B5c-2): uploads of the form's own (src_key "form"), by id; "" or none for none. A form with no logo wears the workspace's. */
  cover_id?: string
  logo_id?: string
}

/** A file a visitor sent: its upload's id, and once sent its name, size and type. */
export interface SentFile {
  id: string
  name?: string
  size?: number
  mime?: string
}

/** One answer of a submission: by question, or by label alone (Label, Value) when it was sent before questions had ids. */
export interface SentAnswer {
  id?: string
  label?: string
  value?: string
  values?: string[]
  /** A file question's files. */
  files?: SentFile[]
  Label?: string
  Value?: string
}

export interface Submission {
  id: string
  task_uuid?: string
  /** The table row it added, for a form that adds rows. */
  row_id?: string
  answers: SentAnswer[]
  created_at: string
}

export const FIELD_TYPES: { value: FieldType; label: string }[] = [
  { value: "short_text", label: "Short answer" },
  { value: "long_text", label: "Paragraph" },
  { value: "email", label: "Email" },
  { value: "phone", label: "Phone" },
  { value: "url", label: "Link" },
  { value: "number", label: "Number" },
  { value: "date", label: "Date" },
  { value: "select", label: "Choice" },
  { value: "multi_select", label: "Several choices" },
  { value: "checkbox", label: "Checkbox" },
  { value: "file", label: "Files" },
]

export const typeLabel = (t: FieldType) => (t === "section" ? "Section" : FIELD_TYPES.find((f) => f.value === t)?.label ?? t)

/** A question answered from a list. */
export const hasChoices = (t: FieldType) => t === "select" || t === "multi_select"

/** An item a form's link can answer (?prefill_<id>=…), and so one it may hide: never a section or a file, as business/Form says (tables B5b). */
export const linkFills = (t: FieldType) => t !== "section" && t !== "file"

/** An id no other item in the form has. */
export function newFieldId(fields: FormField[]): string {
  let n = fields.length + 1
  while (fields.some((f) => f.id === `q${n}`)) n++
  return `q${n}`
}

export const blankForm = (): ProjectForm => ({
  title: "",
  description: "",
  fields: [
    { id: "q1", label: "What do you need?", type: "short_text", required: true },
    { id: "q2", label: "Your email", type: "email", required: true },
    { id: "q3", label: "Details", type: "long_text", required: false },
  ],
  title_field: "q1",
  priority: "medium",
  active: true,
  confirmation: "",
})

/** Moves an item up or down; out of range leaves the list as it is. */
export function moveField(fields: FormField[], index: number, by: -1 | 1): FormField[] {
  const to = index + by
  if (to < 0 || to >= fields.length) return fields
  const next = [...fields]
  ;[next[index], next[to]] = [next[to], next[index]]
  return next
}

/** A form's colour: the light over its page, its progress and its preview, from its title (or its link before it has one). */
export const formHue = (title: string, token = ""): CampHue => hueFor(title.trim() || token || "form")

export const formUrl = (token: string) => (typeof window === "undefined" ? `/f/${token}` : `${window.location.origin}/f/${token}`)

/** An answer of a submission as it reads: its question's words and what was said. */
export const sentAnswer = (a: SentAnswer) => ({ id: a.id ?? "", label: a.label ?? a.Label ?? "", value: a.value ?? a.Value ?? "" })
