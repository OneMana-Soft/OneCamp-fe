/**
 * The form builder's rules, the twin of business/Form's CheckForm,
 * checkShowIf, checkMapsTo and checkFields: what a form may ask, show on and
 * fill, said in the server's words, so the builder offers only what saves and
 * says why before it sends. And the moves that keep a form whole as it
 * changes: a question removed lets go of the conditions on it, a choice
 * renamed carries its conditions and its priority along. Pure.
 */

import type { FieldType as TaskFieldType, TaskField } from "@/lib/tasks/fields"
import { blankForm, hasChoices, linkFills, newFieldId, type FieldType, type FormField, type FormPriority, type ProjectForm, type QuestionType, type ShowIf } from "@/lib/forms/forms"
import { orList } from "@/lib/utils/format/orList"
import { webURL } from "@/lib/links/webURL"

export const MAX_QUESTIONS = 20
export const MAX_SECTIONS = 10
export const MAX_CHOICES = 50
export const MAX_HELP = 300
export const MAX_CONFIRMATION = 500
/** How many questions of a form take files (business/Form maxFileQuestions). */
export const MAX_FILE_QUESTIONS = 3

const PRIORITIES: FormPriority[] = ["low", "medium", "high"]

/**
 * Which questions fill a field of each kind (fill.go's fills): a project's
 * task field or a table's column, whose kinds share their names. A kind it
 * doesn't name (a person, a link, a worked-out column) takes no answer.
 */
export const FIELD_KINDS: Partial<Record<TaskFieldType | "email", QuestionType[]>> & Record<string, QuestionType[] | undefined> = {
  text: ["short_text", "long_text", "email", "phone", "url"],
  url: ["url"],
  email: ["email"],
  number: ["number"],
  money: ["number"],
  date: ["date"],
  select: ["select"],
  multi_select: ["select", "multi_select"],
  checkbox: ["checkbox"],
}

const tidy = (s: string | undefined) => (s ?? "").split(/\s+/).filter(Boolean).join(" ")
const runes = (s: string) => [...s].length
const UUID = /^[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}$/i

/** A question's choices as the server keeps them: tidied, each once, none blank. */
export function choicesIn(f: FormField): string[] {
  const out: string[] = []
  for (const o of f.options ?? []) {
    const t = tidy(o)
    if (t && !out.includes(t)) out.push(t)
  }
  return out
}

/** Whether a condition can read a question's choices (is, isn't, any of), or only whether it's answered. */
export const readsChoices = (q: FormField) => hasChoices(q.type) || q.type === "checkbox"

/** The choices a condition reads on a question: its own, or a checkbox's Yes and No. */
export const choicesOf = (q: FormField) => (q.type === "checkbox" ? ["Yes", "No"] : choicesIn(q))

/** The project field an item fills, by id, or "". */
export const fieldOf = (f: FormField) => (f.maps_to?.startsWith("field:") ? f.maps_to.slice(6) : "")

/** The table column an item of a form that adds rows fills, by id, or "". */
export const columnOf = (f: FormField) => (f.maps_to?.startsWith("column:") ? f.maps_to.slice(7) : "")

/** A table's column as a form fills it: its kind, a choice column's options, and whether every row needs it (unless it starts filled). */
export interface FormColumn {
  id: string
  name: string
  type: string
  options: string[]
  required: boolean
  startsFilled: boolean
}

/** A question that names a task: an answer in words, never a section or files. */
const names = (f: FormField) => f.type !== "section" && f.type !== "file"

/** A table's field as GET /tables/{id}/fields answers it, as much as a form reads of it. */
export interface TableFieldLike {
  id: string
  name: string
  type: string
  config?: string
  required?: boolean
  default_value?: unknown
  deleted_at?: string | null
}

/** Kinds whose cells the table works out (FieldTypes' kinds that aren't stored): no one writes them, so no form asks for them. */
const WORKED_OUT = new Set(["formula", "rollup", "autonumber", "created_time", "created_by", "modified_time", "modified_by"])

/** The question each column kind is asked as, to start from. */
const ASKED_AS: Record<string, QuestionType> = {
  text: "short_text", email: "email", url: "url", number: "number", date: "date", select: "select", multi_select: "multi_select", checkbox: "checkbox",
}

