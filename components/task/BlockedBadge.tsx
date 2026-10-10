import { Lock } from "@/lib/icons"
import { cn } from "@/lib/utils/helpers/cn"

/**
 * A task still waiting on open tasks (its dependencies, set on the timeline
 * or in its panel): a lock and how many, on a board card, a list row and the
 * timeline's bar. Nothing when it waits on nothing open.
 */
export function BlockedBadge({ count, className }: { count?: number; className?: string }) {
  if (!count) return null
  const words = `Waiting on ${count} open ${count === 1 ? "task" : "tasks"}`
  return (
    <span title={words} className={cn("inline-flex items-center gap-0.5 font-medium text-warning-ink", className)}>
      <Lock aria-hidden className="h-3 w-3" />
      <span aria-hidden>{count}</span>
      <span className="sr-only">{words}</span>
    </span>
  )
}
