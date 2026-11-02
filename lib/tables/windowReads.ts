// A windowed view's next read (airtable-04): near its run, on by cursor or back by place; farther, a jump, so
// the end of 100,000 rows is one read, not 200. A grouped view, or a server that reads no place, only reads on.

/** The run of places a view holds: where it starts, how many, and the cursor after it. */
export interface WindowRun {
  from: number
  held: number
  next: string | null
}

export type WindowRead =
  /** On by cursor (the view's first window, before any is read). */
  | { read: "on" }
  | { read: "back"; at: number; n: number }
  /** A run that starts at `at` instead. */
  | { read: "jump"; at: number }

export interface WindowReadRules {
  /** The view's count, short of the rows added here; Infinity before it's counted. */
  end: number
  /** The places either side of those in sight that are read too. */
  around: number
  /** The rows a window holds. */
  window: number
  jumps: boolean
}

/** What to read next for the places in sight, first to last, or null when the run holds them. Pure. */
export function windowRead(run: WindowRun, sight: { first: number; last: number }, rules: WindowReadRules): WindowRead | null {
  if (run.next === "" && run.held === 0) return { read: "on" }
  const lo = Math.max(0, Math.min(sight.first, sight.last) - rules.around)
  const hi = Math.min(rules.end, Math.max(sight.first, sight.last) + rules.around + 1)
  const end = run.from + run.held
  if (!rules.jumps) return run.next !== null && hi > end ? { read: "on" } : null
  if (lo >= hi) return null
  if (lo < run.from) {
    if (run.from - hi >= rules.window) return { read: "jump", at: lo }
    const at = Math.max(0, run.from - rules.window)
    return { read: "back", at, n: run.from - at }
  }
  if (hi <= end || run.next === null) return null
  return lo - end < rules.window ? { read: "on" } : { read: "jump", at: lo }
}
