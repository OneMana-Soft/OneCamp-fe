import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils/helpers/cn"

/**
 * SkeletonCards — the loading state for a grid of cards.
 *
 * The sibling of SkeletonRows, for the other layout the app actually uses. A
 * skeleton only earns its keep when it occupies the same box as the content that
 * replaces it, and a row-shaped placeholder in front of a two-column card grid
 * misses by exactly as much as a spinner does: the grid still snaps into place on
 * arrival.
 *
 * The caller passes its own grid classes rather than picking from an enum of
 * column counts, because the real content already declares them — tables uses
 * `sm:grid-cols-2`, templates `sm:grid-cols-2 lg:grid-cols-3`. Reusing that exact
 * string is what keeps the two in step when someone changes the breakpoints, and
 * it means this component never has to know how many columns exist.
 */
export const SkeletonCards: React.FC<{
  /** How many placeholder cards. Match a typical first screen, not the maximum. */
  cards?: number
  /**
   * The SAME grid classes the real content uses, so the placeholder occupies the
   * identical box. Defaults to the most common shape in the app.
   */
  gridClassName?: string
  /** Card height, matched to the real card. */
  cardClassName?: string
  /** Draw a short meta line above the title, for cards that carry a badge or tag. */
  meta?: boolean
}> = ({
  cards = 4,
  gridClassName = "grid gap-2 sm:grid-cols-2",
  cardClassName = "rounded-xl border border-border/60 p-4",
  meta = false,
}) => (
  // aria-hidden, with the "loading" announcement left to the caller's live region:
  // a screen reader should hear that something is loading, not a list of boxes.
  <div className={gridClassName} aria-hidden="true">
    {Array.from({ length: cards }).map((_, i) => (
      <div key={i} className={cn("flex flex-col gap-2", cardClassName)}>
        {meta && (
          <div className="flex items-center gap-2">
            <Skeleton variant="circle" className="h-5 w-5 shrink-0" />
            <Skeleton className="h-4 w-16 rounded-full" />
          </div>
        )}
        <div className="flex items-center gap-2">
          {!meta && <Skeleton variant="circle" className="h-5 w-5 shrink-0" />}
          {/* Varied widths, so it reads as content rather than a placeholder grid. */}
          <Skeleton className={cn("h-3.5 rounded", i % 3 === 0 ? "w-2/5" : i % 3 === 1 ? "w-1/2" : "w-1/3")} />
        </div>
        <Skeleton className={cn("h-2.5 rounded", i % 2 === 0 ? "w-3/4" : "w-3/5")} />
      </div>
    ))}
  </div>
)

export default SkeletonCards
