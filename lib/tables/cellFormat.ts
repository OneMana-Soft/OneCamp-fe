// How a number cell reads at rest (content.md T08): grouped by locale,
// currency with a ₹ or $ prefix, negatives as "−1,200", percent. The format
// lives in the field's config ({"format": {...}}), which the server keeps as
// written. Pure.

import { isHiddenRef, parseFieldConfig, type TableField } from "@/services/tableService"
import { dayDate } from "@/lib/utils/timeZone"
import { typedWebURL } from "@/lib/links/webURL"
import { formatLocale } from "./numberFormat"

/** What a reader sees for the linked items in a cell they can't open: one phrase for all of them. */
export function hiddenText(count: number): string {
  return count === 1 ? "Something you can't open" : `${formatLocale(count, {})} things you can't open`
}

/**
 * A list cell (a multi-select, a relation, files) as one line of text: the names,
 * then the items the reader can't open as one phrase, never by their ids. The
 * count of links not shown has a name of its own ("3 more").
 */
export function listText(items: unknown[]): string {
  const names: string[] = []
  let hidden = 0
  for (const item of items) {
    if (isHiddenRef(item)) hidden++
    else if (item && typeof item === "object") {
      const { label: l, name } = item as { label?: unknown; name?: unknown }
      const label = l ?? name // a link's label, a file's name
      if (typeof label === "string" && label) names.push(label)
    } else if (item !== null && item !== undefined && item !== "") names.push(String(item))
  }
  if (hidden) names.push(hiddenText(hidden))
  return names.join(", ")
}

/**
 * A text in one line: its first line that isn't blank, and whether another
 * that isn't blank comes after it (a one-line cell's "…"). The cell's face,
 * its name and its face while the cells' chunk loads all read this one line.
 */
export function leadLine(text: string): { line: string; more: boolean } {
  const lines = text.split(/\r\n|\r|\n/)
  const first = lines.findIndex((line) => line.trim())
  if (first < 0) return { line: "", more: false }
  return { line: lines[first], more: lines.slice(first + 1).some((line) => line.trim()) }
}

export interface NumberFormat {
  /** "INR" (₹) or "USD" ($); none for a plain number. */
  currency?: "INR" | "USD"
  /** Fixed decimal places; unset keeps what was typed (up to 6). */
  decimals?: number
  /** Show as a percent (the value is the percent: 42 → 42%). */
  percent?: boolean
  /** Draw a small bar before the value (percent columns). */
  bar?: boolean
  /** A formula's or a rollup's number as a duration (B2). */
  duration?: "h:mm" | "h:mm:ss"
  /** A formula's or a rollup's date style. */
  date?: "long" | "iso" | "relative"
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
    duration: r.duration === "h:mm" || r.duration === "h:mm:ss" ? r.duration : undefined,
    date: r.date === "long" || r.date === "iso" || r.date === "relative" ? r.date : undefined,
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

/**
 * "2026-10-07" (or a timestamp) as the day it names, in the reader's zone. Here,
 * not in the grid's cells, so a guest's read-only table and a phone's list
 * read a day without bringing the grid.
 */
export function dayOf(value: unknown): Date | undefined {
  if (typeof value !== "string" || !value) return undefined
  const d = dayDate(value) ?? new Date(value)
  return Number.isNaN(d.getTime()) ? undefined : d
}

/** A URL's host, for the cell ("example.com"); the text itself when it isn't one. */
export function urlHost(text: string): string {
  const t = text.trim()
  return typedWebURL(t)?.host.replace(/^www\./, "") || t
}

/** Whether a URL or an email cell's text is usable (a host; an @). Empty is fine. */
export function cellValid(type: "url" | "email", text: string): boolean {
  const t = text.trim()
  if (!t) return true
  if (type === "email") return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t)
  return !!typedWebURL(t)?.host.includes(".")
}

/** An href for a URL cell, or null for an unsafe or broken one. */
export const safeHref = (text: string): string | null => typedWebURL(text)?.href ?? null