/** A table's columns as a form fills them: the stored ones, each with its options and whether every row needs it. */
export function columnsOf(fields: TableFieldLike[]): FormColumn[] {
  return fields
    .filter((f) => !f.deleted_at && !WORKED_OUT.has(f.type))
    .map((f) => {
      let options: string[] = []
      try {
        const cfg = JSON.parse(f.config || "{}") as { options?: (string | { label?: string })[] }
        options = (cfg.options ?? []).map((o) => (typeof o === "string" ? o : o.label ?? "")).filter(Boolean)
      } catch {
        // A config that isn't JSON offers nothing.
      }
      const d = f.default_value
      const startsFilled = d !== undefined && d !== null && d !== "" && !(Array.isArray(d) && d.length === 0)
      return { id: f.id, name: f.name, type: f.type, options, required: !!f.required, startsFilled }
    })
}

/** A question that fills column c, asked as its kind is, required when every row needs it. */
export function questionFor(c: FormColumn, fields: FormField[]): FormField | null {
  const type = ASKED_AS[c.type]
  if (!type) return null
  const q: FormField = { id: newFieldId(fields), label: c.name, type, required: c.required && !c.startsFilled, maps_to: `column:${c.id}` }
  if (hasChoices(type)) q.options = c.options.length >= 2 ? [...c.options] : ["", ""]
  return q
}

/** A question for each column no question fills yet; the form's untouched starting questions make way for them. */
export function columnsAsQuestions(fields: FormField[], columns: FormColumn[]): FormField[] {
  const untouched = JSON.stringify(fields) === JSON.stringify(blankForm().fields)
  const out = untouched ? [] : [...fields]
  for (const c of columns) {
    if (out.some((f) => columnOf(f) === c.id)) continue
    const q = questionFor(c, out)
    if (q) out.push(q)
  }
  return out.length ? out : fields
}

/** How a column every row needs stands: asked of everyone, asked of some, asked by no question, or one a form can't fill. */
export type Need = { column: FormColumn; state: "always" | "sometimes" | "missing" | "never" }

/** The columns every row of the form's table needs (a column that starts filled needs nothing), each as it stands. */
export function rowNeeds(fields: FormField[], columns: FormColumn[]): Need[] {
  const always = new Set<string>()
  let page = true
  for (const f of fields) {
    if (f.type === "section") page = !f.show_if
    else if (page && !f.show_if && f.required) always.add(f.id)
  }
  return columns
    .filter((c) => c.required && !c.startsFilled)
    .map((column) => {
      if (!FIELD_KINDS[column.type]) return { column, state: "never" as const }
      const q = fields.find((f) => columnOf(f) === column.id)
      return { column, state: !q ? ("missing" as const) : always.has(q.id) ? ("always" as const) : ("sometimes" as const) }
    })
}

/** One of the things an answer can fill. */
export interface FillTarget {
  value: string
  label: string
  /** Why it can't be picked: another question fills it. */
  taken?: string
}

/** What a question can fill, for its kind: the description only, the priority, the due date, tags, or a project field of a fitting kind. */
export function fillTargets(q: FormField, fields: FormField[], project: TaskField[]): FillTarget[] {
  const target = (value: string, label: string): FillTarget => {
    const other = value === "tags" ? undefined : fields.find((o) => o.id !== q.id && o.maps_to === value)
    return other ? { value, label, taken: `“${tidy(other.label) || "Another question"}” fills it` } : { value, label }
  }
  const out: FillTarget[] = [{ value: "", label: "Only the description" }]
  if (q.type === "select") out.push(target("priority", "The priority"))
  if (q.type === "date") out.push(target("due", "The due date"))
  if (hasChoices(q.type)) out.push(target("tags", "Tags"))
  for (const f of project) if (q.type !== "section" && FIELD_KINDS[f.type]?.includes(q.type)) out.push(target(`field:${f.id}`, f.name))
  return out
}

/** The columns of a form's table a question can fill: those of a kind it suits. */
export function columnTargets(q: FormField, fields: FormField[], columns: FormColumn[]): FillTarget[] {
  return columns
    .filter((c) => q.type !== "section" && FIELD_KINDS[c.type]?.includes(q.type))
    .map((c) => {
      const value = `column:${c.id}`
      const other = fields.find((o) => o.id !== q.id && o.maps_to === value)
      return other ? { value, label: c.name, taken: `“${tidy(other.label) || "Another question"}” fills it` } : { value, label: c.name }
    })
}

