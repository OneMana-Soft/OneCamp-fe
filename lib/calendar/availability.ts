/**
 * Availability on the client: working hours, slots grouped by day in the
 * viewer's zone, and the calendar file a booked guest takes away. Pure.
 */

export interface WorkingHours {
  days: number[] // 0 Sunday … 6 Saturday
  start: string // "09:00"
  end: string
  tz: string
}

export interface Slot {
  start: string
  end: string
}

export function browserTZ(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"
  } catch {
    return "UTC"
  }
}

export const defaultHours = (tz: string = browserTZ()): WorkingHours => ({ days: [1, 2, 3, 4, 5], start: "09:00", end: "17:00", tz })

/** Every zone the browser knows, the viewer's own first. */
export function timeZones(first: string = browserTZ()): string[] {
  let all: string[] = []
  try {
    all = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.("timeZone") ?? []
  } catch {
    all = []
  }
  return [first, ...all.filter((z) => z !== first)]
}

/** "2026-10-06": the calendar day an instant falls on in a zone. */
export function dayKey(iso: string | Date, tz: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso))
}

/** Slots by the day they fall on in the viewer's zone, in order. */
export function groupByDay(slots: Slot[], tz: string): { day: string; slots: Slot[] }[] {
  const out: { day: string; slots: Slot[] }[] = []
  for (const s of slots) {
    const day = dayKey(s.start, tz)
    const last = out[out.length - 1]
    if (last && last.day === day) last.slots.push(s)
    else out.push({ day, slots: [s] })
  }
  return out
}

export const formatTime = (iso: string, tz: string) =>
  new Intl.DateTimeFormat(undefined, { timeZone: tz, hour: "numeric", minute: "2-digit" }).format(new Date(iso))

/** "Tue 6 Oct" for a day key; the key is a date, so it reads the same anywhere. */
export const formatDay = (key: string) =>
  new Intl.DateTimeFormat(undefined, { timeZone: "UTC", weekday: "short", day: "numeric", month: "short" }).format(new Date(key + "T12:00:00Z"))

export const formatRange = (start: string, end: string, tz: string) =>
  `${new Intl.DateTimeFormat(undefined, { timeZone: tz, weekday: "long", day: "numeric", month: "long" }).format(new Date(start))}, ${formatTime(start, tz)} – ${formatTime(end, tz)}`

const icsTime = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "")
const icsText = (s: string) => s.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/([,;])/g, "\\$1")

/** A one-event iCalendar file, for "Add to calendar". */
export function icsFor(e: { uid: string; title: string; start: string; end: string; description?: string; url?: string }): string {
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//OneCamp//Booking//EN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${e.uid}@onecamp`,
    `DTSTAMP:${icsTime(new Date().toISOString())}`,
    `DTSTART:${icsTime(e.start)}`,
    `DTEND:${icsTime(e.end)}`,
    `SUMMARY:${icsText(e.title)}`,
    ...(e.description ? [`DESCRIPTION:${icsText(e.description)}`] : []),
    ...(e.url ? [`URL:${e.url}`] : []),
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n")
}

export function googleCalendarUrl(e: { title: string; start: string; end: string; details?: string }): string {
  const p = new URLSearchParams({ action: "TEMPLATE", text: e.title, dates: `${icsTime(e.start)}/${icsTime(e.end)}` })
  if (e.details) p.set("details", e.details)
  return `https://calendar.google.com/calendar/render?${p.toString()}`
}

/** What someone types for a page address, as the server will store it. */
export const slugify = (s: string) =>
  s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
