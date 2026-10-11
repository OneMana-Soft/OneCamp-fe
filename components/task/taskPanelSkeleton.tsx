import { Skeleton } from "@/components/ui/skeleton"
import { propertyRow } from "@/lib/ui/propertyRow"

const VALUES = ["w-28", "w-20", "w-32", "w-36", "w-24", "w-[120px]"]

/**
 * The task panel's shape while a task loads (design v3, work.md W28): the
 * 52px header, a 20px title bar, six 32px property rows (a 64px label and a
 * value), and three lines of description, where each will be, so the panel
 * fills in place. Hovering a task loads it ahead (KeyboardList), so this
 * shows only when a task opens cold.
 */
export function TaskPanelSkeleton() {
  return (
    <div className="flex h-full flex-col" aria-busy="true" aria-label="Loading the task" data-task-panel-skeleton="">
      <div className="flex h-[52px] items-center gap-2 pl-5 pr-2.5">
        <Skeleton className="size-4 rounded-[5px]" />
        <Skeleton className="h-3.5 w-24" />
        <Skeleton className="ml-auto h-7 w-28 rounded-md" />
        <Skeleton className="size-7 rounded-md" />
      </div>
      <div className="px-6 pt-[18px]">
        <Skeleton className="mb-5 h-5 w-4/5" />
        {VALUES.map((w, i) => (
          <div key={i} className={propertyRow()}>
            <Skeleton className="h-3.5 w-16" />
            <Skeleton className={`h-4 ${w}`} />
          </div>
        ))}
        <div className="mt-6 grid gap-2">
          <Skeleton className="h-3.5 w-full" />
          <Skeleton className="h-3.5 w-11/12" />
          <Skeleton className="h-3.5 w-2/3" />
        </div>
      </div>
    </div>
  )
}
