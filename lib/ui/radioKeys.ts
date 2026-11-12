const STEP: Record<string, number> = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }

/** Where a key moves a radio group's pick from `at` of `n` (WAI-ARIA, round at both ends); null if not an unmodified move. */
export function radioKeyTo(e: KeyboardEvent, at: number, n: number): number | null {
  if (e.shiftKey || e.ctrlKey || e.altKey || e.metaKey) return null
  if (STEP[e.key]) return (at + STEP[e.key] + n) % n
  return e.key === "Home" ? 0 : e.key === "End" ? n - 1 : null
}