/** A choice question's priorities to start from: the first high, the last low, any between medium. */
export function defaultPriorities(options: string[]): Record<string, FormPriority> {
  return Object.fromEntries(options.map((o, i) => [o, i === 0 ? "high" : i === options.length - 1 ? "low" : "medium"]))
}

/** checkShowIf's twin: what's wrong with item n's condition, given the items before it, or "". */
function showIfProblem(c: ShowIf, before: FormField[], n: number): string {
  const on = before.find((b) => b.id === c.question && b.type !== "section")
  if (!on) return `Item ${n} shows on an answer that has to come before it.`
  if (c.op === "answered") return ""
  if (c.op !== "is" && c.op !== "is_not" && c.op !== "any_of") return `Item ${n} shows on a condition this form can't read.`
  if (!readsChoices(on)) return `Item ${n} can only show when “${tidy(on.label)}” is answered: it has no choices.`
  const choices = choicesOf(on)
  const values: string[] = []
  for (const raw of c.values ?? []) {
    const v = tidy(raw)
    if (!v || values.includes(v)) continue
    if (!choices.includes(v)) return `Item ${n} shows on “${v}”, which isn't a choice of “${tidy(on.label)}”.`
    values.push(v)
  }
  return !values.length || (c.op !== "any_of" && values.length > 1) ? `Item ${n} needs the choice it shows on.` : ""
}

/** checkMapsTo's twin: what's wrong with what question n fills, as far as the question alone tells, or "". */
function mapsToProblem(f: FormField, n: number): string {
  const t = f.maps_to ?? ""
  if (t === "" || t === "description") return ""
  if (t === "priority") {
    if (f.type !== "select") return `Question ${n} sets the priority, so it needs to be a choice.`
    const missing = choicesIn(f).find((o) => !PRIORITIES.includes(f.map?.[o] as FormPriority))
    return missing ? `Question ${n}: say which priority “${missing}” sets.` : ""
  }
  if (t === "due") return f.type === "date" ? "" : `Question ${n} sets the due date, so it needs to be a date.`
  if (t === "tags") return hasChoices(f.type) ? "" : `Question ${n} sets tags, so it needs to be a choice.`
  if (t.startsWith("field:")) return UUID.test(t.slice(6)) ? "" : `Question ${n} fills a field this project doesn't have.`
  return `Question ${n} fills something a form can't fill.`
}

/** Which questions fill a field kind, in words (fill.go's kindsFor). */
function kindsFor(type: string): string {
  switch (type) {
    case "url":
      return "a link"
    case "email":
      return "an email address"
    case "number":
    case "money":
      return "a number"
    case "date":
      return "a date"
    case "select":
      return "a choice"
    case "multi_select":
      return "a choice or several"
    case "checkbox":
      return "a checkbox"
  }
  return "an answer in words"
}

/** A page a sent form may send its visitor to (business/Form redirectable): "", or a web link (webURL) with no name or password in it, 500 characters at most. Pure. */
export function redirectable(s: string): boolean {
  if (!s) return true
  if (runes(s) > 500) return false
  const u = webURL(s)
  return !!u && !u.username && !u.password
}

/**
 * What stops a form saving, in the server's words, and the item it's about
 * (-1 for the form), or null. With the project's fields, those it fills are
 * checked too; with its table's columns, a form that adds rows is checked
 * against them (checkTable).
 */
