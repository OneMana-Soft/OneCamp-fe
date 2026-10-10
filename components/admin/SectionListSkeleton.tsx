import * as React from "react"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils/helpers/cn"

/**
 * A list's loading state in the list's own shape: the same hairline box, the
 * same row padding (px-4 py-3), the same line boxes (a 20px title line, 18px
 * meta lines 2px apart), the same leading tile and trailing control. The AI
 * tab's lists showed the generic SkeletonRows (40px rows, no box) and then a
 * bordered list of 56 to 170px rows replaced it, so every section jumped as it
 * arrived.
 */
export function SectionListSkeleton({
  label,
  rows = 3,
  lines = 2,
  leading = "none",
  trailing = "none",
  className,
}: {
  /** What is loading, for a screen reader ("Loading the AI activity"). */
  label: string
  rows?: number
  /** Lines per row: the title, then meta lines. */
  lines?: 1 | 2 | 3
  leading?: "none" | "tile-sm" | "tile-md" | "avatar"
  trailing?: "none" | "switch" | "button"
  className?: string
}) {
  return (
    <div role="status" aria-label={label} data-section-list-skeleton="" className={cn("divide-y divide-border rounded-lg border border-border", className)}>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} aria-hidden="true" className="flex items-start gap-3 px-4 py-3">
          {leading === "tile-sm" && <Skeleton className="mt-0.5 size-6 shrink-0 rounded-md" />}
          {leading === "tile-md" && <Skeleton className="size-8 shrink-0 rounded-lg" />}
          {leading === "avatar" && <Skeleton variant="circle" className="size-9 shrink-0" />}
          <div className="min-w-0 flex-1">
            <div className="flex h-5 items-center">
              <Skeleton className={cn("h-3.5 rounded", i % 2 === 0 ? "w-2/5" : "w-1/3")} />
            </div>
            {lines >= 2 && (
              <div className="mt-0.5 flex h-[18px] items-center">
                <Skeleton className={cn("h-3 rounded", i % 2 === 0 ? "w-3/5" : "w-1/2")} />
              </div>
            )}
            {lines >= 3 && (
              <div className="mt-0.5 flex h-[18px] items-center">
                <Skeleton className="h-3 w-1/4 rounded" />
              </div>
            )}
          </div>
          {trailing === "switch" && <Skeleton className="mt-0.5 h-5 w-9 shrink-0 rounded-full" />}
          {trailing === "button" && <Skeleton className="h-8 w-20 shrink-0 rounded-md" />}
        </div>
      ))}
    </div>
  )
}
