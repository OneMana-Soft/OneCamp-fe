import { Skeleton } from "@/components/ui/skeleton"
import { fieldRow } from "@/lib/ui/fieldRow"

const ROWS = ["w-28", "w-16", "w-16", "w-24", "w-20", "w-28"]

/**
 * The task panel's shape while a task loads: its header, title, status and
 * field rows where they will be, so the panel fills in place instead of a
 * spinner in the middle giving way to a page. Hovering a task loads it ahead
 * (KeyboardList), so this shows only when a task opens cold.
 */
export function TaskPanelSkeleton() {
  return (
    <div className="flex h-full flex-col" aria-busy="true" aria-label="Loading the task">
      <div className="flex h-[49px] items-center gap-2 border-b px-3">
        <Skeleton className="h-8 w-32 rounded-md" />
        <Skeleton className="ml-auto h-7 w-7 rounded-md" />
        <Skeleton className="h-7 w-7 rounded-md" />
      </div>
      <div className="px-4 pt-6 sm:px-6">
        <Skeleton className="h-5 w-24" />
        <Skeleton className="mt-5 h-7 w-4/5" />
        <Skeleton className="mt-2 h-7 w-1/2" />
        <div className="mb-6 mt-5 flex gap-4">
          <Skeleton className="h-5 w-24" />
          <Skeleton className="h-5 w-16" />
        </div>
        {ROWS.map((w, i) => (
          <div key={i} className={fieldRow()}>
            <Skeleton className="h-4 w-16" />
            <Skeleton className={`h-8 ${w}`} />
          </div>
        ))}
        <Skeleton className="mt-6 h-28 w-full rounded-lg" />
      </div>
    </div>
  )
}
