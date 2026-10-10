"use client"

import { useCallback, useEffect, useState } from "react"
import { useDispatch } from "react-redux"
import { DateRange } from "react-day-picker"
import { subDays } from "date-fns"
import { cn } from "@/lib/utils/helpers/cn"
import { useFetch } from "@/hooks/useFetch"
import { useMedia } from "@/context/MediaQueryContext"
import { openUI } from "@/store/slice/uiSlice"
import { DateRangeField } from "@/components/dateRangePicker/dateRangeField"
import { ErrorState } from "@/components/ui/error-state"
import { EmptyState } from "@/components/ui/empty-state"
import { SpotCalendar } from "@/components/ui/graphics"
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
                    fileName: `Recording-${date.toLocaleDateString()}-${date.toLocaleTimeString()}.mp4`,
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
            <PageContainer className="h-auto shrink-0 px-4 pb-3 pt-4 md:px-6 md:pb-4 md:pt-6">
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
                        renderItem={(rec: RecordingInfoInterface, i: number) => (
                            <div className={cn(i > 0 && "border-t border-border/60")}>
                                <RecordingListRecording recordingInfo={rec} currentUserId={currentUserId} onOpen={() => open(rec)} onDelete={remove} />
                            </div>
                        )}
                        onLoadMore={onLoadMore}
                        hasMore={hasMore}
                        isLoading={isLoading}
                        className="no-scrollbar min-h-0 flex-1"
                        keyExtractor={(r: RecordingInfoInterface) => r.recording_egress_id}
                    />
                ) : firstLoad ? (
                    <RecordingRowsSkeleton />
                ) : (
                    <div data-recordings-state="" className="flex justify-center pt-4 md:pt-10">
                        {isError ? (
                            // Ahead of the empty answer: "no recordings in this
                            // range" would send someone changing dates to fix a
                            // request that failed.
                            <ErrorState subject="the recordings" onRetry={() => void mutate()} />
                        ) : (
                            <EmptyState
                                illustration={<SpotCalendar />}
                                title="No recordings in this range"
                                description={`${subtitle} Pick earlier dates to look further back.`}
                                className="py-6"
                            />
                        )}
                    </div>
                )}
            </PageContainer>
        </div>
    )
}

/** Loading, in the rows' own frame: a 24px mark, a 20px title line and an 18px line of details. */
export function RecordingRowsSkeleton() {
    return (
        <div role="status" aria-label="Loading the recordings">
            {[0, 1, 2, 3, 4].map((i) => (
                <div key={i} data-recording-skeleton-row="" aria-hidden="true" className={cn("flex items-start gap-3 px-2 py-3", i > 0 && "border-t border-border/60")}>
                    <Skeleton className="-mt-0.5 size-6 shrink-0 rounded-md" />
                    <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-3">
                            <Skeleton className={cn("h-5", i % 2 === 0 ? "w-1/3" : "w-1/4")} />
                            <Skeleton className="ml-auto h-4 w-24" />
                        </span>
                        <Skeleton className={cn("mt-0.5 h-[18px]", i % 2 === 0 ? "w-1/2" : "w-2/5")} />
                    </span>
                </div>
            ))}
        </div>
    )
}
