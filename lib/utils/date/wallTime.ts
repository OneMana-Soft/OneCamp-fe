import { wallClock } from "@/lib/utils/date/clock"

/**
 * A day and a time of day on a zone's clock, and the moment it reads them
 * (calendar head F, V-642): the Event Form reads and writes an event's times
 * on its own zone's clock, wherever its reader is, as Google's form does.
 * Read through the one clock (lib/utils/date/clock wallClock): no zone, or one
 * this runtime can't read, is the device's own clock, as clockTime falls back.
 */
export interface Wall {
  year: number
  /** From 0, as a Date's. */
  month: number
  day: number
  /** From midnight, as the time list's. */
  minutes: number
}

const DAY_MS = 24 * 60 * 60 * 1000

/** A moment on zone's clock, to the minute. */
export function wallOf(at: Date, zone?: string): Wall {
  const w = new Date(wallClock(at, { timeZone: zone }))
  return { year: w.getUTCFullYear(), month: w.getUTCMonth(), day: w.getUTCDate(), minutes: w.getUTCHours() * 60 + w.getUTCMinutes() }
}

/**
 * The moment zone's clock reads wall. A time the clocks skip (2:30 AM the
 * night they go forward) is the time after it, and one they pass twice is its
 * first pass, as a Date made for it on the device's own clock is. The zone's
 * offset is read a day either side of it, so a change between is seen.
 */
export function atWall(wall: Wall, zone?: string): Date {
  const want = Date.UTC(wall.year, wall.month, wall.day, 0, wall.minutes)
  const clock = (t: number) => wallClock(new Date(t), { timeZone: zone })
  const before = want - (clock(want - DAY_MS) - (want - DAY_MS))
  const after = want - (clock(want + DAY_MS) - (want + DAY_MS))
  const reads = [before, after].filter((t) => clock(t) === want)
  return new Date(reads.length ? Math.min(...reads) : before)
}

/** A wall time as a Date on the device's own clock, for what reads a Date's own fields: a month's day, a repeat's weekday. */
export function onDeviceClock(wall: Wall): Date {
  return new Date(wall.year, wall.month, wall.day, Math.floor(wall.minutes / 60), wall.minutes % 60)
}
