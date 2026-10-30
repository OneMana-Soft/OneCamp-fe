/**
 * Home's sense of time (hub.md H3, H12, H13), as pure functions so the
 * drawing and the agenda are tested without a clock.
 *
 *   dayArcPoint   where the greeting's sun sits on its arc: sunrise and sunset
 *                 fixed at 06:00 and 18:00 in the device's time;
 *   hueForHour    the sky wash behind the rings: sun in the morning, sky by day,
 *                 dusk in the evening, lake at night (the one place a hue means
 *                 time);
 *   classifyEvent past, current or future against now;
 *   joinState     whether an event's Join shows, and how loudly;
 *   eventTitleOf  what an event is called on Home.
 */
import type { CampHue } from "@/lib/campHue"
import { linksAsHosts } from "@/lib/links/hostOf"

/** The arc, in the composition's 320 x 168 space: (24,150) to (300,150) through a control at (162,-110). */
export const ARC = { x0: 24, y0: 150, cx: 162, cy: -110, x1: 300, y1: 150 } as const
export const ARC_PATH = `M${ARC.x0} ${ARC.y0} Q${ARC.cx} ${ARC.cy} ${ARC.x1} ${ARC.y1}`

export const SUNRISE_HOUR = 6
export const SUNSET_HOUR = 18

/** A point on the arc at t (0 sunrise, 1 sunset). */
export function arcAt(t: number): { x: number; y: number } {
  const u = 1 - t
  return {
    x: u * u * ARC.x0 + 2 * u * t * ARC.cx + t * t * ARC.x1,
    y: u * u * ARC.y0 + 2 * u * t * ARC.cy + t * t * ARC.y1,
  }
}

export interface DayArcPoint {
  x: number
  y: number
  /** How far through the day, 0 at sunrise to 1 at sunset, clamped. */
  t: number
  /** Between sunrise and sunset: the disc is the sun; otherwise a crescent. */
  day: boolean
}

export function dayArcPoint(date: Date): DayArcPoint {
  const h = date.getHours() + date.getMinutes() / 60
  const t = Math.min(1, Math.max(0, (h - SUNRISE_HOUR) / (SUNSET_HOUR - SUNRISE_HOUR)))
  const day = h >= SUNRISE_HOUR && h < SUNSET_HOUR
  // After dark the moon rests at the end it reached (sunset) or will start
  // from (before sunrise), so the drawing never jumps across the sky.
  const { x, y } = arcAt(t)
  return { x, y, t, day }
}

export function hueForHour(hour: number): CampHue {
  if (hour >= 5 && hour < 11) return "sun"
  if (hour >= 11 && hour < 16) return "sky"
  if (hour >= 16 && hour < 20) return "dusk"
  return "lake"
}

/** A point on a circle round the rings' centre, at an angle in degrees (0 is east, y grows down). */
export function orbitPoint(cx: number, cy: number, r: number, deg: number): { x: number; y: number } {
  const a = (deg * Math.PI) / 180
  return { x: Math.round((cx + r * Math.cos(a)) * 10) / 10, y: Math.round((cy + r * Math.sin(a)) * 10) / 10 }
}

/** The fixed slots, so the drawing is the same from load to load: people and the agent on r74, events on r52. */
export const OUTER_SLOTS = [-40, 130, 210, 330] as const
export const INNER_SLOTS = [60, 250, 170] as const

/**
 * An event's title as Home says it: its links as their hosts (a link can carry
 * a meeting's password). The API leaves an untitled event's title out, so a
 * focus block without one is "Focus time" and any other "Untitled event",
 * never a blank in "Now: , until 3:30 PM".
 */
export function eventTitleOf(ev: { event_title?: string; event_is_focus?: boolean }): string {
  return linksAsHosts(ev.event_title).trim() || (ev.event_is_focus ? "Focus time" : "Untitled event")
}

export interface TimedEvent {
  event_start_time: string
  event_end_time: string
  /** A Google all-day event, already at the reader's midnights (lib/calendar/allDay). */
  event_all_day?: boolean
}

export type EventTime = "past" | "current" | "future"

export function classifyEvent(ev: TimedEvent, now: Date): EventTime {
  const start = Date.parse(ev.event_start_time)
  const end = Date.parse(ev.event_end_time)
  const t = now.getTime()
  if (Number.isFinite(end) && end <= t) return "past"
  if (Number.isFinite(start) && start <= t) return "current"
  return "future"
}

