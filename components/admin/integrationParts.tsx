import { Skeleton } from "@/components/ui/skeleton"

/**
 * A connection's section while it loads (the Slack bridge, GitHub): its status
 * line with a button at the end, and a bordered list of two rows, the shape a
 * connected section draws. It was a block of generic lines in a bordered box,
 * which the section's own status line and list then replaced.
 */
export function ConnectionSkeleton({ label }: { label: string }) {
  return (
    <div role="status" aria-label={label} className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-8 w-28 rounded-md" />
      </div>
      <div className="divide-y divide-border rounded-lg border border-border">
        {[0, 1].map((i) => (
          <div key={i} data-connection-skeleton-row="" aria-hidden="true" className="flex items-center justify-between gap-3 px-4 py-3">
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-3.5 w-44" />
              <Skeleton className="h-3 w-64 max-w-full" />
            </div>
            <Skeleton className="size-8 shrink-0 rounded-md" />
          </div>
        ))}
      </div>
    </div>
  )
}
