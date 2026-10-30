// Tables B1's kinds on the web (D-TB-3), as the server's
// business/FieldTypes/kindsMore.go keeps them: a status's groups, a phone
// number, a duration, a rating, an id's prefix, and who a people field takes.
// Pure, so a cell, a picker, a setting and the fixtures read them alike.

import { parseFieldConfig, type SelectOption, type TableField } from "@/services/tableService"
import { campHueOf, type CampHue } from "@/lib/campHue"
import { listText } from "@/lib/tables/cellFormat"
import { formatDuration } from "@/lib/format/duration"
import { agoOrDate, fullDateTime } from "@/lib/utils/date/shortDate"

/** The groups a status's options sit in: work not started, under way, finished. */
export type StatusGroup = "todo" | "doing" | "done"

export const STATUS_GROUPS: readonly StatusGroup[] = ["todo", "doing", "done"]

/** A status group's name, as its settings and a board's columns say it. */
export const STATUS_GROUP_NAMES: Record<StatusGroup, string> = { todo: "To do", doing: "In progress", done: "Done" }

/** The group a status option sits in: to do when it names none. */
export function statusGroupOf(o: SelectOption): StatusGroup {
  return o.group === "doing" || o.group === "done" ? o.group : "todo"
}

/** A status option's hue when it has none of its own: under way in sun, done in moss; to do stays neutral. */
const GROUP_HUE: Record<StatusGroup, CampHue | undefined> = { todo: undefined, doing: "sun", done: "moss" }

/** An option's hue as its chip shows it: its own colour, else a status option's group's. */
export const optionHue = (color: string | null | undefined, group?: StatusGroup): CampHue | undefined => campHueOf(color) ?? (group ? GROUP_HUE[group] : undefined)

/** The most stars a rating field rates: its config's, 1 to 10, or 5. */
export function ratingMax(f: TableField): number {
  const m = parseFieldConfig(f).max
  return typeof m === "number" && Number.isInteger(m) && m >= 1 && m <= 10 ? m : 5
}

/** What an id's prefix may be: letters, digits, _ and -, up to 12. */
export const ID_PREFIX = /^[A-Za-z0-9_-]{0,12}$/

/** An id field's prefix, "" for none. */
export function idPrefix(f: TableField): string {
  const p = parseFieldConfig(f).prefix
  return typeof p === "string" && ID_PREFIX.test(p) ? p : ""
}

/** A row's id as it is shown: its number after the field's prefix (DEAL-12), "" for a row with none yet. */
export function idText(f: TableField, n: unknown): string {
  if (typeof n !== "number" || !(n > 0)) return ""
  const p = idPrefix(f)
  return p ? `${p}-${n}` : String(n)
}

/** Whether a people field takes one person only. */
export function takesOnePerson(f: TableField): boolean {
  return parseFieldConfig(f).one === true
}

/** How a duration shows: hours and minutes, or with seconds too. */
export type DurationFormat = "h:mm" | "h:mm:ss"

export function durationFormat(f: TableField): DurationFormat {
  return parseFieldConfig(f).format === "h:mm:ss" ? "h:mm:ss" : "h:mm"
}

/**
 * A duration in seconds as a cell reads it, as time on a task does ("45m",
 * "2h", "1h 05m"): with its seconds when the field shows them ("1h 05m 15s").
 */
export function durationText(seconds: number, format: DurationFormat): string {
  if (!Number.isFinite(seconds) || seconds < 0) return ""
  const s = Math.round(seconds) % 60
  return format === "h:mm:ss" && s ? `${formatDuration(seconds)} ${String(s).padStart(2, "0")}s` : formatDuration(seconds)
}

const PHONE_SHAPE = /^\+?[0-9 ().\-/]*(?:\s*(?:x|ext\.?|extension)\s*[0-9]+)?$/

/** Whether text is a phone number as people write one: at least three digits, and nothing a number isn't written with. */
export function isPhone(text: string): boolean {
  const s = text.trim()
  if (!s || [...s].length > 40 || !PHONE_SHAPE.test(s.toLowerCase())) return false
  return (s.match(/\d/g)?.length ?? 0) >= 3
}

/** A phone number as a tel: link dials it: its digits, a leading + and an extension's comma pause. */
export function telHref(text: string): string | null {
  const s = text.trim()
  if (!isPhone(s)) return null
  const [number, ext] = s.toLowerCase().split(/\s*(?:x|ext\.?|extension)\s*/)
  const dial = number.replace(/[^\d+]/g, "")
  return `tel:${dial}${ext ? `,${ext.replace(/\D/g, "")}` : ""}`
}

/** A moment a row was made or changed, or nothing for one that can't be read. */
function momentOf(value: unknown): Date | null {
  if (typeof value !== "string" || !value) return null
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d
}

/**
 * How long ago, as a table reads it (STEP5 spec E): agoOrDate's "12m ago",
 * "3h ago" and "yesterday", then "3 days ago" within a week, then "12 Oct".
 * The days are the tables' own, so the app's other dates don't carry them.
 */
export function agoInDays(d: Date, now: Date = new Date()): string {
  const s = Math.round((now.getTime() - d.getTime()) / 1000)
  return s >= 2 * 86400 && s < 7 * 86400 ? `${Math.floor(s / 86400)} days ago` : agoOrDate(d, now)
}

/** When a row was made or changed, as its cell reads it. */
export function momentText(value: unknown, now: Date = new Date()): string {
  const d = momentOf(value)
  return d ? agoInDays(d, now) : ""
}

/** The moment in full, for its tooltip: "Saturday 17 October 2026, 9:15 AM". */
export function momentTitle(value: unknown): string {
  const d = momentOf(value)
  return d ? fullDateTime(d) : ""
}

/**
 * A B1 kind's cell as one line of text, as a board card, a phone's list and
 * the row's history read it: a duration as its clock, a rating as its stars
 * out of the most, an id after its prefix, a moment in the reader's zone,
 * people by name. Null for any other kind, which reads as it always has.
 */
export function kindText(field: TableField, value: unknown): string | null {
  switch (field.type) {
    case "duration":
      return typeof value === "number" ? durationText(value, durationFormat(field)) : null
    case "rating":
      return typeof value === "number" && value >= 1 ? `★ ${value}/${ratingMax(field)}` : ""
    case "autonumber":
      return idText(field, value)
    case "created_time":
    case "modified_time":
      return momentText(value)
    case "people":
    case "created_by":
    case "modified_by":
      return Array.isArray(value) ? listText(value) : ""
    default:
      return null
  }
}
