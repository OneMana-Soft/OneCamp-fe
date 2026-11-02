/** A value typed into a task's custom field, read: the task panel's editing
 * (taskFieldsSection), and an answer to a field a task template asks for
 * (readAnswer). Apart from lib/tasks/fields, which every list that
 * shows a field reads, so the number reader (lib/format/number) loads where a
 * number is typed, never with a project's list (app/firstLoad.test.ts). Pure,
 * but for the reader's locale. */

import { typedNumber } from "@/lib/format/number"
import { typedWebURL, webURL } from "@/lib/links/webURL"
import type { FieldValue, TaskField } from "./fields"

/** What a typed value is for a text-like field (text, link, number, money):
 * null to take it off, or what to say. A link without its https:// gets it;
 * money is typed in units and kept in cents. */
export function parseFieldInput(field: Pick<TaskField, "name" | "type">, text: string): { value: FieldValue | null } | { error: string } {
  const t = text.trim()
  if (t === "") return { value: null }
  switch (field.type) {
    case "text":
      return { value: t }
    case "url":
      // Kept as typed, with https:// when it was left off.
      if (typedWebURL(t)?.hostname.includes(".")) return { value: webURL(t) ? t : `https://${t}` }
      return { error: `${field.name} takes a web address, like example.com/page.` }
    case "number":
    case "money": {
      // A currency sign before the amount ("₹ 12,500") goes; the rest is read
      // as a table's number cell reads it, in the reader's locale.
      const n = typedNumber(t.replace(/^[^\p{L}\d.,-]+/u, ""))
      if (n === null) return { error: `${field.name} takes a number, like ${new Intl.NumberFormat(undefined, { minimumFractionDigits: 2 }).format(12500.5)}.` }
      return { value: field.type === "money" ? Math.round(n * 100) : n }
    }
  }
  return { error: `${field.name} isn't typed in.` }
}

/** An answer of any type, as the shared answer box holds it (components/forms/AnswerInput: a string, the ids
 * ticked, or a tick), read as the field's value: null for no answer, or what to say. A checkbox is answered only
 * ticked, and a choice (an option, a person, a day) is taken as it is; anything typed is read as above. */
export function readAnswer(field: Pick<TaskField, "name" | "type">, answer: unknown): { value: FieldValue | null } | { error: string } {
  switch (field.type) {
    case "checkbox":
      return { value: answer === true ? true : null }
    case "multi_select": {
      const ids = Array.isArray(answer) ? answer.filter((x): x is string => typeof x === "string" && x !== "") : []
      return { value: ids.length ? ids : null }
    }
    case "select":
    case "person":
    case "date":
      return { value: typeof answer === "string" && answer.trim() ? answer.trim() : null }
  }
  return parseFieldInput(field, typeof answer === "string" ? answer : "")
}
