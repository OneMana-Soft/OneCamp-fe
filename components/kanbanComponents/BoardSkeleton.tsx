import { Skeleton } from "@/components/ui/skeleton"

/**
 * A board while its tasks load, in the board's own shape: its columns (the
 * same width, gap and tint as a loaded one, Container.tsx), each with a
 * header and cards the height of a card. The board used to draw its columns
 * empty while the fetch ran, the same as a board with no tasks.
 */
export function BoardSkeleton({ columns = 4 }: { columns?: number }) {
  return (
    <div role="status" aria-label="Loading the board" data-board-skeleton="" className="-mx-2 flex h-full overflow-hidden pb-4">
      {Array.from({ length: columns }, (_, c) => (
        <div key={c} aria-hidden="true" className="mx-2 flex w-[min(320px,calc(100vw-5rem))] shrink-0 flex-col rounded-lg bg-muted/50">
          <div className="flex items-center justify-between px-3 pb-1.5 pt-2.5">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-3 w-4" />
          </div>
          <div className="flex flex-col gap-2 p-3">
            {Array.from({ length: c % 2 === 0 ? 3 : 2 }, (_, i) => (
              <Skeleton key={i} className="h-24 rounded-lg" />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
