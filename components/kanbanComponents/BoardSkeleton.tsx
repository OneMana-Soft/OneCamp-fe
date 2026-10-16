import { Skeleton } from "@/components/ui/skeleton"

/**
 * A board while its tasks load, in the board's own shape (Container.tsx):
 * 280px columns 12px apart on the sunken surface at r12, each with its 40px
 * header and cards at r10, resting. The board used to draw its columns
 * empty while the fetch ran, the same as a board with no tasks.
 */
export function BoardSkeleton({ columns = 4 }: { columns?: number }) {
  return (
    <div role="status" aria-label="Loading the board" data-board-skeleton="" className="flex h-full gap-2 overflow-hidden px-4 pb-4 sm:gap-3 sm:px-0">
      {Array.from({ length: columns }, (_, c) => (
        <div key={c} aria-hidden="true" className="flex w-[calc(100vw-56px)] shrink-0 flex-col rounded-lg bg-sunken sm:w-auto sm:min-w-[264px] sm:max-w-[320px] sm:flex-1 sm:basis-0 dark:bg-white/[.02]">
          <div className="flex h-10 items-center gap-2 px-3">
            <Skeleton className="size-4 rounded-full" />
            <Skeleton className="h-3.5 w-20" />
          </div>
          <div className="flex flex-col gap-2 px-2 pb-2">
            {Array.from({ length: c % 2 === 0 ? 3 : 2 }, (_, i) => (
              <Skeleton key={i} className="h-[88px] rounded-[10px] shadow-e1" />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
