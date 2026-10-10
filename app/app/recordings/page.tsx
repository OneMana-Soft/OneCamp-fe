"use client"

import { cn } from "@/lib/utils/helpers/cn"
import { useState, useEffect, useCallback } from "react";
import { DateRangeField } from "@/components/dateRangePicker/dateRangeField";
import { DateRange } from "react-day-picker";
import { subDays } from "date-fns";
import { useFetch } from "@/hooks/useFetch";
import { GetEndpointUrl } from "@/services/endPoints";
import { RecordingInfoInterface, RecordingPaginationResRaw } from "@/types/recording";
import { useMedia } from "@/context/MediaQueryContext";
import { ErrorState } from "@/components/ui/error-state"
import { EmptyState } from "@/components/ui/empty-state"
import { SpotCalendar } from "@/components/ui/graphics"
import { Skeleton } from "@/components/ui/skeleton"
import { PageHeader } from "@/components/ui/pageHeader"
import { PageContainer } from "@/components/ui/pageContainer"
import { VirtualInfiniteScroll } from "@/components/list/virtualInfiniteScroll";
import { RecordingListRecording } from "@/components/recording/recordingListRecording";
import { openUI } from "@/store/slice/uiSlice";
import { useDispatch } from "react-redux";
import { UserProfileInterface } from "@/types/user";

/**
 * Every call recorded where you were, in a date range.
 *
 * Reworked in the final visual check (10 Oct): it was the one page left from
 * before the redesign, with a solid green tile, an uppercase "GLOBAL MEETING
 * HISTORY" eyebrow, a 48px box of US-ordered dates, rows drawn as cards, a
 * spinner over "Gathering your recordings…" and a grey inbox icon when empty.
 * It is now the app's page: a title with the range beside it, rows in the
 * lists' shape on the start-aligned 880px column Activity and Later use, a
 * skeleton in the rows' frame, and its empty and failed states where those
 * pages put theirs.
 */
