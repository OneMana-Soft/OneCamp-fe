"use client"

import { useCallback, useEffect, useState } from "react"
import { useDispatch } from "react-redux"
import { DateRange } from "react-day-picker"
import { format, subDays } from "date-fns"
import { cn } from "@/lib/utils/helpers/cn"
import { useFetch } from "@/hooks/useFetch"
import { useMedia } from "@/context/MediaQueryContext"
import { openUI } from "@/store/slice/uiSlice"
import { DateRangeField } from "@/components/dateRangePicker/dateRangeField"
import { HubEmpty, HubError } from "@/components/activity/hubEmpty"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { PageHeader } from "@/components/ui/pageHeader"
import { PageContainer } from "@/components/ui/pageContainer"
import { VirtualInfiniteScroll } from "@/components/list/virtualInfiniteScroll"
import { RecordingListRecording } from "@/components/recording/recordingListRecording"
import type { RecordingInfoInterface, RecordingPaginationResRaw } from "@/types/recording"

const PAGE_SIZE = 20

export interface RecordingsViewProps {
    /** The list's address without its query: the workspace's, a channel's, a DM's or a group's. */
    listUrl: string
    /** Where the answer keeps its page (a channel's sits under channel_info). */
    pick?: (res: RecordingPaginationResRaw) => { recordings: RecordingInfoInterface[]; has_more: boolean } | undefined
    /** The player's media and transcript addresses for one recording. */
    playerUrls: (rec: RecordingInfoInterface) => { media: string; transcript: string }
    /** The line under the title: what these recordings are. */
    subtitle: string
    /** Removes one on the server; offered only when given. */
    onDelete?: (egressId: string) => Promise<void>
    currentUserId?: string
}

const fromData = (res: RecordingPaginationResRaw) => res.data

/** A recording's day group (A7): Today, Yesterday, Earlier this week, Older. Pure. */
export function recordingDayGroup(at: string, now = new Date()): string {
    const d = new Date(at)
    if (Number.isNaN(d.getTime())) return "Older"
    const day = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime()
    const diff = Math.round((day(now) - day(d)) / 86_400_000)
    if (diff <= 0) return "Today"
    if (diff === 1) return "Yesterday"
    if (diff < 7) return "Earlier this week"
    return "Older"
}

/** The recordings' empty spot: a play tile on a berry disc, a red "rec" dot and a spark. */
function SpotRecording() {
    return (
        <svg width="96" height="96" viewBox="0 0 96 96" aria-hidden="true" className="hue-berry" data-spot-recording="">
            <circle cx="48" cy="50" r="32" className="fill-hue-tint" />
            <rect x="26" y="32" width="44" height="34" rx="8" className="fill-raised" style={{ filter: "drop-shadow(0 2px 3px rgb(16 18 26 / 0.12))" }} />
            <path d="M44 41.5v15l12-7.5z" className="fill-hue" />
            <circle cx="66" cy="34" r="3" className="fill-destructive" />
            <path d="M80 14Q81 19 86 20Q81 21 80 26Q79 21 74 20Q79 19 80 14Z" className="fill-brand" />
        </svg>
    )
}

/**
 * The one recordings UI: /app/recordings and a channel's, a DM's and a group's
 * recordings tab. A title with its date range (the range alone on a phone,
 * whose top bar names the page), recordings as rows of the app's lists on the
 * start-aligned 880px column Activity and Later use, a skeleton in the rows'
 * frame, and the empty and failed states anchored near the top where those
 * pages put theirs.
 *
 * The four were near copies, and the tabs still had the old page's solid
 * green tile, a centred 45vw list, a generic skeleton and an empty state in
 * the middle of the screen.
 */
