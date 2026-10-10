"use client"

import * as React from "react"
import { PageContainer } from "@/components/ui/pageContainer"
import { ListRow } from "@/components/ui/listRow"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils/helpers/cn"

/**
 * The one frame every Activity tab draws in.
 *
 * WHY ONE FRAME. Priority, All, Mentions and AI were three implementations, and
 * each built its own frame, so switching tabs moved everything:
 *   - the AI tab was the settings page's card dropped in whole: a bordered box
 *     the width of the panel, a second title under the tab's own, its own rows,
 *     its own skeleton and a plain sentence for an empty record;
 *   - Mentions had no toolbar row, so its first row sat 36px higher than All's;
 *   - the empty and error states centred their column (mx-auto) while the list's
 *     column started at the panel's edge, so a tab with nothing in it shifted
 *     157px to the right at 1440;
 *   - the loading skeleton had 8 rows on one tab and 6 on another, 40px rows
 *     where the list's are 64, and none of the list's toolbar, so rows jumped
 *     28px down when the data landed.
 * Here the column, the toolbar row, the skeleton and the place an empty or
 * failed tab says so are drawn once. A tab hands over what differs: its filter,
 * its actions, its rows and its words.
 */

/** One skeleton for every tab, at one length: a typical first screen. */
export const FEED_SKELETON_ROWS = 8

/**
 * The loading state, in the rows' own shape: the same ListRow, density and
 * avatar as a loaded row, so nothing moves when the data lands.
 */
export function ActivityFeedSkeleton({ label = "Loading activity" }: { label?: string }) {
    return (
        <div data-feed-skeleton="" role="status" aria-label={label}>
            {Array.from({ length: FEED_SKELETON_ROWS }).map((_, i) => (
                <ListRow
                    key={i}
                    data-feed-skeleton-row=""
                    aria-hidden="true"
                    density="comfortable"
                    disablePressFlash
                    className="pointer-events-none"
                    leading={<Skeleton variant="circle" className="size-9" />}
                    title={<Skeleton className={cn("h-3.5", i % 2 === 0 ? "w-3/5" : "w-2/5")} />}
                    subtitle={<Skeleton className={cn("h-3", i % 3 === 0 ? "w-4/5" : "w-2/3")} />}
                />
            ))}
        </div>
    )
}

interface ActivityFeedFrameProps {
    /** The toolbar row's left side: the "who" filter, on the tabs that have one. */
    filter?: React.ReactNode
    /** The toolbar row's right side: a tab's own actions. */
    actions?: React.ReactNode
    /** What a tab has to say above its rows after the reader acted (a drill's result, a failed download). */
    notice?: React.ReactNode
    /** The first page is on its way. */
    loading: boolean
    /** In place of the rows: the tab's ErrorState or EmptyState, drawn where every tab draws it. */
    state?: React.ReactNode
    /** Label for the loading state. */
    loadingLabel?: string
    /** The rows. */
    children?: React.ReactNode
}

export function ActivityFeedFrame({ filter, actions, notice, loading, state, loadingLabel, children }: ActivityFeedFrameProps) {
    return (
        <PageContainer data-feed-frame="" className="flex min-h-0 flex-1 flex-col py-2">
            {/* Always there, always 36px: 28px of controls and 8px under them, so a
                tab without a filter does not start its rows higher. */}
            <div data-feed-toolbar="" className="flex h-9 shrink-0 items-center justify-between gap-2 px-1 pb-2">
                <div className="flex min-w-0 flex-1 items-center">{filter}</div>
                {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
            </div>
            {notice ? (
                <div data-feed-notice="" className="max-h-[45%] shrink-0 overflow-y-auto px-1 pb-2">
                    {notice}
                </div>
            ) : null}
            <div data-feed-body="" className="relative min-h-0 flex-1">
                {loading ? (
                    <ActivityFeedSkeleton label={loadingLabel} />
                ) : state ? (
                    // Anchored to the top of the rows' space rather than centred in
                    // it: centred, a state with a button sat higher than one
                    // without, so the same spot landed at a different height on
                    // every tab.
                    <div data-feed-state="" className="flex justify-center pt-4 md:pt-10">
                        {state}
                    </div>
                ) : (
                    children
                )}
            </div>
        </PageContainer>
    )
}
