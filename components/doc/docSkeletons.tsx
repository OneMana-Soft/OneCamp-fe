"use client"

// The docs home's skeletons (docs programme B5): the list's own cards or rows
// while the first page loads, and the whole page while its code arrives. Kept
// apart from the list (docListResult) so the page can draw its shape before
// that code is here: a doc's "Docs" crumb prefetches the docs home, and only
// this much of it.

import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils/helpers/cn"

/** The docs grid (D01): cards of at least 232 px, 16 px apart, 24 px between rows; one column of rows on a phone. */
export const GRID = "grid w-full grid-cols-1 gap-x-4 gap-y-1 sm:grid-cols-[repeat(auto-fill,minmax(232px,1fr))] sm:gap-y-6"
/** The list (B5): 36 px rows in the same 1,040 px column. */
export const COLUMN = "mx-auto max-w-[1040px] px-4 sm:px-8"

/** The list's own cards while the first page loads: the same grid, the same card shape. */
export function DocGridSkeleton({ withCreateCard }: { withCreateCard: boolean }) {
    return (
        <div role="status" aria-label="Loading docs" className="min-h-0 w-full flex-1" data-doc-skeleton="">
            <div className={cn(GRID, COLUMN, "pt-4 sm:pt-6")} aria-hidden="true">
                {Array.from({ length: withCreateCard ? 4 : 3 }).map((_, i) =>
                    withCreateCard && i === 0 ? (
                        <div key={i} className="rounded-xl bg-sunken ring-1 ring-inset ring-line-2 max-sm:h-14 sm:h-[264px]" />
                    ) : (
                        <div key={i} className="flex overflow-hidden max-sm:h-16 max-sm:items-center max-sm:gap-3 sm:h-[264px] sm:flex-col sm:rounded-xl sm:bg-raised sm:shadow-e1">
                            <div className="shrink-0 bg-sunken max-sm:h-[52px] max-sm:w-10 max-sm:rounded-md sm:h-44 sm:px-4 sm:pt-4">
                                <div className="h-full rounded-t-md bg-sheet p-4 max-sm:hidden">
                                    <Skeleton className="h-1.5 w-11/12" />
                                    <Skeleton className="mt-2 h-1.5 w-4/5" />
                                    <Skeleton className="mt-2 h-1.5 w-3/5" />
                                </div>
                            </div>
                            <div className="flex min-w-0 flex-1 flex-col gap-2 sm:justify-between sm:px-3.5 sm:py-3">
                                <Skeleton className="h-3.5 w-3/5" />
                                <div className="flex items-center gap-1.5">
                                    <Skeleton className="size-5 rounded-[10px] max-sm:hidden" />
                                    <Skeleton className="h-3 w-16" />
                                </div>
                            </div>
                        </div>
                    ),
                )}
            </div>
        </div>
    )
}

/** The list's own rows while the first page loads: 36 px rows (56 on a phone) in the column. */
export function DocRowsSkeleton({ rows = 8 }: { rows?: number }) {
    return (
        <div role="status" aria-label="Loading docs" className="min-h-0 w-full flex-1 pt-3 sm:pt-4" data-doc-skeleton="rows">
            <div className={COLUMN} aria-hidden="true">
                {Array.from({ length: rows }, (_, i) => (
                    <div key={i} className="flex h-14 items-center gap-2.5 px-2 sm:h-9">
                        <Skeleton className="size-4 rounded-[4px]" />
                        <Skeleton className="h-3 rounded-sm" style={{ width: `${[34, 48, 28, 40][i % 4]}%` }} />
                        <Skeleton className="ml-auto hidden h-3 w-24 sm:block" />
                    </div>
                ))}
            </div>
        </div>
    )
}

/** The docs home while its code arrives: the title row, the tabs and the cards, at their real sizes. */
export function DocsHomeSkeleton() {
    return (
        <div className="flex h-full min-h-0 flex-col" data-docs-page="" aria-busy="true">
            <div className="mx-auto w-full max-w-[1040px] shrink-0 px-4 sm:px-8 sm:pt-8" aria-hidden="true">
                <div className="flex min-h-14 items-center gap-3 max-sm:hidden">
                    <div className="min-w-0 flex-1">
                        <h1 className="text-title-1 text-ink">Docs</h1>
                        <p className="mt-0.5 text-ui text-ink-2">&nbsp;</p>
                    </div>
                    <Skeleton className="h-8 w-60 rounded-lg" />
                    <Skeleton className="h-7 w-28 rounded-lg" />
                </div>
                <div className="mt-4 flex h-10 items-center gap-4 border-b border-line max-sm:mt-0">
                    {[56, 40, 104, 76, 56, 64].map((w, i) => (
                        <Skeleton key={i} className="h-3 rounded-sm" style={{ width: w }} />
                    ))}
                </div>
            </div>
            <DocGridSkeleton withCreateCard />
        </div>
    )
}
