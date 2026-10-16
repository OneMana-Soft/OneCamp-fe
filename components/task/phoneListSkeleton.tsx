import { Skeleton } from "@/components/ui/skeleton"

/**
 * A phone task list's first load (work.md W53): the rows' own shape, a check
 * and two lines, not a "Loading more…" spinner. The project list and My tasks
 * draw it while their first page is on its way.
 */
export function PhoneListSkeleton() {
    return (
        <div aria-hidden="true" data-list-skeleton="" className="w-full self-stretch">
            {[0, 1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="flex h-14 items-center gap-3 border-b border-line pl-4 pr-4">
                    <Skeleton className="size-5 shrink-0 rounded-full" />
                    <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                        <Skeleton className={i % 2 ? "h-3.5 w-3/5" : "h-3.5 w-2/5"} />
                        <Skeleton className="h-2.5 w-1/4" />
                    </div>
                </div>
            ))}
        </div>
    )
}
