import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils/helpers/cn"

/**
 * What a lazily loaded tab shows while its chunk arrives: its own shape at
 * its own height (a list's rows, a board's columns, a timeline's bars), so
 * nothing below moves when the view lands.
 */
export function TabLoading({ kind, className }: { kind: "list" | "board" | "timeline"; className?: string }) {
  if (kind === "board") {
    return (
      <div aria-busy="true" aria-label="Loading" className={cn("flex h-full min-h-[420px] gap-3 px-5 pt-3", className)}>
        {[0, 1, 2, 3].map((c) => (
          <div key={c} className="flex w-[280px] shrink-0 flex-col gap-2 rounded-lg bg-sunken p-2">
            <Skeleton className="h-4 w-24" />
            {[0, 1, 2].slice(0, 3 - (c % 2)).map((r) => (
              <Skeleton key={r} className="h-20 w-full rounded-lg" />
            ))}
          </div>
        ))}
      </div>
    )
  }
  return (
    <div aria-busy="true" aria-label="Loading" className={cn("flex h-full min-h-[420px] flex-col gap-3 px-5 pt-4", className)}>
      {[0, 1, 2, 3, 4, 5].map((r) => (
        <Skeleton key={r} className={cn("h-6", kind === "timeline" ? ["ml-[30%] w-1/4", "ml-[38%] w-1/3", "ml-[45%] w-1/5", "ml-[25%] w-2/5", "ml-[52%] w-1/6", "ml-[35%] w-1/4"][r] : ["w-3/5", "w-2/5", "w-1/2", "w-2/3", "w-1/3", "w-1/2"][r])} />
      ))}
    </div>
  )
}
