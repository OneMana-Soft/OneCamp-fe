import { format } from "date-fns"

// The one way the app writes a date: "9 Oct", "9 Oct 2025" in another year,
// day before month as most of the world reads it, spelled out (messages said
// "Oct 9", screens "09/10/26": 10 September to half the world). Days only: a
// list of days takes its words from here, without the clock (10 KB) that
// shortDate.ts adds for a time (fluid-17).

/** A day as a list shows it: "7 Oct", "7 Oct 2025" in another year (lists printed "07 Oct 2026": a zero nobody reads, a year nearly always this one). */
export function shortDate(d: Date, now: Date = new Date()): string {
  return format(d, d.getFullYear() === now.getFullYear() ? "d MMM" : "d MMM yyyy")
}

/** A day in full, for a tooltip or a screen reader: "Friday 9 October 2026". */
export function fullDate(d: Date): string {
  return format(d, "EEEE d MMMM yyyy")
}

/** How long ago, as a card's meta line reads it: "just now", "12m ago", "2h ago", "yesterday", then the short date. Pure given now. */
export function agoOrDate(d: Date, now: Date = new Date()): string {
  const s = Math.round((now.getTime() - d.getTime()) / 1000)
  if (s < 0) return shortDate(d, now)
  if (s < 60) return "just now"
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  if (s < 2 * 86400) return "yesterday"
  return shortDate(d, now)
}
