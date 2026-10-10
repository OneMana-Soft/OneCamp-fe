// Formula fields in tables: the functions the editor lists, and how a value
// the server worked out shows in a cell. The server defines and runs the
// functions (business/DataTable/formula); formula.test.ts keeps this list
// the same as its own.

import { computedOf, isComputed, isMoreRef, type FormulaResult, type TableField } from "@/services/tableService"
import { shortDate, shortDateTime } from "@/lib/utils/date/shortDate"

export interface FormulaFunction {
  name: string
  syntax: string
  about: string
}

export const FORMULA_FUNCTIONS: { group: string; items: FormulaFunction[] }[] = [
  {
    group: "Logic",
    items: [
      { name: "IF", syntax: "IF(test, then, otherwise)", about: "One value or another, by a test" },
      { name: "SWITCH", syntax: "SWITCH(value, match, result, …, otherwise)", about: "The result for the first match" },
      { name: "AND", syntax: "AND(a, b, …)", about: "Whether all of them are true" },
      { name: "OR", syntax: "OR(a, b, …)", about: "Whether any of them is true" },
      { name: "NOT", syntax: "NOT(test)", about: "The opposite" },
      { name: "ISBLANK", syntax: "ISBLANK(value)", about: "Whether it's empty" },
      { name: "ISERROR", syntax: "ISERROR(value)", about: "Whether it can't be worked out" },
      { name: "BLANK", syntax: "BLANK()", about: "Nothing" },
      { name: "TRUE", syntax: "TRUE()", about: "Yes, as a value; TRUE on its own works too" },
      { name: "FALSE", syntax: "FALSE()", about: "No, as a value; FALSE on its own works too" },
    ],
  },
  {
    group: "Numbers",
    items: [
      { name: "SUM", syntax: "SUM(a, b, …)", about: "Added up" },
      { name: "AVERAGE", syntax: "AVERAGE(a, b, …)", about: "The average, leaving out blanks" },
      { name: "MIN", syntax: "MIN(a, b, …)", about: "The smallest" },
      { name: "MAX", syntax: "MAX(a, b, …)", about: "The largest" },
      { name: "ROUND", syntax: "ROUND(number, places)", about: "Rounded to a number of decimal places" },
      { name: "ROUNDUP", syntax: "ROUNDUP(number, places)", about: "Rounded away from zero" },
      { name: "ROUNDDOWN", syntax: "ROUNDDOWN(number, places)", about: "Rounded toward zero" },
      { name: "CEILING", syntax: "CEILING(number, step)", about: "Up to a multiple of step" },
      { name: "FLOOR", syntax: "FLOOR(number, step)", about: "Down to a multiple of step" },
      { name: "ABS", syntax: "ABS(number)", about: "Without its sign" },
      { name: "SQRT", syntax: "SQRT(number)", about: "The square root" },
      { name: "MOD", syntax: "MOD(number, by)", about: "What's left after dividing" },
      { name: "POWER", syntax: "POWER(number, power)", about: "Raised to a power" },
      { name: "VALUE", syntax: "VALUE(text)", about: "Text such as \"$1,200\" as a number" },
    ],
  },
  {
    group: "Text",
    items: [
      { name: "CONCATENATE", syntax: "CONCATENATE(a, b, …)", about: "Joined into one text; & does the same" },
      { name: "LEN", syntax: "LEN(text)", about: "How many characters" },
      { name: "UPPER", syntax: "UPPER(text)", about: "In capitals" },
      { name: "LOWER", syntax: "LOWER(text)", about: "In small letters" },
      { name: "TRIM", syntax: "TRIM(text)", about: "Without spaces at either end" },
      { name: "LEFT", syntax: "LEFT(text, count)", about: "The first characters" },
      { name: "RIGHT", syntax: "RIGHT(text, count)", about: "The last characters" },
      { name: "MID", syntax: "MID(text, start, count)", about: "Characters from the middle, counting from 1" },
      { name: "FIND", syntax: "FIND(what, text)", about: "Where it first appears, or 0" },
      { name: "SUBSTITUTE", syntax: "SUBSTITUTE(text, old, new)", about: "With one text swapped for another" },
      { name: "REPT", syntax: "REPT(text, times)", about: "Repeated" },
    ],
  },
  {
    group: "Dates",
    items: [
      { name: "TODAY", syntax: "TODAY()", about: "Today, where you are" },
      { name: "NOW", syntax: "NOW()", about: "This moment" },
      { name: "DATEADD", syntax: "DATEADD(date, count, \"days\")", about: "A date moved by days, weeks, months or years" },
      { name: "DATETIME_DIFF", syntax: "DATETIME_DIFF(later, earlier, \"days\")", about: "The time between two dates" },
      { name: "WORKDAY_DIFF", syntax: "WORKDAY_DIFF(start, end)", about: "Weekdays from start to end, both counted" },
      { name: "YEAR", syntax: "YEAR(date)", about: "The year" },
      { name: "MONTH", syntax: "MONTH(date)", about: "The month, 1 to 12" },
      { name: "DAY", syntax: "DAY(date)", about: "The day of the month" },
      { name: "WEEKDAY", syntax: "WEEKDAY(date)", about: "The day of the week, 0 for Sunday" },
    ],
  },
]

