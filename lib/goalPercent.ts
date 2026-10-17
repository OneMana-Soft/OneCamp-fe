/**
 * A goal's progress in words, on its own: the chip beside a project's name
 * (ProjectGoalChip) says "40%" and needs nothing else of lib/goals, which
 * the project route used to bring in whole for it (app/firstLoad.test.ts).
 */

/** "55%"; a dash for nothing to measure. Pure. */
export function percent(v: number | null | undefined): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "—"
  return `${Math.round(Math.min(1, Math.max(0, v)) * 100)}%`
}
