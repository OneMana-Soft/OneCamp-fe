"use client"

import Link from "next/link"
import { useProjectGoals } from "@/hooks/useGoals"
import { Target } from "@/lib/icons"
import { percent } from "@/lib/goals"
import { ProgressRing } from "@/components/ui/graphics/ProgressRing"

/**
 * The goal a project serves, beside its name: "Launch the Business tier ·
 * 40%", linking to the goal, and how many more when it serves several. A
 * project serving none shows nothing.
 */
export function ProjectGoalChip({ projectId }: { projectId: string }) {
  const goals = useProjectGoals(projectId)
  const first = goals[0]
  if (!first) return null
  const more = goals.length - 1
  return (
    <Link
      href={`/app/goals/${first.id}`}
      title={goals.map((g) => g.title).join("\n")}
      className="inline-flex max-w-xs items-center gap-1.5 rounded-md px-1.5 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
    >
      {/* How far the goal is, as a ring in the theme's progress: where the
          chip said it twice (a target icon, then the percentage). */}
      {first.progress !== null ? (
        <ProgressRing value={Math.round(first.progress * 100)} size={14} weight={2} label={`${first.title}: ${percent(first.progress)}`} className="text-muted-foreground" />
      ) : (
        <Target className="h-3 w-3 shrink-0 text-muted-foreground" aria-hidden />
      )}
      <span className="truncate">{first.title}</span>
      {first.progress !== null && <span className="tabular-nums opacity-75">{percent(first.progress)}</span>}
      {more > 0 && <span className="shrink-0 opacity-75">+{more}</span>}
    </Link>
  )
}
