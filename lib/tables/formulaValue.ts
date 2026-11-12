// A formula's value as it reads, for tables and tasks alike (type-only imports).
import type { FormulaResult } from "@/services/tableService"

/** What a formula's cell shows. */
export type FormulaShown =
  | { kind: "blank" }
  | { kind: "error"; message: string }
  | { kind: "checkbox"; checked: boolean }
  | { kind: "number" | "date" | "text"; text: string }

/** How a side writes numbers and dates (day: "2026-10-31", not a moment). */
export interface FormulaWriter {
  number: (n: number) => string
  date: (d: Date, sent: string, day: boolean) => string
}

const DAY = /^(\d{4})-(\d{2})-(\d{2})$/

export function showFormulaValue(value: unknown, result: FormulaResult | undefined, write: FormulaWriter): FormulaShown {
  if (value === null || value === undefined || value === "") return { kind: "blank" }
  if (typeof value === "object") {
    const error = (value as { error?: unknown }).error
    return { kind: "error", message: typeof error === "string" ? error : "This can't be worked out" }
  }
  if (typeof value === "boolean") return { kind: "checkbox", checked: value }
  if (typeof value === "number") return { kind: "number", text: write.number(value) }
  const s = String(value)
  if (result === "date") {
    const day = DAY.exec(s)
    if (day) return { kind: "date", text: write.date(new Date(Number(day[1]), Number(day[2]) - 1, Number(day[3])), s, true) }
    const t = new Date(s)
    if (!Number.isNaN(t.getTime())) return { kind: "date", text: write.date(t, s, false) }
  }
  return { kind: "text", text: s }
}

export function formulaLine(shown: FormulaShown): string {
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
