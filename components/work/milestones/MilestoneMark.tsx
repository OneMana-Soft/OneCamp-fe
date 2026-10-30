import { cn } from "@/lib/utils/helpers/cn"
import { finished, type MilestoneProgress } from "@/lib/work/milestones"

/**
 * A milestone's diamond, as the timeline draws a milestone's day: the project's
 * hue while it's open, warm when it's the next to finish (Linear's focus
 * mark), and green once every task in it is closed. Open, it takes the hue's
 * dark accent on light and its bright tone on dark, 3:1 or more on both
 * grounds. Decorative: the row says the same in words.
 */
export function MilestoneMark({ progress, next, className }: { progress: MilestoneProgress; next: boolean; className?: string }) {
  const state = finished(progress) ? "finished" : next ? "next" : "open"
  return (
    <span
      aria-hidden
      data-milestone-mark={state}
      className={cn(
        "inline-block size-2.5 shrink-0 rotate-45 rounded-[2px] ring-2 ring-sheet",
        state === "finished" ? "bg-success" : state === "next" ? "bg-warning" : "bg-[var(--hue-a2)] dark:bg-[var(--hue)]",
        className,
      )}
    />
  )
}
