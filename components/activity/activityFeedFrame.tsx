"use client"

import * as React from "react"
import { HubRowSkeleton } from "@/components/ui/hubRow"

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

/** One skeleton for every tab, at one length (hub.md A1: six feed rows). */
export const FEED_SKELETON_ROWS = 6

/**
 * The loading state, in the rows' own shape: the feed HubRow's skeleton, so
 * nothing moves when the data lands.
 */
export function ActivityFeedSkeleton({ label = "Loading activity" }: { label?: string }) {
    return (
        <div data-feed-skeleton="" role="status" aria-label={label}>
            {Array.from({ length: FEED_SKELETON_ROWS }).map((_, i) => (
                <div key={i} data-feed-skeleton-row="" aria-hidden="true" className="pointer-events-none">
                    <HubRowSkeleton density="feed" />
                </div>
            ))}
        </div>
    )
}

interface ActivityFeedFrameProps {
    /** The toolbar row's left side: the "who" filter, on the tabs that have one. */
    filter?: React.ReactNode
    /** The toolbar row's right side: a tab's own actions. */
    actions?: React.ReactNode
    /** What a tab has to say above its rows after the reader acted (a drill's result, a banner). */
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

/**
 * The column (hub.md A1): 760px at most, start-aligned 24px from the sheet's
 * edge, so the time sits inside the column instead of floating at the far
 * right of a wide screen. The toolbar is 44px whether or not a tab has a
 * filter. A state (empty, caught up, failed) sits where the rows start, 48px
 * under the toolbar, start-aligned like the rows (A9).
 */
export function ActivityFeedFrame({ filter, actions, notice, loading, state, loadingLabel, children }: ActivityFeedFrameProps) {
    return (
        <div data-feed-frame="" className="flex h-full min-h-0 w-full max-w-[760px] flex-1 flex-col">
            <div data-feed-toolbar="" className="flex h-11 shrink-0 items-center justify-between gap-2 px-4 md:px-6">
                <div className="flex min-w-0 flex-1 items-center">{filter}</div>
                {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
            </div>
            {notice ? (
                <div data-feed-notice="" className="max-h-[45%] shrink-0 overflow-y-auto px-4 pb-2 md:px-6">
                    {notice}
                </div>
            ) : null}
            <div data-feed-body="" className="hub-fade-in relative min-h-0 flex-1 px-1 md:px-3">
                {loading ? (
                    <ActivityFeedSkeleton label={loadingLabel} />
                ) : state ? (
                    <div data-feed-state="" className="flex justify-start px-3 pt-6 md:pt-12">
                        {state}
                    </div>
                ) : (
                    children
                )}
            </div>
        </div>
    )
}