export function formProblem(form: ProjectForm, project?: TaskField[], columns?: FormColumn[]): { index: number; message: string } | null {
  const fail = (message: string, index = -1) => ({ index, message })
  const title = tidy(form.title)
  if (!title || runes(title) > 120) return fail("Give the form a title of up to 120 characters.")
  if (runes(form.description.trim()) > 2000) return fail("Keep the description under 2,000 characters.")
  const table = !!form.target_table?.trim()
  if (table && !UUID.test(form.target_table!.trim())) return fail("Pick the table its answers go to.")
  if (form.fields.filter((f) => f.type === "file").length > MAX_FILE_QUESTIONS) return fail(`A form asks for files at most ${MAX_FILE_QUESTIONS} times.`)
  const questions = form.fields.filter((f) => f.type !== "section").length
  if (questions === 0 || questions > MAX_QUESTIONS) return fail(`A form has 1 to ${MAX_QUESTIONS} questions.`)
  if (form.fields.length - questions > MAX_SECTIONS) return fail(`A form has at most ${MAX_SECTIONS} sections.`)
  const ids = new Set<string>()
  const fills = new Set<string>()
  for (const [i, f] of form.fields.entries()) {
    const n = i + 1
    const limit = f.type === "section" ? 120 : 200
    const label = tidy(f.label)
    if (!label || runes(label) > limit) return fail(`Item ${n} needs a label of up to ${limit} characters.`, i)
    if (!f.id || ids.has(f.id) || f.id.length > 40) return fail("Each question needs its own id.", i)
    ids.add(f.id)
    if (runes((f.help ?? "").trim()) > MAX_HELP) return fail(`Keep item ${n}'s help under ${MAX_HELP} characters.`, i)
    if (hasChoices(f.type)) {
      const opts = choicesIn(f)
      if (opts.some((o) => runes(o) > 100)) return fail(`Keep the choices in question ${n} under 100 characters.`, i)
      if (opts.length < 2 || opts.length > MAX_CHOICES) return fail(`Question ${n} needs 2 to ${MAX_CHOICES} choices.`, i)
    }
    if (f.show_if) {
      const m = showIfProblem(f.show_if, form.fields.slice(0, i), n)
      if (m) return fail(m, i)
    }
    if (f.type === "section") {
      if (f.maps_to) return fail(`Item ${n} is a section, which fills nothing.`, i)
      continue
    }
    if (f.type === "file") {
      if (table) return fail(`Question ${n} asks for files, which a table row can't keep yet.`, i)
      if (f.maps_to && f.maps_to !== "description") return fail(`Question ${n} takes files, which go on the task: it fills nothing else.`, i)
      continue
    }
    const m = table ? (UUID.test(columnOf(f)) ? "" : `Question ${n} needs the column it fills.`) : mapsToProblem(f, n)
    if (m) return fail(m, i)
    const t = f.maps_to ?? ""
    if (t === "priority" || t === "due" || t.startsWith("field:") || t.startsWith("column:")) {
      if (fills.has(t)) return fail(`Question ${n} fills what another question already fills.`, i)
      fills.add(t)
    }
  }
  for (const [i, f] of form.fields.entries()) {
    if (f.type === "section" && (i === form.fields.length - 1 || form.fields[i + 1].type === "section")) return fail(`The section “${tidy(f.label)}” needs a question in it.`, i)
  }
  if (runes((form.confirmation ?? "").trim()) > MAX_CONFIRMATION) return fail(`Keep the message after sending under ${MAX_CONFIRMATION} characters.`)
  // Tables B5b, as business/Form checks them: a hidden question only its link fills, and the page to go to once sent.
  for (const [i, f] of form.fields.entries()) {
    if (!f.hidden) continue
    if (!linkFills(f.type)) return fail(`Item ${i + 1} can't be hidden: only a question its link can answer can.`, i)
    if (f.required) return fail(`“${tidy(f.label)}” is hidden, so only its link fills it: it can't be required.`, i)
  }
  if (!redirectable((form.redirect ?? "").trim())) return fail("The page after sending needs a full web address, like https://example.com/thanks.")
  if (table && columns) return tableProblem(form.fields, columns)
  if (project && !table) {
    for (const [i, f] of form.fields.entries()) {
      const id = fieldOf(f)
      if (!id) continue
      const pf = project.find((p) => p.id === id)
      if (!pf) return fail(`“${tidy(f.label)}” fills a field this project doesn't have.`, i)
      if (f.type === "section" || !FIELD_KINDS[pf.type]?.includes(f.type)) return fail(`“${tidy(f.label)}” can't fill ${pf.name}: ask it as ${kindsFor(pf.type)}.`, i)
      if ((pf.type === "select" || pf.type === "multi_select") && (pf.options.length < 2 || pf.options.length > MAX_CHOICES)) return fail(`${pf.name} needs 2 to ${MAX_CHOICES} options for a form to offer.`, i)
    }
  }
  return null
}

