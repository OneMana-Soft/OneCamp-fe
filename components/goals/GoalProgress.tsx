import { cn } from "@/lib/utils/helpers/cn"
import { percent, type GoalSummary } from "@/lib/goals"

/**
 * How far a goal has got, as a bar, with a tick where it would be by now if
 * it moved evenly over its time: behind the tick is behind. Nothing to
 * measure yet is said, not drawn as 0%.
 */
export function GoalProgress({
  goal,
  showLabel = true,
  className,
}: {
  goal: Pick<GoalSummary, "title" | "progress" | "expected" | "status">
  showLabel?: boolean
  className?: string
}) {
  if (goal.progress === null) {
    return <span className={cn("text-xs text-muted-foreground", className)}>Nothing to measure yet</span>
  }
  const pct = Math.round(Math.min(1, Math.max(0, goal.progress)) * 100)
  const tick = goal.status === "open" && goal.expected !== undefined ? Math.round(goal.expected * 100) : undefined
  const done = pct === 100 || goal.status === "achieved"
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        aria-label={`${goal.title}: ${pct}% of the way${tick !== undefined ? `, with ${tick}% of its time gone` : ""}`}
        className="relative h-1.5 w-full min-w-16 rounded-full bg-muted"
      >
        <div
          className={cn("h-full rounded-full", done ? "bg-success" : goal.status === "open" ? "bg-foreground/70" : "bg-muted-foreground/60")}
          style={{ width: `${pct}%` }}
        />
        {tick !== undefined && tick > 0 && tick < 100 && (
          <span
            aria-hidden
            title={`Where it would be by now: ${tick}%`}
            className="absolute -top-0.5 h-2.5 w-0.5 -translate-x-1/2 rounded-full bg-foreground/45"
            style={{ left: `${tick}%` }}
          />
        )}
      </div>
      {showLabel && <span className="w-9 shrink-0 text-right text-xs tabular-nums text-muted-foreground">{percent(goal.progress)}</span>}
    </div>
  )
}
