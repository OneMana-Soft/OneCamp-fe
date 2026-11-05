/**
 * A day's start in this browser's time zone, in RFC 3339 with the zone's offset: "2026-11-02" is
 * "2026-11-02T00:00:00+05:30" in India. `daysAfter` moves on by calendar days, never by 24 hours, so 1 gives
 * the next day's start across a clock change: the open end of a range that keeps its last day whole.
 * Undefined when the text isn't a real day written as 2026-11-02 (2026-02-31 isn't one).
 * Pure and self-contained, so a lazy chunk takes it without reaching the shared core.
 */
export function localMidnight(day: string, daysAfter = 0): string | undefined {
  const parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day)
  if (!parts) return undefined
  const [y, m, d] = [Number(parts[1]), Number(parts[2]), Number(parts[3])]
  const real = new Date(y, m - 1, d)
  if (real.getFullYear() !== y || real.getMonth() !== m - 1 || real.getDate() !== d) return undefined
  // A day whose midnight a clock change skips starts at the first time it has, and says so.
  const at = new Date(y, m - 1, d + daysAfter)
  const east = -at.getTimezoneOffset()
  // A machine stamp, never a clock time for people: the zone's wall time read as UTC, then the zone's offset.
  const wall = new Date(at.getTime() + east * 60_000).toISOString().slice(0, 19)
  const two = (n: number) => String(n).padStart(2, "0")
  return `${wall}${east < 0 ? "-" : "+"}${two(Math.floor(Math.abs(east) / 60))}:${two(Math.abs(east) % 60)}`
}
