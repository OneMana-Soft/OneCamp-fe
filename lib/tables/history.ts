/**
 * A row's history as a record says it (tables A2): one line a change, in the
 * reader's words. Values are as the server stores them (an option by its
 * label, a link to an item by its kind alone, never its title), so a line
 * names no more than the reader's own table shows. Pure.
 */

import type { HistoryChange, HistoryItem } from "@/lib/tables/ledger"
import type { TableField } from "@/services/tableService"

/** The longest a value is quoted in a line. */
const QUOTE_MAX = 60

/** Who made a change, as a line starts. */
export function whoDid(item: HistoryItem): string {
  const name = item.actor_name?.trim()
  switch (item.actor_kind) {
    case "automation":
      return "AI"
    case "system":
      return "OneCamp"
    case "import":
      return name ? `${name}'s import` : "An import"
    case "agent":
      return name ? `An agent for ${name}` : "An agent"
    case "api":
      return name ? `${name}, through the API` : "The API"
  }
  return name || "Someone"
}

/** A stored value as a line quotes it; "" for none. */
export function valueText(field: TableField | undefined, v: unknown): string {
  if (v === null || v === undefined || v === "") return ""
  if (Array.isArray(v)) {
    if (v.length === 0) return ""
    if (v.every((x) => typeof x === "string" || typeof x === "number")) return quote(v.join(", "))
    return `${v.length} ${v.length === 1 ? "link" : "links"}`
  }
  if (typeof v === "boolean" || field?.type === "checkbox") return v === true ? "ticked" : "not ticked"
  if (typeof v === "object") return "a link"
  return quote(String(v))
}

function quote(s: string): string {
  const flat = s.replace(/\s+/g, " ").trim()
  return flat.length > QUOTE_MAX ? `${flat.slice(0, QUOTE_MAX - 1)}…` : flat
}

/** One change of a row, said: "changed Status from Open to Won". */
export function changeText(c: HistoryChange, fields: TableField[]): string {
  const field = c.field ? fields.find((f) => f.id === c.field) : undefined
  const name = field ? field.name : "a deleted column"
  switch (c.event) {
    case "created":
      return "added this row"
    case "deleted":
      return "deleted this row"
    case "restored":
      return "brought this row back"
    case "moved":
      return "moved this row"
    case "links": {
      const n = (c.after ?? {}) as { linked?: number; unlinked?: number }
      const parts = [n.linked ? `linked ${n.linked} ${n.linked === 1 ? "row" : "rows"}` : "", n.unlinked ? `unlinked ${n.unlinked}` : ""].filter(Boolean)
      return `${parts.join(" and ") || "changed the links"} in ${name}`
    }
  }
  const was = valueText(field, c.before)
  const now = valueText(field, c.after)
  if (field?.type === "checkbox") return `${now === "ticked" ? "ticked" : "unticked"} ${name}`
  if (!was && now) return `set ${name} to ${now}`
  if (was && !now) return `cleared ${name}`
  if (!was && !now) return `changed ${name}`
  return `changed ${name} from ${was} to ${now}`
}

/** A change set's lines: who, and what, each change of it. */
export function historyLines(item: HistoryItem, fields: TableField[]): string[] {
  const who = whoDid(item)
  const by = item.kind === "undo" ? " (undoing a change)" : item.kind === "redo" ? " (redoing a change)" : item.kind === "field" ? " (by changing the column)" : ""
  const lines = item.changes.map((c) => `${who} ${changeText(c, fields)}${by}`)
  return lines.length ? lines : [`${who} made a change`]
}
