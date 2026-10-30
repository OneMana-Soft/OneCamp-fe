// A share in words, on its own: the goal chip beside a project's name
// ("40%") needs nothing else of lib/goals (app/firstLoad.test.ts), nor does
// the call quality card.

/** "55%"; "<1%" for a sliver; a dash for nothing to measure. Pure. */
export function percent(v: number | null | undefined): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "—"
  if (v > 0 && v < 0.005) return "<1%"
  return `${Math.round(Math.min(1, Math.max(0, v)) * 100)}%`
}