/** How far into a current event now is, 0 to 1, for its bar. */
export function eventProgress(ev: TimedEvent, now: Date): number {
  const start = Date.parse(ev.event_start_time)
  const end = Date.parse(ev.event_end_time)
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 0
  return Math.min(1, Math.max(0, (now.getTime() - start) / (end - start)))
}

export type JoinState = "hidden" | "secondary" | "primary" | "live"

/**
 * Join, by the clock (H13): nothing until 10 minutes before an event that has
 * a call; a quiet secondary button from then; the primary from 2 minutes
 * before until it ends, the only primary on Home; "live" while people are in
 * the call already.
 */
export function joinState(ev: TimedEvent & { hasCall?: boolean; live?: boolean }, now: Date): JoinState {
  if (!ev.hasCall) return "hidden"
  const start = Date.parse(ev.event_start_time)
  const end = Date.parse(ev.event_end_time)
  const t = now.getTime()
  if (!Number.isFinite(start) || (Number.isFinite(end) && t >= end)) return "hidden"
  const minutesToStart = (start - t) / 60000
  if (minutesToStart > 10) return "hidden"
  if (ev.live) return "live"
  return minutesToStart > 2 ? "secondary" : "primary"
}

/** The call link in an event's description, if it has one: the calendar's own test (lib/calendar/joinLink). */
export { callLinkOf } from "@/lib/calendar/joinLink"

/** "starts in 12 min", "started 8 min ago", "ends in 22 min": the meta line's clause. */
export function whenClause(ev: TimedEvent, now: Date): string {
  const start = Date.parse(ev.event_start_time)
  const end = Date.parse(ev.event_end_time)
  const t = now.getTime()
  const mins = (ms: number) => Math.max(1, Math.round(ms / 60000))
  const span = (m: number) => (m >= 90 ? `${Math.round(m / 60)} h` : `${m} min`)
  if (start > t) {
    const m = mins(start - t)
    return m <= 60 ? `starts in ${span(m)}` : ""
  }
  if (end > t) {
    const left = mins(end - t)
    return left <= 30 ? `ends in ${span(left)}` : `started ${span(mins(t - start))} ago`
  }
  return ""
}

/** Midnight to midnight of `now`'s day, in the device's time. */
export function todayRange(now: Date): { start: Date; end: Date } {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
  return { start, end }
}

/**
 * An event that fills the day (it starts at or before midnight and ends at or
 * after the next), or a Google all-day event on today's date.
 */
export function isAllDay(ev: TimedEvent, now: Date): boolean {
  const { start, end } = todayRange(now)
  const s = Date.parse(ev.event_start_time)
  const e = Date.parse(ev.event_end_time)
  if (ev.event_all_day) return s < end.getTime() && e > start.getTime()
  return s <= start.getTime() && e >= end.getTime()
}

export interface AgendaPlan<E extends TimedEvent> {
  allDay: E[]
  /** Past events folded under "N earlier" (only when there are more than 2). */
  earlier: E[]
  /** The timed rows shown, in order. */
  rows: { ev: E; time: EventTime }[]
  /** The now-line sits after this row index (-1: before the first); null when an event is current or none fits. */
  nowLineAfter: number | null
  /** Timed events past the five shown. */
  more: number
}

/** Today's agenda, laid out (H12, H13). Pure. */
export function planAgenda<E extends TimedEvent>(events: E[], now: Date, max = 5): AgendaPlan<E> {
  const allDay = events.filter((e) => isAllDay(e, now))
  const timed = events.filter((e) => !isAllDay(e, now))
  const classed = timed.map((ev) => ({ ev, time: classifyEvent(ev, now) }))
  const past = classed.filter((r) => r.time === "past")
  const earlier = past.length > 2 ? past.map((r) => r.ev) : []
  const visible = past.length > 2 ? classed.filter((r) => r.time !== "past") : classed
  const rows = visible.slice(0, max)
  const more = visible.length - rows.length
  const current = rows.some((r) => r.time === "current")
  let nowLineAfter: number | null = null
  if (!current && rows.length > 0) {
    const lastPast = rows.reduce((i, r, n) => (r.time === "past" ? n : i), -1)
    const hasFuture = rows.some((r) => r.time === "future")
    // Between the last started event and the next one; nothing to sit between
    // when every event is behind or ahead and there are none of the other.
    if (hasFuture || lastPast >= 0) nowLineAfter = lastPast
    if (!hasFuture && lastPast === rows.length - 1) nowLineAfter = null
  }
  return { allDay, earlier, rows, nowLineAfter, more }
}
