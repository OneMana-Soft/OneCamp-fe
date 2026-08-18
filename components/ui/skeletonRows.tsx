import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils/helpers/cn"

/**
 * SkeletonRows — the loading state for a list.
 *
 * A centred spinner says "something is happening" and nothing else: it holds no
 * space, so the moment data lands the layout jumps, and on a phone that jump is
 * the difference between tapping the row you meant and the one that slid under
 * your thumb. A skeleton in the SHAPE of the content says what is coming, keeps
 * the box the same size before and after, and reads as instant even when it isn't.
 *
 * Generic on purpose: rows, whether they carry an avatar, and how many lines each
 * has. Any list — teammates, runs, agents, channels — uses this instead of
 * inventing its own placeholder, so a loading list looks the same everywhere.
 */
export const SkeletonRows: React.FC<{
  /** How many placeholder rows to draw. Match the typical page, not the maximum. */
  rows?: number
  /** Leading circle, for lists whose rows start with an avatar or status dot. */
  avatar?: boolean
  /** Lines of text per row: 1 for a compact list, 2 for title + subtitle. */
  lines?: 1 | 2
  className?: string
}> = ({ rows = 3, avatar = true, lines = 2, className }) => (
  // aria-hidden + a live-region label on the parent is the accessible pattern:
  // a screen reader should hear "loading", not a description of grey boxes.
  <div className={cn("space-y-2", className)} aria-hidden="true">
    {Array.from({ length: rows }).map((_, i) => (
      <div key={i} className="flex items-start gap-2.5 py-1.5">
        {avatar && <Skeleton variant="circle" className="mt-0.5 h-4 w-4 shrink-0" />}
        <div className="min-w-0 flex-1 space-y-1.5">
          {/* Varied widths so the placeholder reads as content rather than a
              grid — the same trick that makes a skeleton feel like a list. */}
          <Skeleton className={cn("h-3 rounded", i % 3 === 0 ? "w-2/5" : i % 3 === 1 ? "w-1/2" : "w-1/3")} />
          {lines === 2 && <Skeleton className={cn("h-2.5 rounded", i % 2 === 0 ? "w-3/4" : "w-2/3")} />}
        </div>
      </div>
    ))}
  </div>
)

export default SkeletonRows
