"use client"

import { useEffect, useState } from "react"

import { StatusGlyph } from "@/components/ui/graphics/glyphs"
import { ProgressRing } from "@/components/ui/graphics/ProgressRing"
import { Bar } from "@/components/ui/progress"
import { prefersReducedMotion } from "@/lib/celebrate"
import { cn } from "@/lib/utils/helpers/cn"
import { percent, type GoalSummary } from "@/lib/goals"

/** Points ahead of (positive) or behind (negative) where an open goal would be by now; none when it can't be said. */
export function paceOf(goal: Pick<GoalSummary, "progress" | "expected" | "status">): number | null {
  if (goal.status !== "open" || goal.progress === null || goal.expected === undefined) return null
  return Math.round((Math.min(1, Math.max(0, goal.progress)) - goal.expected) * 100)
}

/**
 * Ahead or behind, in words, never colour alone (work.md W08): "23 ahead" in
 * moss ink, "8 behind" in danger ink, "on pace" in ink-2. `long` says it the
 * goal page's way: "23 points ahead of its time".
 */
export function PaceWords({ goal, long = false, className }: { goal: Pick<GoalSummary, "progress" | "expected" | "status">; long?: boolean; className?: string }) {
  const pace = paceOf(goal)
  if (pace === null) return null
  const n = Math.abs(pace)
  const text = pace === 0 ? (long ? "On pace with its time" : "on pace") : long ? `${n} ${n === 1 ? "point" : "points"} ${pace > 0 ? "ahead of" : "behind"} its time` : `${n} ${pace > 0 ? "ahead" : "behind"}`
  return (
    <span data-pace={pace > 0 ? "ahead" : pace < 0 ? "behind" : "even"} className={cn("whitespace-nowrap text-xs font-[510]", pace > 0 ? "text-camp-moss-ink" : pace < 0 ? "text-danger-ink" : "text-ink-2", className)}>
      {text}
    </span>
  )
}

/**
 * How far a goal has got (work.md W08, W42): the 6 px bar with a pace tick
 * where it would be by now if it moved evenly over its time, so behind the
 * tick is behind. Nothing to measure yet is said, not drawn as 0 %.
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
    return <span className={cn("text-xs text-ink-3", className)}>Nothing to measure yet</span>
  }
  const pct = Math.round(Math.min(1, Math.max(0, goal.progress)) * 100)
  const tick = goal.status === "open" && goal.expected !== undefined ? Math.round(goal.expected * 100) : undefined
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <Bar
        value={pct}
        size={6}
        pace={tick !== undefined && tick > 0 && tick < 100 ? tick : undefined}
        label={`${goal.title}: ${pct}% of the way${tick !== undefined ? `, with ${tick}% of its time gone` : ""}`}
        doneAtFull={goal.status === "open" || goal.status === "achieved"}
        className={cn("min-w-16", goal.status !== "open" && goal.status !== "achieved" && "opacity-60")}
      />
      {showLabel && <span className="w-9 shrink-0 text-right text-xs tabular-nums text-ink-2">{percent(goal.progress)}</span>}
    </div>
  )
}

/**
 * A goal's ring (W42, W43): the progress ring with the number inside, filling
 * from 0 on its first reveal (its dash transitions on the out-curve). A closed
 * goal shows how it ended instead: a moss disc and check for achieved, an
 * ink-3 disc and cross for missed or dropped.
 */
export function GoalRing({
  goal,
  size = 28,
  weight,
  grow = true,
  duration,
  children,
}: {
  goal: Pick<GoalSummary, "title" | "progress" | "status">
  size?: number
  weight?: number
  grow?: boolean
  duration?: number
  children?: React.ReactNode
}) {
  const pct = goal.progress === null ? 0 : Math.round(Math.min(1, Math.max(0, goal.progress)) * 100)
  const [shown, setShown] = useState(() => (grow && !prefersReducedMotion() ? 0 : pct))
  useEffect(() => {
    if (shown === pct) return
    const raf = requestAnimationFrame(() => setShown(pct))
    return () => cancelAnimationFrame(raf)
  }, [pct, shown])
  if (goal.status === "achieved") return <StatusGlyph status="done" size={size} label={`${goal.title}: achieved`} />
  if (goal.status === "missed" || goal.status === "dropped") return <StatusGlyph status="cancelled" size={size} label={`${goal.title}: ${goal.status}`} />
  if (goal.progress === null) return <span aria-hidden="true" className="shrink-0 rounded-full border border-dashed border-ink-4" style={{ width: size, height: size }} />
  return (
    <ProgressRing value={shown} size={size} weight={weight ?? (size >= 64 ? 6 : 2.5)} duration={duration} label={`${goal.title}: ${percent(goal.progress)}`}>
      {children ?? <span className="text-3xs font-[590] tabular-nums text-foreground">{pct}</span>}
    </ProgressRing>
  )
}
