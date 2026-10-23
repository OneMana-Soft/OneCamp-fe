/**
 * What a project's time is billed at (GET /project/{id}/rates): one currency,
 * a rate for everyone and a rate per person, per hour in the currency's minor
 * unit (cents, paise). Pure helpers, for their test.
 */
import { CURRENCIES, money } from "@/lib/invoice/invoice"
import { numberSigns, typedNumber } from "@/lib/format/number"

export interface ProjectRates {
  /** Whether the project is billed at all. */
  set: boolean
  currency?: string
  default_rate_cents: number
  people: { user_uuid: string; rate_cents: number }[]
  /** The version read: a save sends it back, and is refused (409) when the rates changed since. */
  updated_at?: string
}

/** The currencies offered, as invoices offer them; the server takes any three-letter code. */
export { CURRENCIES }

/** Most a rate can be, in minor units: a million an hour. */
const MAX_CENTS = 100_000_000

/**
 * Minor units from a typed amount, read as every typed number is, in the
 * reader's locale (lib/format/number): "85", "85.50", "1,200.50" and
 * "1,00,000" in en-IN; "85,50" and "1.200,50" in de-DE; a currency sign may
 * come with it. What reads two ways is refused, never guessed. Null when it
 * isn't an amount, is negative, or has more than two decimals or an
 * exponent. Pure.
 */
export function centsOf(typed: string, locale?: string): number | null {
  const n = typedNumber(typed, locale)
  if (n === null || n < 0 || /e/i.test(typed)) return null
  const cents = Math.round(n * 100)
  if (Math.abs(n * 100 - cents) > 1e-6) return null
  return cents <= MAX_CENTS ? cents : null
}

/** A rate as the form shows it, with the reader's decimal sign so it reads back: "85", "85.50" ("85,50" in de-DE). Pure. */
export function fromCents(cents: number, locale?: string): string {
  return cents % 100 === 0 ? String(cents / 100) : (cents / 100).toFixed(2).replace(".", numberSigns(locale).decimal)
}

/** Minor units as money in the currency: 15000 USD is "$150.00". */
export function formatCents(cents: number, currency: string): string {
  return money(currency)(cents / 100)
}
