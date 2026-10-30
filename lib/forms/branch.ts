/**
 * Branching on the page, business/Form branch.go's twin: a question, or a
 * whole section, shows only when an earlier answer says so. The server
 * decides what was shown from the answers alone, and so does this, from the
 * same answers, so the page asks what the server requires and sends nothing
 * it would drop. branch.test.ts runs branch_test.go's cases. Pure.
 */

import type { FormField, ShowIf } from "@/lib/forms/forms"

export type Answers = Record<string, unknown>

/** An answer as the server keeps it: what it reads, and a multi-select's choices. */
export interface Kept {
  value: string
  values?: string[]
}

/** An answer as kept, or null for a blank one. A shown checkbox is always answered, Yes or No. */
export function kept(f: FormField, v: unknown): Kept | null {
  if (f.type === "checkbox") return { value: v === true ? "Yes" : "No" }
  if (f.type === "multi_select") {
    const values = Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === "string"))] : []
    return values.length ? { value: values.join(", "), values } : null
  }
  if (f.type === "file") {
    // Its uploads' ids, until the server names the files.
    const ids = Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === "string"))] : []
    return ids.length ? { value: ids.join(", ") } : null
  }
  const s = typeof v === "string" ? v.trim() : typeof v === "number" ? String(v) : ""
  return s ? { value: s } : null
}

/** Whether a condition holds for the answers so far: a question not shown, or left blank, is unanswered. */
export function holds(c: ShowIf | undefined, got: ReadonlyMap<string, Kept>): boolean {
  if (!c) return true
  const a = got.get(c.question)
  const has = (v: string) => !!a && (a.values?.length ? a.values.includes(v) : a.value === v)
  const values = c.values ?? []
  switch (c.op) {
    case "answered":
      return !!a && a.value.trim() !== ""
    case "is":
      return values.length === 1 && has(values[0])
    case "is_not":
      return values.length === 1 && !has(values[0])
    case "any_of":
      return values.some(has)
  }
  return false
}

/** The items these answers show, in order (a section shown even when nothing under it is), and each shown answer as kept. */
export function shown(fields: FormField[], answers: Answers): { items: FormField[]; got: Map<string, Kept> } {
  const items: FormField[] = []
  const got = new Map<string, Kept>()
  let page = true
  for (const f of fields) {
    if (f.type === "section") {
      page = holds(f.show_if, got)
      if (page) items.push(f)
      continue
    }
    if (!page || !holds(f.show_if, got)) continue
    items.push(f)
    const k = kept(f, answers[f.id])
    if (k) got.set(f.id, k)
  }
  return { items, got }
}

/** A page: the section that starts it (none for the questions before the first) and its shown questions. */
export interface Page {
  section?: FormField
  questions: FormField[]
}

/** The pages these answers show; one with nothing to ask is left out, though a form with nothing left to ask keeps its first, to send from. */
export function pagesOf(fields: FormField[], answers: Answers): Page[] {
  const pages: Page[] = [{ questions: [] }]
  for (const f of shown(fields, answers).items) {
    if (f.type === "section") pages.push({ section: f, questions: [] })
    // A hidden question is never drawn: its link answered it (tables B5b).
    else if (!f.hidden) pages[pages.length - 1].questions.push(f)
  }
  const asked = pages.filter((p) => p.questions.length > 0)
  // Every question hidden: the link alone answers it, so the form is its title and Send.
  return asked.length ? asked : pages.slice(0, 1)
}

/** The answers to send: only the shown questions', so a hidden one's never leaves the page. */
export function shownAnswers(fields: FormField[], answers: Answers): Answers {
  const out: Answers = {}
  for (const f of shown(fields, answers).items) if (f.type !== "section" && answers[f.id] !== undefined) out[f.id] = answers[f.id]
  return out
}
