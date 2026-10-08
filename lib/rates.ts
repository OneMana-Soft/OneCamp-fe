/**
 * What a project's time is billed at (GET /project/{id}/rates): one currency,
 * a rate for everyone and a rate per person, per hour in the currency's minor
 * unit (cents, paise). Pure helpers, for their test.
 */
import { CURRENCIES, money } from "@/lib/invoice/invoice"

export interface ProjectRates {
  /** Whether the project is billed at all. */
  set: boolean
  currency?: string
  default_rate_cents: number
  people: { user_uuid: string; rate_cents: number }[]
}

/** The currencies offered, as invoices offer them; the server takes any three-letter code. */
export { CURRENCIES }

/** Most a rate can be, in minor units: a million an hour. */
const MAX_CENTS = 100_000_000

/** Minor units from a typed amount: "85", "85.5", "1,200.50". Null when it isn't one, is negative, or has more than two decimals. Pure. */
export function centsOf(typed: string): number | null {
  const s = typed.trim().replace(/,/g, "")
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null
  const cents = Math.round(Number(s) * 100)
  return cents <= MAX_CENTS ? cents : null
}

/** A rate as the form shows it: "85", "85.50". Pure. */
export function fromCents(cents: number): string {
  return cents % 100 === 0 ? String(cents / 100) : (cents / 100).toFixed(2)
}

/** Minor units as money in the currency: 15000 USD is "$150.00". */
export function formatCents(cents: number, currency: string): string {
  return money(currency)(cents / 100)
}
