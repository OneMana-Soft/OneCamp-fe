// A table's duration as people type it, in seconds (STEP5 spec E): the
// server's ParseDuration rule for rule (testdata/fieldtypes), beside time
// tracking's minutes (duration.ts), which reads the same things the same way
// where they meet. Its own file, so time tracking's pages don't carry it.

const DURATION_CLOCK = /^(\d+):([0-5]?\d)(?::([0-5]?\d(?:\.\d+)?))?$/
const DURATION_UNITS =
  /^(?:(\d+(?:\.\d+)?)\s*d(?:ays?)?)?\s*(?:(\d+(?:\.\d+)?)\s*h(?:ours?|rs?)?)?\s*(?:(\d+(?:\.\d+)?)\s*m(?:in(?:ute)?s?)?)?\s*(?:(\d+(?:\.\d+)?)\s*s(?:ec(?:ond)?s?)?)?$/i
/** Hours with their minutes unmarked: 1h30. */
const DURATION_HOURS_MINUTES = /^(\d+)\s*h(?:ours?|rs?)?\s*(\d+)$/i
/** A number alone, which is minutes: 90. */
const DURATION_MINUTES = /^\d+(?:\.\d+)?$/

/**
 * A duration as people write one, in seconds: a clock (1:30 is an hour and a
 * half, 1:30:15 adds seconds), units (1h 30m, 90m, 45s, 1.5h, 2d), hours with
 * their minutes (1h30), or a number alone, which is minutes (90); null for
 * anything else. The server's ParseDuration, rule for rule.
 */
export function parseDurationSeconds(text: string): number | null {
  const t = text.trim()
  if (!t) return null
  const clock = DURATION_CLOCK.exec(t)
  if (clock) return Number(clock[1]) * 3600 + Number(clock[2]) * 60 + (clock[3] ? Number(clock[3]) : 0)
  const hm = DURATION_HOURS_MINUTES.exec(t)
  if (hm) return Number(hm[1]) * 3600 + Number(hm[2]) * 60
  if (DURATION_MINUTES.test(t)) return Number(t) * 60
  const units = DURATION_UNITS.exec(t)
  if (units && units.slice(1).some(Boolean)) {
    return [86400, 3600, 60, 1].reduce((total, per, i) => total + (units[i + 1] ? Number(units[i + 1]) * per : 0), 0)
  }
  return null
}
