import { MilestoneMark } from "@/components/work/milestones/MilestoneMark"
import { cn } from "@/lib/utils/helpers/cn"
import { targetWords, type Milestone } from "@/lib/work/milestones"

/**
 * A project's next milestone as the projects overview's rows name it
 * (linear-16): its diamond, its name and its target day, in red once it has
 * passed unfinished. It shrinks before the project's name does.
 */
export function NextMilestone({ m, now, className }: { m: Milestone; now?: Date; className?: string }) {
  const target = targetWords(m, now)
  return (
    <span
      data-next-milestone=""
      title={`Next milestone: ${m.name}${target ? `, ${target.text}${target.late ? ", late" : ""}` : ""}`}
      className={cn("flex min-w-0 shrink-[2] items-center gap-1.5 text-xs text-ink-3", className)}
    >
      <MilestoneMark progress={m.progress} next={m.next} className="size-2" />
      <span className="sr-only">Next milestone:</span>
      <span className="min-w-0 truncate">{m.name}</span>
      {target && (
        <span className={cn("shrink-0 tabular-nums", target.late && "text-danger-ink")}>
          {target.text}
          {target.late && <span className="sr-only">, late</span>}
        </span>
      )}
    </span>
  )
}
