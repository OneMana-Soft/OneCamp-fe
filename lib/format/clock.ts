/**
 * A clock from milliseconds: "4:05", "0:09", "1:00:00", a second started
 * counting as a whole one. A board's facilitation timer counts down with it
 * (lib/board/facilitation re-exports it) and a call's moment reads as it
 * (lib/calls/callMoment); its own module, so neither brings the other along.
 */
/** "4:05", "0:09", "1:00:00". */
export function formatClock(ms: number): string {
  const s = Math.ceil(ms / 1000)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = String(s % 60).padStart(2, "0")
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`
}
