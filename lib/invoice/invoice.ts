// An invoice from a project's billable time: one line per task or per person,
// at the project's rates (each person's own, or the project's) or at one
// hourly rate typed for this invoice, with tax on the subtotal. Pure, so the
// page and its tests agree on every number.

import type { TimeReport } from "@/lib/tasks/time"

export type LineBy = "task" | "person"

export interface InvoiceOptions {
  by: LineBy
  /** Per hour, in the invoice's currency. 0 or empty: the project's rates, where it has them. */
  rate: number
  /** Percent, e.g. 18 for 18% GST. */
  taxPercent: number
}

export interface InvoiceLine {
  description: string
  hours: number
  rate: number
  amount: number
}

export interface InvoiceTotals {
  lines: InvoiceLine[]
  hours: number
  subtotal: number
  tax: number
  total: number
}

/** Money to two places, rounding halves away from zero. */
export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

/** Billable seconds as hours to two places, the way an invoice reads them. */
export const billableHours = (seconds: number) => round2(seconds / 3600)

export function buildInvoice(report: Pick<TimeReport, "by_person" | "by_task">, o: InvoiceOptions): InvoiceTotals {
  const rate = Number.isFinite(o.rate) && o.rate > 0 ? o.rate : 0
  const source = o.by === "task" ? report.by_task : report.by_person
  const lines = source
    .map((l): InvoiceLine[] => {
      // At the project's rates, unless one is typed for this invoice: a person
      // at their rate, a task once per rate its time was worked at. Each line
      // is its hours, as shown, times its rate, so it multiplies out.
      if (!rate && l.rated) {
        return l.rated.map((p) => {
          const hours = billableHours(p.billable_seconds)
          const each = p.rate_cents / 100
          return { description: l.name, hours, rate: each, amount: round2(hours * each) }
        })
      }
      if (!rate && l.rate_cents !== undefined) {
        const hours = billableHours(l.billable_seconds)
        const each = l.rate_cents / 100
        return [{ description: l.name, hours, rate: each, amount: round2(hours * each) }]
      }
      const hours = billableHours(l.billable_seconds)
      return [{ description: l.name, hours, rate, amount: round2(hours * rate) }]
    })
    .flat()
    .filter((l) => l.hours > 0)
  const subtotal = round2(lines.reduce((s, l) => s + l.amount, 0))
  const taxPercent = Number.isFinite(o.taxPercent) && o.taxPercent > 0 ? o.taxPercent : 0
  const tax = round2((subtotal * taxPercent) / 100)
  return { lines, hours: round2(lines.reduce((s, l) => s + l.hours, 0)), subtotal, tax, total: round2(subtotal + tax) }
}

/** A money formatter for a currency, falling back to plain numbers for an unknown code. */
export function money(currency: string, locale?: string) {
  try {
    const f = new Intl.NumberFormat(locale, { style: "currency", currency })
    return (n: number) => f.format(n)
  } catch {
    return (n: number) => `${n.toFixed(2)} ${currency}`
  }
}

// Currencies written to two decimals: rates and amounts are kept in hundredths.
export const CURRENCIES = ["INR", "USD", "EUR", "GBP", "AUD", "CAD", "SGD", "AED", "CHF", "NZD", "ZAR"] as const

/** A suggested invoice number: the project's initials and the month, e.g. "Q4L-2026-10". */
export function suggestNumber(project: string, at: Date): string {
  const initials = project.split(/\s+/).map((w) => w[0] ?? "").join("").replace(/[^\p{L}\p{N}]/gu, "").toUpperCase().slice(0, 4) || "INV"
  return `${initials}-${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, "0")}`
}
