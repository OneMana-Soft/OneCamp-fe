/**
 * Where a week or day grid opens: the minute of the day at the top of its
 * view.
 *
 * A grid that opens on an empty stretch hides the day. The demo's meetings
 * are all in the evening, and a week opened at 7 am showed none of them, only
 * an empty working day. So the grid aims at the next thing to come:
 * - with today in view, now and the next item still running or still to come
 *   today, when both fit in the view; when they don't, that item, with an
 *   hour of grid above it. With nothing left today, the first item of a later
 *   day in view that starts no earlier in its day than an hour before now,
 *   the same way: one earlier in its day (an event at 00:30 on Saturday)
 *   took the whole week back to midnight, away from now (PTC-8);
 * - with only other days in view, the earliest start among them;
 * - with nothing timed to show, an hour before now (4 pm at the latest) when
 *   today is in view, else 8 am.
 *
 * A span carried over from the day before starts at midnight on the grid and
 * never counts: one overnight event sent the grid to midnight. Pure.
 */

export interface OpeningItem {
  /** Minutes from midnight where it starts on its day's column. */
  topMin: number
  /** Minutes from midnight where it ends on its day's column. */
  endMin: number
  /** It began on an earlier day and runs into this one. */
  carried?: boolean
}

/** An hour of grid above whatever the view opens on. */
const AIR = 60
/** The view's height when the grid can't measure it yet (a test's DOM): about ten hours. */
export const DEFAULT_VIEW_MINUTES = 600

export function openingMinute(byDay: OpeningItem[][], todayIndex: number, nowMin: number, viewMin = DEFAULT_VIEW_MINUTES): number {
  const own = (items: OpeningItem[]) => items.filter((it) => !it.carried)
  const earliest = (items: OpeningItem[]) => (items.length ? Math.min(...items.map((it) => it.topMin)) : null)
  if (todayIndex < 0) {
    const first = earliest(byDay.flatMap(own))
    return first === null ? 8 * 60 : Math.max(0, first - AIR)
  }
  const nowTop = Math.max(0, nowMin - AIR)
  const next =
    earliest(own(byDay[todayIndex] ?? []).filter((it) => it.endMin > nowMin)) ??
    earliest(byDay.slice(todayIndex + 1).flatMap(own).filter((it) => it.topMin >= nowTop))
  if (next === null) return Math.min(nowTop, 16 * 60)
  // Now and the next item together, with an hour of the item in view.
  if (next >= nowTop && next + AIR <= nowTop + viewMin) return nowTop
  return Math.max(0, next - AIR)
}
