/**
 * A form's latest answers read by question: how many answered each, every
 * choice counted (a box's Yes and No too), and every answer in words.
 * An answer finds its question by id, or by label when it was sent before
 * questions had ids. Pure.
 */

import { hasChoices, sentAnswer, type FormField, type SentAnswer, type Submission } from "@/lib/forms/forms"

export interface Tally {
  choice: string
  count: number
}

export interface QuestionSummary {
  id: string
  label: string
  answered: number
  /** A choice's, a multi-select's or a box's: each choice and how many picked it. */
  tally?: Tally[]
  /** Any other's: its answers in words, newest first. */
  said?: string[]
}

/** The choices one answer picked: a multi-select's own list, or its words split where it has none. */
function picks(q: FormField, a: SentAnswer, value: string): string[] {
  if (q.type !== "multi_select") return [value]
  return a.values?.length ? a.values : value.split(", ").filter((v) => q.options?.includes(v))
}

export function summarize(fields: FormField[], subs: Submission[]): QuestionSummary[] {
  return fields
    .filter((q) => q.type !== "section")
    .map((q) => {
      const choices = q.type === "checkbox" ? ["Yes", "No"] : hasChoices(q.type) ? q.options ?? [] : null
      const counts = new Map((choices ?? []).map((c) => [c, 0]))
      const said: string[] = []
      let answered = 0
      for (const s of subs) {
        const a = s.answers.find((x) => (x.id ? x.id === q.id : sentAnswer(x).label === q.label))
        const value = a ? sentAnswer(a).value : ""
        if (!a || !value) continue
        answered++
        if (choices) {
          for (const c of picks(q, a, value)) if (counts.has(c)) counts.set(c, counts.get(c)! + 1)
        } else said.push(value)
      }
      const out: QuestionSummary = { id: q.id, label: q.label, answered }
      if (choices) out.tally = choices.map((choice) => ({ choice, count: counts.get(choice) ?? 0 }))
      else out.said = said
      return out
    })
}
