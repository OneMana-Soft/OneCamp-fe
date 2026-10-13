/**
 * Google all-day events, placed by their dates (CAL-BUG-2).
 *
 * The server sends a Google all-day event with its dates, event_start_date
 * and event_end_date ("YYYY-MM-DD", the end exclusive, as Google gives them),
 * beside instants at midnight UTC on its first day and on the day after its
 * last. Read as instants, "Offsite" on Wednesday 14 October sat on Tuesday
 * and Wednesday in New York and on Wednesday and Thursday in India, from
 * 20:00 to 20:00. A date is the same day everywhere, so the web places these
 * by their dates: the instants become the reader's own midnights, the end
 * exclusive, which is how every view already draws an all-day event.
 * Everything else is left as it came. Pure.
 */
export interface AllDayFields {
  event_start_time: string
  event_end_time: string
  /** A Google all-day event: placed by its dates, never by its instants. */
  event_all_day?: boolean
  event_start_date?: string
  /** Exclusive: a one-day event on the 14th ends on the 15th. */
  event_end_date?: string
}

const DATE = /^(\d{4})-(\d{2})-(\d{2})$/

/** "2026-10-14" as the reader's midnight that day; null for anything else. */
export function localDate(date: string | null | undefined): Date | null {
  const m = DATE.exec(date ?? "")
  if (!m) return null
  const [y, mo, d] = [Number(m[1]), Number(m[2]) - 1, Number(m[3])]
  const out = new Date(y, mo, d)
  return out.getFullYear() === y && out.getMonth() === mo && out.getDate() === d ? out : null
}

/** The date a midnight-UTC instant stands for, as the reader's midnight. */
function utcDate(iso: string): Date | null {
  const t = new Date(iso)
  if (Number.isNaN(t.getTime())) return null
  return new Date(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate())
}

/**
 * The item with its instants at the reader's midnights when it is a Google
 * all-day event; the same object otherwise, and when they already are.
 * Without dates (a server that sent only the flag) the instants' UTC dates
 * stand in: midnight UTC on the first day, and on the day after the last.
 */
export function placedByDates<T extends AllDayFields>(e: T): T {
  if (!e.event_all_day) return e
  const start = localDate(e.event_start_date) ?? utcDate(e.event_start_time)
  if (!start) return e
  let end = localDate(e.event_end_date) ?? utcDate(e.event_end_time)
  if (!end || end <= start) end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 1)
  const s = start.toISOString()
  const en = end.toISOString()
  return s === e.event_start_time && en === e.event_end_time ? e : { ...e, event_start_time: s, event_end_time: en }
}

/** Every item of a list placed by its dates; the same array when none needed it. */
export function placeAllByDates<T extends AllDayFields>(items: readonly T[]): T[] {
  let changed = false
  const out = items.map((e) => {
    const p = placedByDates(e)
    if (p !== e) changed = true
    return p
  })
  return changed ? out : (items as T[])
}
