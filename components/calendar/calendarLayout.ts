import { addDays, endOfDay, endOfMonth, endOfWeek, format, parseISO, startOfDay, startOfMonth, startOfWeek } from "date-fns"

/**
 * Laying calendar items out on days and weeks, once per change of data,
 * rather than in every render. The month grid used to work out every day's
 * items by walking (and re-parsing) every event and task for each of its 42
 * days, again for each of the 30 mini-calendar days, and again for each week,
 * on every render, hovering an event included. Pure.
 */

export interface DatedItem {
  event_uuid: string
  event_title: string
  event_start_time: string
  event_end_time: string
  isTask?: boolean
  event_is_focus?: boolean
  event_is_away?: boolean
  task_project?: { project_uuid?: string } | null
}

export interface Placed<T extends DatedItem = DatedItem> {
  item: T
  start: Date
  end: Date
}

export const dayKey = (d: Date) => format(d, "yyyy-MM-dd")

/** Items with their dates parsed once; anything without a usable date is left out. */
export function placeItems<T extends DatedItem>(items: readonly T[]): Placed<T>[] {
  const out: Placed<T>[] = []
  for (const item of items) {
    const start = parseISO(item.event_start_time)
    const end = parseISO(item.event_end_time)
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) continue
    out.push({ item, start, end })
  }
  return out
}

/**
 * The last day an item is on. An event that ends at midnight (a day off from
 * Friday to Tuesday 00:00) does not take the day it ends on; a task is on the
 * day it is due, whatever the time.
 */
export function lastDayOf(p: Placed): Date {
  const atMidnight = p.end.getTime() === startOfDay(p.end).getTime()
  if (!p.item.isTask && atMidnight && p.end > p.start) return startOfDay(new Date(p.end.getTime() - 1))
  return startOfDay(p.end)
}

/** Every day from `from` to `to` (inclusive) with the items on it, by dayKey. */
export function itemsByDay<T extends DatedItem>(placed: readonly Placed<T>[], from: Date, to: Date): Map<string, T[]> {
  const map = new Map<string, T[]>()
  const first = startOfDay(from)
  const last = startOfDay(to)
  for (const p of placed) {
    let day = startOfDay(p.start) < first ? first : startOfDay(p.start)
    const end = lastDayOf(p)
    const stop = end > last ? last : end
    for (; day <= stop; day = addDays(day, 1)) {
      const k = dayKey(day)
      const list = map.get(k)
      if (list) list.push(p.item)
      else map.set(k, [p.item])
    }
  }
  return map
}

export interface WeekBar<T extends DatedItem = DatedItem> {
  item: T
  /** Column the bar starts in (0 = the week's first day), and how many it covers. */
  col: number
  span: number
  /** Whether the item starts or ends inside this week (rounded corners there). */
  startsHere: boolean
  endsHere: boolean
  /** The start time to show on a one-day bar. */
  timed: boolean
  start: Date
}

/**
 * A week's bars, packed into rows (tracks) so none overlap: longest first,
 * then earliest. Only `maxTracks` rows are drawn; the rest show as "+N more".
 */
export function layoutWeek<T extends DatedItem>(weekStart: Date, placed: readonly Placed<T>[], maxTracks = 3): WeekBar<T>[][] {
  const ws = startOfDay(weekStart)
  const we = endOfDay(addDays(ws, 6))
  const bars: WeekBar<T>[] = []
  for (const p of placed) {
    const lastDay = lastDayOf(p)
    if (p.start > we || lastDay < ws) continue
    const s = p.start < ws ? ws : startOfDay(p.start)
    const e = lastDay > we ? startOfDay(we) : lastDay
    const col = Math.round((s.getTime() - ws.getTime()) / 86_400_000)
    const span = Math.max(1, Math.round((e.getTime() - s.getTime()) / 86_400_000) + 1)
    bars.push({
      item: p.item,
      col,
      span: Math.min(span, 7 - col),
      startsHere: p.start >= ws,
      endsHere: lastDay <= we,
      timed: span === 1 && !p.item.isTask,
      start: p.start,
    })
  }
  bars.sort((a, b) => b.span - a.span || a.start.getTime() - b.start.getTime())
  const tracks: WeekBar<T>[][] = []
  for (const bar of bars) {
    let t = 0
    while (tracks[t]?.some((o) => bar.col < o.col + o.span && o.col < bar.col + bar.span)) t++
    ;(tracks[t] ??= []).push(bar)
  }
  return tracks.slice(0, maxTracks)
}

/**
 * The range a calendar asks the server for: the whole month grid around a
 * date. A week (or a day) inside that month is part of the same answer, so
 * switching between month, week and day views asks for nothing new.
 */
export function monthGridRange(anchor: Date): { start: Date; end: Date } {
  return { start: startOfWeek(startOfMonth(anchor)), end: endOfWeek(endOfMonth(anchor)) }
}