export function RecordingsView({ listUrl, pick = fromData, playerUrls, subtitle, onDelete, currentUserId }: RecordingsViewProps) {
    const [range, setRange] = useState<DateRange | undefined>({ from: subDays(new Date(), 30), to: new Date() })
    const [pageIndex, setPageIndex] = useState(0)
    const [all, setAll] = useState<RecordingInfoInterface[]>([])
    const [hasMore, setHasMore] = useState(true)
    const { isDesktop } = useMedia()
    const dispatch = useDispatch()

    const start = range?.from?.toISOString() || ""
    const end = range?.to?.toISOString() || ""
    const endpoint = start && end ? `${listUrl}?startDate=${start}&endDate=${end}&pageIndex=${pageIndex}&pageSize=${PAGE_SIZE}` : ""
    const { data: pageData, isLoading, isError, mutate } = useFetch<RecordingPaginationResRaw>(endpoint)

    useEffect(() => {
        const page = pageData ? pick(pageData) : undefined
        if (!page?.recordings) return
        setAll((prev) => {
            const combined = pageIndex === 0 ? page.recordings : [...prev, ...page.recordings]
            return Array.from(new Map(combined.map((r) => [r.recording_egress_id, r])).values())
        })
        setHasMore(page.has_more)
    }, [pageData, pageIndex, pick])

    useEffect(() => {
        setPageIndex(0)
        setAll([])
    }, [range])

    const onLoadMore = useCallback(() => {
        if (!isLoading && hasMore) setPageIndex((p) => p + 1)
    }, [isLoading, hasMore])

    const open = (rec: RecordingInfoInterface) => {
        const { media, transcript } = playerUrls(rec)
        const date = new Date(rec.recording_stared_at)
        dispatch(
            openUI({
                key: "recordingPlayer",
                data: {
                    egressId: rec.recording_egress_id,
                    mediaGetUrl: media,
                    transcriptGetUrl: transcript,
                    fileSize: rec.recording_size,
                    fileName: `Recording ${Number.isNaN(date.getTime()) ? "" : format(date, "yyyy-MM-dd HH.mm")}`.trim() + ".mp4",
                    recordedAt: rec.recording_stared_at,
                },
            }),
        )
    }

    const remove = onDelete
        ? async (egressId: string) => {
              try {
                  await onDelete(egressId)
                  setAll((prev) => prev.filter((r) => r.recording_egress_id !== egressId))
              } catch {
                  // The request layer says why.
              }
          }
        : undefined

    const rangeField = <DateRangeField dateRange={range} setDateRange={setRange} />
    const firstLoad = all.length === 0 && isLoading && !isError

    return (
        <div data-recordings-view="" className="flex h-full min-h-0 flex-col bg-background">
            {/* The header spans the sheet, so the range sits on its right edge
                as the Inbox's controls do; in the lists' 880px column it
                floated two thirds of the way across (QA F-30). */}
            <PageContainer bounded={false} className="h-auto shrink-0 px-4 pb-3 pt-4 md:px-6 md:pb-4 md:pt-6">
                {isDesktop ? (
                    <PageHeader title="Recordings" actions={rangeField}>
                        <p className="text-sm text-muted-foreground">{subtitle}</p>
                    </PageHeader>
                ) : (
                    rangeField
                )}
            </PageContainer>

            <PageContainer className="flex min-h-0 flex-1 flex-col">
                {all.length > 0 ? (
                    <VirtualInfiniteScroll
                        items={all}
                        renderItem={(rec: RecordingInfoInterface, i: number) => {
                            // Grouped by day, a header where the day changes.
                            const group = recordingDayGroup(rec.recording_stared_at)
                            const head = i === 0 || recordingDayGroup(all[i - 1].recording_stared_at) !== group
                            return (
                                <div>
                                    {head ? (
                                        <div data-day-group="" className="flex h-7 items-center pl-16 text-meta font-medium text-ink-3">
                                            {group}
                                        </div>
                                    ) : null}
                                    <RecordingListRecording recordingInfo={rec} currentUserId={currentUserId} onOpen={() => open(rec)} onDelete={remove} />
                                </div>
                            )
                        }}
                        onLoadMore={onLoadMore}
                        hasMore={hasMore}
                        isLoading={isLoading}
                        className="no-scrollbar min-h-0 flex-1"
                        keyExtractor={(r: RecordingInfoInterface) => r.recording_egress_id}
                    />
                ) : firstLoad ? (
                    <RecordingRowsSkeleton />
                ) : (
                    <div data-recordings-state="" className="flex justify-start pt-4 md:pt-12">
                        {isError ? (
                            // Ahead of the empty answer: "no recordings in this
                            // range" would send someone changing dates to fix a
                            // request that failed.
                            <HubError text="The recordings aren't loading. Nothing has been lost." onRetry={() => void mutate()} />
                        ) : (
                            // Start-aligned where the rows begin, as every hub
                            // empty is (A9); it was centred in its own box.
                            <HubEmpty
                                illustration={<SpotRecording />}
                                title="No recordings in this range"
                                description={`${subtitle} Pick earlier dates to look further back.`}
                                action={
                                    <Button variant="ghost" size="sm" onClick={() => setRange({ from: subDays(new Date(), 90), to: new Date() })}>
                                        Show the last 90 days
                                    </Button>
                                }
                            />
                        )}
                    </div>
                )}
            </PageContainer>
        </div>
    )
}

/** Loading, in the rows' own frame: a 40 x 28 thumbnail, a title line and a line of details. */
export function RecordingRowsSkeleton() {
    return (
        <div role="status" aria-label="Loading the recordings">
            {[0, 1, 2, 3, 4].map((i) => (
                <div key={i} data-recording-skeleton-row="" aria-hidden="true" className="hub-row" data-density="two-line" data-lead="40">
                    <span />
                    <span className="hub-row-lead">
                        <Skeleton className="h-7 w-10 rounded-[6px]" />
                    </span>
                    <span className="min-w-0">
                        <Skeleton className={cn("h-4", i % 2 === 0 ? "w-1/3" : "w-1/4")} />
                        <Skeleton className={cn("mt-1.5 h-3", i % 2 === 0 ? "w-1/2" : "w-2/5")} />
                    </span>
                    <Skeleton className="h-3 w-10" />
                </div>
            ))}
        </div>
    )
}
