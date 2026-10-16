// Numbers as people type them, in their own locale's signs, and as programs
// write them: the one reader for every number a person types (a table cell,
// a table filter's value, a task field), and what a server is told the
// reader's signs are. Pure, but for a cache of each locale's signs.

import { numberFormat } from "@/lib/tables/numberFormat"

const signs = new Map<string, { decimal: string; group: string }>()

/** The reader's decimal sign and digit-group sign ("," and "." in de-DE), as their locale shows numbers. Read once per locale. */
export function numberSigns(locale?: string): { decimal: string; group: string } {
  let s = signs.get(locale ?? "")
  if (!s) {
    const parts = numberFormat(locale, {}).formatToParts(1234567.5)
    s = { decimal: parts.find((p) => p.type === "decimal")?.value ?? ".", group: parts.find((p) => p.type === "group")?.value ?? "," }
    signs.set(locale ?? "", s)
  }
  return s
}

// A number as JavaScript writes it ("1234.5", "1e-7"): a cell may hold one as text.
const PLAIN_NUMBER = /^\s*[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?\s*$/i

/** A value that is a number, or text a program wrote as one ("-120", "1e3"); null for anything else. */
export function plainNumberOf(value: unknown): number | null {
  const n = typeof value === "number" ? value : typeof value === "string" && PLAIN_NUMBER.test(value) ? Number(value) : NaN
  return Number.isFinite(n) ? n : null
}
// Spaces of any width and apostrophes group digits in some locales ("1 234", "1’234").
const GROUP_SPACES = /[\s   '’]/g
// Digit groups, once every group sign is "_": threes, or India's twos then three ("1_00_000").
const GROUPED = /^\d{1,3}(_\d{3})+$|^\d{1,2}(_\d{2})*_\d{3}$/

/**
 * What a person typed as a number, read in their locale (TAB-BUG-8): a table
 * cell, a table filter's value or a task field;
 * its decimal sign ("1,5" is 1.5 in de-DE), digit groups ("1.234,56",
 * "1,00,000", "1 234"), a currency sign before or after ("€12", "12 €") and a
 * minus. "" when it's blank; null when it isn't a number ("12 kg", "TBD",
 * "0x10", or "1,5" where a comma groups digits), which a cell refuses rather
 * than saving another number or nothing.
 */
export function parseTypedNumber(text: string, locale?: string): number | "" | null {
  const t = text.trim().replace(/−/g, "-")
  if (!t) return ""
  const m = /^([+-]?)\s*(\p{Sc}?)\s*([+-]?)([^_]*?)\s*(\p{Sc}?)$/u.exec(t)
  if (!m) return null
  const [, signBefore, currencyBefore, signAfter, body, currencyAfter] = m
  if ((signBefore && signAfter) || (currencyBefore && currencyAfter)) return null
  const { decimal, group } = numberSigns(locale)
  // Every digit-group sign becomes "_": the locale's, a space, and whichever
  // of . and , isn't the decimal sign.
  const parts = body.replace(GROUP_SPACES, "_").split(group).join("_").split(decimal === "," ? "." : ",").join("_").split(decimal)
  if (parts.length > 2) return null
  let [whole, fraction = ""] = parts
  // An exponent ends it ("1e3", "1,5e3").
  const exponent = /e[+-]?\d+$/i.exec(parts.length === 2 ? fraction : whole)?.[0] ?? ""
  if (parts.length === 2) fraction = fraction.slice(0, fraction.length - exponent.length)
  else whole = whole.slice(0, whole.length - exponent.length)
  if (!/^\d*$/.test(fraction) || !(GROUPED.test(whole) || /^\d*$/.test(whole))) return null
  const digits = whole.replace(/_/g, "")
  if (!digits && !fraction) return null
  const n = Number(`${signBefore || signAfter}${digits || "0"}.${fraction || "0"}${exponent}`)
  return Number.isFinite(n) ? n : null
}

/** What a person typed as a number (parseTypedNumber), or null when it's blank or isn't one. */
export function typedNumber(text: string, locale?: string): number | null {
  const n = parseTypedNumber(text, locale)
  return typeof n === "number" ? n : null
}

/** A number cell's value as it's typed in the reader's locale ("1234,5" in de-DE), so reading it back gives the same number. */
export function typedNumberText(value: unknown, locale?: string): string {
  if (value === null || value === undefined) return ""
  const n = plainNumberOf(value)
  return n === null ? String(value) : String(n).replace(".", numberSigns(locale).decimal)
}
