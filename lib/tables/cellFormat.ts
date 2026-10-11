// How a number cell reads at rest (content.md T08): grouped by locale,
// currency with a ₹ or $ prefix, negatives as "−1,200", percent. The format
// lives in the field's config ({"format": {...}}), which the server keeps as
// written. Pure.

import { parseFieldConfig, type TableField } from "@/services/tableService"
import { formatLocale } from "./numberFormat"

export interface NumberFormat {
  /** "INR" (₹) or "USD" ($); none for a plain number. */
  currency?: "INR" | "USD"
  /** Fixed decimal places; unset keeps what was typed (up to 6). */
  decimals?: number
  /** Show as a percent (the value is the percent: 42 → 42%). */
  percent?: boolean
  /** Draw a small bar before the value (percent columns). */
  bar?: boolean
}

export function numberFormatOf(f: TableField): NumberFormat {
  const raw = parseFieldConfig(f).format
  if (!raw || typeof raw !== "object") return {}
  const r = raw as Record<string, unknown>
  return {
    currency: r.currency === "INR" || r.currency === "USD" ? r.currency : undefined,
    decimals: typeof r.decimals === "number" && r.decimals >= 0 && r.decimals <= 6 ? r.decimals : undefined,
    percent: r.percent === true,
    bar: r.bar === true,
  }
}

export const CURRENCY_SIGN = { INR: "₹", USD: "$" } as const

export interface FormattedNumber {
  /** The sign before the digits ("₹"), shown in ink-3. */
  prefix: string
  /** The digits with grouping and the true minus sign. */
  text: string
  /** After the digits ("%"). */
  suffix: string
  negative: boolean
  /** 0..1 for a percent bar. */
  fraction?: number
}

/** A number as the grid shows it at rest; null when the value is not a number. */
export function formatNumber(value: unknown, fmt: NumberFormat = {}, locale?: string): FormattedNumber | null {
  const n = typeof value === "number" ? value : typeof value === "string" && value.trim() !== "" ? Number(value) : NaN
  if (!Number.isFinite(n)) return null
  const opts: Intl.NumberFormatOptions =
    fmt.decimals !== undefined ? { minimumFractionDigits: fmt.decimals, maximumFractionDigits: fmt.decimals } : { maximumFractionDigits: 6 }
  const text = formatLocale(Math.abs(n), opts, locale)
  return {
    prefix: fmt.currency ? CURRENCY_SIGN[fmt.currency] : "",
    text: n < 0 ? `−${text}` : text,
    suffix: fmt.percent ? "%" : "",
    negative: n < 0,
    fraction: fmt.percent ? Math.max(0, Math.min(1, n / 100)) : undefined,
  }
}

// The short English month names, as en-GB writes them: a table, not an
// Intl formatter per date cell.
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sept", "Oct", "Nov", "Dec"]

/** "7 Oct", with the year only when it isn't this year. */
export function shortDay(d: Date, now: Date = new Date()): string {
  const day = d.getDate()
  const mon = MONTHS[d.getMonth()]
  return d.getFullYear() === now.getFullYear() ? `${day} ${mon}` : `${day} ${mon} ${d.getFullYear()}`
}

/** A URL's host, for the cell ("example.com"); the text itself when it isn't one. */
export function urlHost(text: string): string {
  const t = text.trim()
  if (!t) return ""
  try {
    const u = new URL(/^[a-z][a-z0-9+.-]*:/i.test(t) ? t : `https://${t}`)
    return u.host.replace(/^www\./, "") || t
  } catch {
    return t
  }
}

/** Whether a URL or an email cell's text is usable (a host; an @). Empty is fine. */
export function cellValid(type: "url" | "email", text: string): boolean {
  const t = text.trim()
  if (!t) return true
  if (type === "email") return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t)
  try {
    const u = new URL(/^[a-z][a-z0-9+.-]*:/i.test(t) ? t : `https://${t}`)
    return /^https?:$/.test(u.protocol) && u.host.includes(".")
  } catch {
    return false
  }
}

/** An href for a URL cell, or null for an unsafe or broken one. */
export function safeHref(text: string): string | null {
  const t = text.trim()
  if (!t) return null
  try {
    const u = new URL(/^[a-z][a-z0-9+.-]*:/i.test(t) ? t : `https://${t}`)
    return /^https?:$/.test(u.protocol) ? u.href : null
  } catch {
    return null
  }
}
