"use client"

import * as React from "react"
import { PageContainer } from "@/components/ui/pageContainer"
import { ListRow } from "@/components/ui/listRow"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils/helpers/cn"

/**
 * The frame every tab of the channel list draws in (Active, Archived,
 * Discover), as Activity's tabs share theirs (activityFeedFrame).
 *
 * The three tabs loaded three ways: Active and Archived drew nothing at all on
 * their first load, and Discover drew the generic ListSkeleton, 40px round
 * avatars on a 56px pitch at p-4 and not held to the list's 880px column. When
 * its rows landed the first row moved up 8px, the marks shrank and turned
 * square and the left edge moved 12px. Their empty and failed states sat in a
 * p-4 box of their own. Here the loading rows are the loaded rows' shape (the
 * same ListRow, a 32px tile) in the same column, and a tab's empty or failed
 * state sits in one place under the search.
 */

/** A first screen of rows: enough to fill a laptop's list without scrolling. */
export const CHANNEL_SKELETON_ROWS = 8

export function ChannelListSkeleton({ label = "Loading channels" }: { label?: string }) {
    return (
        <PageContainer data-channel-skeleton="" role="status" aria-label={label} className="overflow-hidden py-2">
            {Array.from({ length: CHANNEL_SKELETON_ROWS }).map((_, i) => (
                <ListRow
                    key={i}
                    aria-hidden="true"
                    density="default"
                    disablePressFlash
                    className="pointer-events-none"
                    leading={<Skeleton className="size-8 rounded-md" />}
                    // Inline in the row's own lines, so each takes the line's
                    // height and the row is the loaded row's 53px, not 48.
                    title={<Skeleton className={cn("inline-block h-3.5 align-middle", i % 2 === 0 ? "w-2/5" : "w-1/3")} />}
                    subtitle={<Skeleton className={cn("inline-block h-3 align-middle", i % 3 === 0 ? "w-4/5" : "w-3/5")} />}
                />
            ))}
        </PageContainer>
    )
}

/**
 * Where a tab says it is empty or could not load: in the list's column, under
 * the search, anchored to the top so the same spot sits at the same height on
 * every tab.
 */
export function ChannelListState({ children }: { children: React.ReactNode }) {
    return (
        <PageContainer data-channel-state="" className="flex justify-center py-2 pt-4 md:pt-10">
            {children}
        </PageContainer>
    )
}

/**
 * The rows to show while a search is on its way: the ones already on screen,
 * dimmed, as /app/search keeps its results. Active and Archived emptied their
 * list the moment a search began and stayed blank until the server answered,
 * while Discover filtered in place.
 */
export function useRowsWhileSearching<T>(rows: T[], pending: boolean): { rows: T[]; stale: boolean } {
    const [kept, setKept] = React.useState(rows)
    if (!pending && kept !== rows) setKept(rows)
    return pending ? { rows: kept, stale: true } : { rows, stale: false }
}