/** A form as the server keeps it: its words tidied, each choice once, a section asking and filling nothing, and nothing empty sent. */
export function tidyForm(form: ProjectForm): ProjectForm {
  const fields = form.fields.map((f): FormField => {
    const label = tidy(f.label)
    const help = (f.help ?? "").trim()
    const out: FormField = { id: f.id, label, type: f.type, required: f.type === "section" ? false : f.required }
    if (help) out.help = help
    if (f.show_if) out.show_if = { question: f.show_if.question, op: f.show_if.op, ...(f.show_if.op === "answered" ? {} : { values: [...new Set((f.show_if.values ?? []).map(tidy).filter(Boolean))] }) }
    // Tables B5b: hidden as its switch set it, so only the link fills it.
    if (f.hidden && linkFills(f.type)) out.hidden = true
    // Tables B5c: a link may hide it for a visit only where its managers turned this on (main, 28 Oct).
    else if (f.link_hides && linkFills(f.type)) out.link_hides = true
    if (f.type === "section") return out
    if (f.type === "file") return out
    if (hasChoices(f.type)) out.options = choicesIn(f)
    if (f.maps_to) out.maps_to = f.maps_to
    if (f.maps_to === "priority") {
      const map: Record<string, FormPriority> = {}
      for (const [k, v] of Object.entries(f.map ?? {})) if (tidy(k) && !map[tidy(k)]) map[tidy(k)] = v
      // A choice with none shows Medium beside it in the builder, so that's what saves.
      for (const o of out.options ?? []) map[o] ??= "medium"
      out.map = map
    }
    return out
  })
  // The task is named by an answer in words, as the server picks it.
  const title_field = fields.some((f) => f.id === form.title_field && names(f)) ? form.title_field : fields.find(names)?.id ?? ""
  const out: ProjectForm = { ...form, title: tidy(form.title), description: form.description.trim(), confirmation: (form.confirmation ?? "").trim(), redirect: (form.redirect ?? "").trim(), fields, title_field }
  if (form.target_table?.trim()) {
    // A row has no priority or assignee.
    out.target_table = form.target_table.trim()
    out.priority = "medium"
    delete out.assignee_uuid
  } else delete out.target_table
  return out
}

/**
 * checkTable's twin: a form that adds rows against its table's columns (the
 * stored ones: a worked-out column is never given). Each question fills a
 * column of a kind it suits, a choice column has options to offer, and every
 * column a row needs is filled by a question always asked and required,
 * unless it starts filled.
 */
function tableProblem(fields: FormField[], columns: FormColumn[]): { index: number; message: string } | null {
  const byId = new Map(columns.map((c) => [c.id, c]))
  const always = new Set<string>()
  let page = true
  for (const f of fields) {
    if (f.type === "section") page = !f.show_if
    else if (page && !f.show_if && f.required) always.add(f.id)
  }
  const filledAlways = new Set<string>()
  for (const [i, f] of fields.entries()) {
    if (f.type === "section") continue
    const c = byId.get(columnOf(f))
    if (!c) return { index: i, message: `“${tidy(f.label)}” fills a column that table doesn't have.` }
    const kinds = FIELD_KINDS[c.type]
    if (!kinds?.includes(f.type)) {
      return { index: i, message: kinds?.length ? `“${tidy(f.label)}” can't fill ${c.name}: ask it as ${kindsFor(c.type)}.` : `A form can't fill ${c.name}.` }
    }
    if ((c.type === "select" || c.type === "multi_select") && (c.options.length < 2 || c.options.length > MAX_CHOICES)) {
      return { index: i, message: `${c.name} needs 2 to ${MAX_CHOICES} options for a form to offer.` }
    }
    if (always.has(f.id)) filledAlways.add(c.id)
  }
  const missing = columns.find((c) => c.required && !c.startsFilled && !filledAlways.has(c.id))
  if (!missing) return null
  return {
    index: -1,
    message: FIELD_KINDS[missing.type]
      ? `Every row of the table needs ${missing.name}: add a question for it that is always asked and required.`
      : `Every row of the table needs ${missing.name}, which a form can't fill.`,
  }
}

/** Every other item's condition on `id` taken off; the labels of those that had one. */
function letGo(fields: FormField[], drop: (f: FormField) => boolean): { fields: FormField[]; released: string[] } {
  const released: string[] = []
  const next = fields.map((f) => {
    if (!f.show_if || !drop(f)) return f
    released.push(tidy(f.label) || "A question")
    const rest = { ...f }
    delete rest.show_if
    return rest
  })
  return { fields: next, released }
}

/** The form without item i: conditions on it let go (said in `released`), and the task named from another question when it was named from this one. */
export function withoutItem(fields: FormField[], i: number, titleField: string): { fields: FormField[]; released: string[]; titleField: string } {
  const gone = fields[i]
  const rest = fields.filter((_, j) => j !== i)
  const { fields: next, released } = letGo(rest, (f) => f.show_if?.question === gone.id)
  const named = titleField === gone.id ? next.find((f) => names(f) && f.type !== "checkbox")?.id ?? "" : titleField
  return { fields: next, released, titleField: named }
}

