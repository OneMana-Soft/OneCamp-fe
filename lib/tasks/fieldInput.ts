/** A value typed into a task's custom field, read: the task panel's editing
 * (taskFieldsSection). Apart from lib/tasks/fields, which every list that
 * shows a field reads, so the number reader (lib/format/number) loads where a
 * number is typed, never with a project's list (app/firstLoad.test.ts). Pure,
 * but for the reader's locale. */

import { typedNumber } from "@/lib/format/number"
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
    case "url": {
      const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(t) ? t : `https://${t}`
      try {
        const u = new URL(withScheme)
        if ((u.protocol === "https:" || u.protocol === "http:") && u.hostname.includes(".")) return { value: withScheme }
      } catch {
        // falls through to the message
      }
      return { error: `${field.name} takes a web address, like example.com/page.` }
    }
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
