/**
 * A task's sub-tasks, done of all (STEP5 spec B's mark): a 12 px ring, a
 * 1.5 px line-2 track and an ink-2 arc that closes in the done green, then
 * "2/5". Not the progress gradient: orange reads as an action.
 */
export function SubtaskMark({ done, total }: { done: number; total: number }) {
  if (total <= 0) return null
  const all = done >= total
  const r = 5.25
  const c = 2 * Math.PI * r
  return (
    <span className="flex shrink-0 items-center gap-1 text-xs tabular-nums text-ink-3" data-subtask-ring="" role="img" aria-label={`${done} of ${total} sub-tasks done`}>
      <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true" className="-rotate-90">
        <circle cx="6" cy="6" r={r} fill="none" strokeWidth="1.5" className="stroke-line-2" />
        <circle cx="6" cy="6" r={r} fill="none" strokeWidth="1.5" strokeLinecap="round" strokeDasharray={`${(Math.min(done, total) / total) * c} ${c}`} className={all ? "stroke-success" : "stroke-ink-2"} />
      </svg>
      <span aria-hidden="true">
        {done}/{total}
      </span>
    </span>
  )
}
