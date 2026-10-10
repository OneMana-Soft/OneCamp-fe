import { Skeleton } from "@/components/ui/skeleton"

/**
 * An admin card while its code arrives: a title, a line under it, and a
 * hairline list of rows, which is the shape nearly every admin card has. Shown
 * for the moment a section's code loads the first time (the admin page loads
 * each section's cards when it is first opened, or when the pointer reaches
 * it in the menu), so the section holds its place instead of jumping in.
 */
export function AdminCardSkeleton() {
  return (
    <div role="status" aria-label="Loading this section" className="space-y-3">
      <div className="space-y-2" aria-hidden="true">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>
      <div className="divide-y divide-border rounded-lg border border-border" aria-hidden="true">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex items-center justify-between gap-6 px-4 py-3">
            <div className="min-w-0 flex-1 space-y-1.5">
              <Skeleton className={i % 2 === 0 ? "h-4 w-1/3" : "h-4 w-2/5"} />
              <Skeleton className={i % 2 === 0 ? "h-3 w-1/2" : "h-3 w-2/3"} />
            </div>
            <Skeleton className="h-8 w-20 shrink-0" />
          </div>
        ))}
      </div>
    </div>
  )
}
