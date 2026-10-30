import type { TopModifier } from "@/lib/search/query"

/**
 * The search page's filter chips (docs C2-1): what each modifier in the text
 * reads as on a chip, and the dates a chip offers. Pure, so the words are
 * tested without a page. A chip only ever writes text (lib/search/query.ts):
 * the server reads it, as it reads what is typed.
 */

/** The modifiers that say when something was made or changed: a date chip replaces any of them. */
export const DATE_FIELDS = ["on", "during", "before", "after", "created", "updated"]

/** The dates the Date chip offers, as the modifier each writes. */
export const DATE_PRESETS: { label: string; field: string; value: string }[] = [
  { label: "Today", field: "on", value: "today" },
  { label: "Yesterday", field: "on", value: "yesterday" },
  { label: "Past 7 days", field: "during", value: "past_7_days" },
  { label: "Past 30 days", field: "during", value: "past_30_days" },
  { label: "This year", field: "during", value: "this_year" },
]

const KIND_LABELS: Record<string, string> = {
  message: "messages",
  doc: "docs",
  task: "tasks",
  project: "projects",
  file: "files",
  person: "people",
  channel: "channels",
  board: "boards",
  event: "events",
  team: "teams",
}

const DAY = /^\d{4}-\d{2}-\d{2}$/

/** A date value as a chip says it: 1 Oct 2026, past 7 days, this year, friday. */
function dateWords(value: string): string {
  if (DAY.test(value)) {
    const d = new Date(`${value}T00:00:00Z`)
    if (!Number.isNaN(d.getTime())) return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(d)
  }
  return value.replace(/_/g, " ").toLowerCase()
}

const upperFirst = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s)
const lowerFirst = (s: string) => (s ? s[0].toLowerCase() + s.slice(1) : s)

/** What a modifier reads as on its chip: From @sam, In #launch, Past 7 days, Not from @ana. */
export function modifierLabel(m: TopModifier): string {
  const field = m.field.toLowerCase()
  const values = m.values.length ? m.values : [""]
  const or = (vs: string[]) => vs.join(" or ")
  let label: string
  switch (field) {
    case "from":
      label = `From ${or(values)}`
      break
    case "in":
      label = `In ${or(values)}`
      break
    case "type": {
      const kinds = values.map((v) => KIND_LABELS[v.toLowerCase()] ?? v).join(" and ")
      return m.negated ? `No ${kinds}` : `Only ${kinds}`
    }
    case "on": {
      const v = values[0].toLowerCase()
      label = v === "today" || v === "yesterday" ? upperFirst(v) : `On ${dateWords(values[0])}`
      break
    }
    case "during":
      label = upperFirst(dateWords(values[0]))
      break
    case "before":
    case "after":
    case "created":
    case "updated":
      label = `${upperFirst(field)} ${dateWords(values[0])}`
      break
    case "title":
      label = `Title has ${or(values.map((v) => `“${v}”`))}`
      break
    case "has":
    case "is":
      label = `${upperFirst(field)} ${or(values)}`
      break
    default:
      label = `${m.field}: ${or(values)}`
  }
  return m.negated ? `Not ${lowerFirst(label)}` : label
}

/** Whether a text already says when (any date modifier, negated or not). */
export function hasDate(mods: TopModifier[]): boolean {
  return mods.some((m) => DATE_FIELDS.includes(m.field.toLowerCase()))
}