const RecordingsPage = () => {
    const [selectedDateRange, setSelectedDateRange] = useState<DateRange | undefined>({
        from: subDays(new Date(), 30),
        to: new Date(),
    });
    const [pageIndex, setPageIndex] = useState(0);
    const [allRecordings, setAllRecordings] = useState<RecordingInfoInterface[]>([]);
    const [hasMore, setHasMore] = useState(true);
    const pageSize = 20;
    const { isDesktop } = useMedia();
    const dispatch = useDispatch();

    const { data: selfProfile } = useFetch<UserProfileInterface>(GetEndpointUrl.SelfProfile);

    const startDate = selectedDateRange?.from?.toISOString() || "";
    const endDate = selectedDateRange?.to?.toISOString() || "";

    const endpoint = startDate && endDate
        ? `${GetEndpointUrl.UserRecordingList}?startDate=${startDate}&endDate=${endDate}&pageIndex=${pageIndex}&pageSize=${pageSize}`
        : "";

    const { data: pageData, isLoading, isError, mutate } = useFetch<RecordingPaginationResRaw>(endpoint);

    useEffect(() => {
        if (pageData?.data.recordings) {
            setAllRecordings((prev) => {
                const combined = pageIndex === 0 ? pageData.data.recordings : [...prev, ...pageData.data.recordings];
                const unique = Array.from(new Map(combined.map(item => [item.recording_egress_id, item])).values());
                return unique;
            });
            setHasMore(pageData.data.has_more);
        }
    }, [pageData, pageIndex]);

    useEffect(() => {
        setPageIndex(0);
        setAllRecordings([]);
    }, [selectedDateRange]);

    const onLoadMore = useCallback(() => {
        if (!isLoading && hasMore) {
            setPageIndex((prev) => prev + 1);
        }
    }, [isLoading, hasMore]);

    const handleClick = (recording: RecordingInfoInterface) => {
        let getMediaURL = "";
        let getTranscriptURL = "";

        if (recording.recording_channel?.ch_uuid) {
            getMediaURL = GetEndpointUrl.GetChannelRecordingMedia + '/' + recording.recording_channel.ch_uuid;
            getTranscriptURL = GetEndpointUrl.GetChannelRecordingTranscript + '/' + recording.recording_channel.ch_uuid;
        } else if (recording.recording_dm?.dm_participants.length <= 2) {
             const otherUser = recording.recording_dm.dm_participants.find(p => p.user_uuid !== selfProfile?.data.user_uuid);
             const peerUuid = otherUser?.user_uuid || selfProfile?.data.user_uuid; // Fallback

             getMediaURL = GetEndpointUrl.GetChatRecordingMedia + '/' + peerUuid;
             getTranscriptURL = GetEndpointUrl.GetChatRecordingTranscript + '/' + peerUuid;
        } else if (recording.recording_dm?.dm_participants.length > 2) {
            getMediaURL = GetEndpointUrl.GetGrpChatRecordingMedia + '/' + recording.recording_dm.dm_grouping_id;
            getTranscriptURL = GetEndpointUrl.GetGrpChatRecordingTranscript + '/' + recording.recording_dm.dm_grouping_id;
        }

        const date = new Date(recording.recording_stared_at);
        const fileName = `Recording-${date.toLocaleDateString()}-${date.toLocaleTimeString()}.mp4`;

        dispatch(openUI({
            key: 'recordingPlayer',
            data: {
                egressId: recording.recording_egress_id,
                mediaGetUrl: getMediaURL,
                transcriptGetUrl: getTranscriptURL,
                fileSize: recording.recording_size,
                fileName: fileName,
                recordedAt: recording.recording_stared_at
            }
        }));
    };

    // Hairlines between rows, as in Later and search.
    const renderItem = (recording: RecordingInfoInterface, i: number) => (
        <div className={cn(i > 0 && "border-t border-border/60")}>
            <RecordingListRecording
                recordingInfo={recording}
                currentUserId={selfProfile?.data.user_uuid}
                onOpen={() => handleClick(recording)}
            />
        </div>
    );

    const range = (
        <DateRangeField
            dateRange={selectedDateRange}
            setDateRange={setSelectedDateRange}
        />
    );

    // The first page is on its way: nothing to show yet, nothing failed.
    const firstLoad = allRecordings.length === 0 && isLoading && !isError;

    return (
        <div className="flex h-full min-h-0 flex-col bg-background">
            {/* On a phone the top bar names the page; the range is its control. */}
            <PageContainer className="h-auto shrink-0 px-4 pb-3 pt-4 md:px-6 md:pb-4 md:pt-6">
                {isDesktop ? (
                    <PageHeader title="Recordings" actions={range}>
                        <p className="text-sm text-muted-foreground">Calls recorded in your channels and conversations.</p>
                    </PageHeader>
                ) : (
                    range
                )}
            </PageContainer>

            <PageContainer className="flex min-h-0 flex-1 flex-col">
                {allRecordings.length > 0 ? (
                    <VirtualInfiniteScroll
                        items={allRecordings}
                        renderItem={renderItem}
                        onLoadMore={onLoadMore}
                        hasMore={hasMore}
                        isLoading={isLoading}
                        className="no-scrollbar min-h-0 flex-1"
                        keyExtractor={(item: RecordingInfoInterface) => item.recording_egress_id}
                    />
                ) : firstLoad ? (
                    <RecordingRowsSkeleton />
                ) : (
                    // Anchored near the top of the list's space, where Activity
                    // and Later put theirs, not in the middle of the screen.
                    <div data-recordings-state="" className="flex justify-center pt-4 md:pt-10">
                        {isError ? (
                            // Ahead of the empty answer: "no recordings in this
                            // range" would send someone changing dates to fix a
                            // request that failed.
                            <ErrorState subject="your recordings" onRetry={() => void mutate()} />
                        ) : (
                            <EmptyState
                                illustration={<SpotCalendar />}
                                title="No recordings in this range"
                                description="Calls recorded in your channels and conversations show up here. Pick earlier dates to look further back."
                                className="py-6"
                            />
                        )}
                    </div>
                )}
            </PageContainer>
        </div>
    );
};

/** Loading, in the rows' own frame: a 24px mark, a title line and a line of details. */
function RecordingRowsSkeleton() {
    return (
        <div role="status" aria-label="Loading your recordings">
            {[0, 1, 2, 3, 4].map((i) => (
                <div key={i} data-recording-skeleton-row="" aria-hidden="true" className={cn("flex items-start gap-3 px-2 py-3", i > 0 && "border-t border-border/60")}>
                    <Skeleton className="-mt-0.5 size-6 shrink-0 rounded-md" />
                    <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-3">
                            <Skeleton className={cn("h-5", i % 2 === 0 ? "w-1/3" : "w-1/4")} />
                            <Skeleton className="ml-auto h-4 w-24" />
                        </span>
                        {/* text-xs sets an 18px line */}
                        <Skeleton className={cn("mt-0.5 h-[18px]", i % 2 === 0 ? "w-1/2" : "w-2/5")} />
                    </span>
                </div>
            ))}
        </div>
    );
}

export default RecordingsPage;