/** What a formula's cell shows. */
export type FormulaShown =
  | { kind: "blank" }
  | { kind: "error"; message: string }
  | { kind: "checkbox"; checked: boolean }
  | { kind: "number" | "date" | "text"; text: string }

const DAY = /^(\d{4})-(\d{2})-(\d{2})$/

/**
 * A value the server worked out, as its cell shows it: a number in the
 * reader's own format, a date in words, a checkbox ticked or not, and an
 * error by what went wrong.
 */
export function showFormulaValue(value: unknown, result: FormulaResult): FormulaShown {
  if (value === null || value === undefined || value === "") return { kind: "blank" }
  if (typeof value === "object") {
    const error = (value as { error?: unknown }).error
    return { kind: "error", message: typeof error === "string" ? error : "This can't be worked out" }
  }
  if (typeof value === "boolean") return { kind: "checkbox", checked: value }
  if (typeof value === "number") {
    return { kind: "number", text: value.toLocaleString(undefined, { maximumFractionDigits: 6 }) }
  }
  const s = String(value)
  if (result === "date") {
    const day = DAY.exec(s)
    if (day) {
      const d = new Date(Number(day[1]), Number(day[2]) - 1, Number(day[3]))
      return { kind: "date", text: shortDate(d) }
    }
    const t = new Date(s)
    if (!Number.isNaN(t.getTime())) {
      return { kind: "date", text: shortDateTime(t) }
    }
  }
  return { kind: "text", text: s }
}

/** A formula's value as one line of text, for a board card: "" when blank. */
export function formulaText(value: unknown, result: FormulaResult): string {
  const shown = showFormulaValue(value, result)
  switch (shown.kind) {
    case "blank":
      return ""
    case "error":
      return "Error"
    case "checkbox":
      return shown.checked ? "Yes" : "No"
    default:
      return shown.text
  }
}

/** A card's title from its title field: a formula as its cell shows it, anything else as written. */
export function cardTitle(field: TableField, value: unknown): string {
  if (isComputed(field)) return formulaText(value, computedOf(field).result)
  if (Array.isArray(value)) {
    // A list's items, or the names of the rows and items a relation links to,
    // without its count of the links not shown.
    return value
      .filter((v) => !isMoreRef(v))
      .map((v) => (v && typeof v === "object" ? String((v as { label?: unknown }).label ?? "") : String(v)))
      .filter(Boolean)
      .join(", ")
  }
  return value === null || value === undefined ? "" : String(value)
}

/** A field's name as a formula writes it: in braces, with } and \ escaped. */
export function fieldRef(name: string): string {
  return `{${name.replace(/[\\}]/g, (c) => `\\${c}`)}}`
}

/** text with insert put in place of the selection from start to end, and where the caret goes. */
export function insertAt(text: string, start: number, end: number, insert: string): { text: string; caret: number } {
  return { text: text.slice(0, start) + insert + text.slice(end), caret: start + insert.length }
}