/** A question's choice o renamed, with the priority it sets and the conditions on it. */
export function renameChoice(fields: FormField[], i: number, o: number, label: string): FormField[] {
  const q = fields[i]
  const was = q.options?.[o] ?? ""
  return fields.map((f, j) => {
    if (j === i) {
      const options = (f.options ?? []).map((x, k) => (k === o ? label : x))
      const map = f.map && was in f.map ? Object.fromEntries(Object.entries(f.map).map(([k, v]) => [k === was ? label : k, v])) : f.map
      return { ...f, options, ...(map ? { map } : {}) }
    }
    if (f.show_if?.question === q.id && was && f.show_if.values?.includes(was)) return { ...f, show_if: { ...f.show_if, values: f.show_if.values.map((v) => (v === was ? label : v)) } }
    return f
  })
}

/** A question's choice o taken out, with the priority it set; a condition left with no choice to show on goes too (said in `released`). */
export function removeChoice(fields: FormField[], i: number, o: number): { fields: FormField[]; released: string[] } {
  const q = fields[i]
  const was = q.options?.[o] ?? ""
  const pared = fields.map((f, j) => {
    if (j === i) {
      const map = f.map ? Object.fromEntries(Object.entries(f.map).filter(([k]) => k !== was)) : undefined
      return { ...f, options: (f.options ?? []).filter((_, k) => k !== o), ...(map ? { map } : {}) }
    }
    if (f.show_if?.question === q.id && f.show_if.op !== "answered") return { ...f, show_if: { ...f.show_if, values: (f.show_if.values ?? []).filter((v) => v !== was) } }
    return f
  })
  return letGo(pared, (f) => f.show_if?.question === q.id && f.show_if.op !== "answered" && !(f.show_if.values ?? []).length)
}

/** Item i asked as another kind: what still fits is kept, and a condition reading choices it no longer has asks only that it's answered. */
export function retype(fields: FormField[], i: number, type: FieldType): FormField[] {
  const was = fields[i]
  const fitsStill = (t: string | undefined) =>
    !t || (t === "priority" ? type === "select" : t === "due" ? type === "date" : t === "tags" ? hasChoices(type) : t.startsWith("field:") || t.startsWith("column:") ? was.type === type : false)
  const next: FormField = { ...was, type }
  if (hasChoices(type)) next.options = was.options?.length ? was.options : ["", ""]
  else delete next.options
  if (!linkFills(type)) delete next.hidden
  if (!fitsStill(was.maps_to)) delete next.maps_to
  if (next.maps_to !== "priority") delete next.map
  const choices = type === "checkbox" ? ["Yes", "No"] : hasChoices(type) ? choicesIn(next) : []
  return fields.map((f, j) => {
    if (j === i) return next
    const c = f.show_if
    if (c?.question !== was.id || c.op === "answered") return f
    return (c.values ?? []).every((v) => choices.includes(v)) ? f : { ...f, show_if: { question: c.question, op: "answered" } }
  })
}

/** Why item i can't move by one place: an item would come before the answer it shows on; "" when it can. */
export function canMove(fields: FormField[], i: number, by: -1 | 1): string {
  const j = i + by
  if (j < 0 || j >= fields.length) return ""
  const [first, second] = by < 0 ? [fields[j], fields[i]] : [fields[i], fields[j]]
  return second.show_if?.question === first.id ? `“${tidy(second.label) || "It"}” shows on “${tidy(first.label) || "its question"}”'s answer, so it comes after it.` : ""
}

/** A condition said: "‘Kind’ is A bug", "‘Email’ is answered", "‘Signed’ is ticked". */
export function showIfText(c: ShowIf, fields: FormField[]): string {
  const on = fields.find((f) => f.id === c.question)
  const name = `‘${tidy(on?.label) || "an earlier question"}’`
  const values = c.values ?? []
  if (c.op === "answered") return `${name} is answered`
  if (on?.type === "checkbox" && values.length === 1) return `${name} ${(values[0] === "Yes") === (c.op === "is") ? "is ticked" : "isn't ticked"}`
  if (c.op === "any_of") return `${name} is ${orList(values)}`
  return `${name} ${c.op === "is_not" ? "isn't" : "is"} ${values[0] ?? "…"}`
}
