"use client"

import React, { useState, useEffect, useCallback } from "react";
import { DateRangeField } from "@/components/dateRangePicker/dateRangeField";
import { DateRange } from "react-day-picker";
import { subDays } from "date-fns";
import { useFetch } from "@/hooks/useFetch";
import { GetEndpointUrl } from "@/services/endPoints";
import { RecordingInfoInterface, RecordingPaginationResRaw } from "@/types/recording";
import { useMedia } from "@/context/MediaQueryContext";
import { Loader2, Video } from "@/lib/icons";
import { statusColors } from "@/lib/colors";
import { StatePlaceholder } from "@/components/ui/StatePlaceholder";
import { VirtualInfiniteScroll } from "@/components/list/virtualInfiniteScroll";
import { Separator } from "@/components/ui/separator";
import { RecordingListRecording } from "@/components/recording/recordingListRecording";
import { openUI } from "@/store/slice/uiSlice";
import { useDispatch } from "react-redux";
import { ConditionalWrap } from "@/components/conditionalWrap/conditionalWrap";
import TouchableDiv from "@/components/animation/touchRippleAnimation";
import { UserProfileInterface } from "@/types/user";

const RecordingsPage = () => {
    const [selectedDateRange, setSelectedDateRange] = useState<DateRange | undefined>({
        from: subDays(new Date(), 30),
        to: new Date(),
    });
    const [pageIndex, setPageIndex] = useState(0);
    const [allRecordings, setAllRecordings] = useState<RecordingInfoInterface[]>([]);
    const [hasMore, setHasMore] = useState(true);
    const pageSize = 20;
    const { isMobile, isDesktop } = useMedia();
    const dispatch = useDispatch();

    const { data: selfProfile } = useFetch<UserProfileInterface>(GetEndpointUrl.SelfProfile);

    const startDate = selectedDateRange?.from?.toISOString() || "";
    const endDate = selectedDateRange?.to?.toISOString() || "";

    const endpoint = startDate && endDate 
        ? `${GetEndpointUrl.UserRecordingList}?startDate=${startDate}&endDate=${endDate}&pageIndex=${pageIndex}&pageSize=${pageSize}`
        : "";

    const { data: pageData, isLoading } = useFetch<RecordingPaginationResRaw>(endpoint);

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

    const renderItem = (recording: RecordingInfoInterface, i: number) => (
        <ConditionalWrap key={recording.recording_egress_id} condition={isMobile} wrap={
            (c) => (
                <TouchableDiv rippleBrightness={0.8} rippleDuration={800} onClick={() => handleClick(recording)}>
                    {c}
                </TouchableDiv>
            )
        }>
            {i !== 0 && <Separator orientation="horizontal" className="w-[calc(100%-3rem)" />}
            <div onClick={isMobile ? undefined : () => handleClick(recording)}>
                <RecordingListRecording recordingInfo={recording} currentUserId={selfProfile?.data.user_uuid} />
            </div>
            {i == (allRecordings.length-1) && <Separator orientation="horizontal" className="w-[calc(100%-3rem)" />}

        </ConditionalWrap>
    );

    return (
        <div className="flex h-full flex-col bg-background/30">
            {isDesktop && (
                <div className="sticky top-0 z-10 flex items-center justify-between border-b bg-background px-3 p-2 backdrop-blur-md">
                    <div className="flex items-center gap-3">
                        <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${statusColors.online.solid} text-white shadow-sm`}>
                            <Video size={18} />
                        </div>
                        <div>
                            <h1 className="text-base md:text-lg font-semibold tracking-tight text-foreground">Recordings</h1>
                            <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-widest opacity-80">
                                Global Meeting History
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-4">
                         <DateRangeField
                            dateRange={selectedDateRange}
                            setDateRange={setSelectedDateRange}
                        />
                        {isLoading && (
                            <div className="flex items-center gap-2 animate-in fade-in slide-in-from-right-2">
                                <Loader2 className="h-4 w-4 animate-spin text-primary/60" />
                            </div>
                        )}
                    </div>
                </div>
            )}

            {isMobile && (


                    <DateRangeField
                        dateRange={selectedDateRange}
                        setDateRange={setSelectedDateRange}
                    />
            )}

            <div className="flex-1 overflow-auto">
                {allRecordings.length > 0 ? (
                    <div className="w-full h-full flex justify-center">
                        <div className="w-full md:w-[45vw] flex flex-col">
                            <VirtualInfiniteScroll
                                items={allRecordings}
                                renderItem={renderItem}
                                onLoadMore={onLoadMore}
                                hasMore={hasMore}
                                isLoading={isLoading}
                                className="no-scrollbar"
                                keyExtractor={(item: RecordingInfoInterface) => item.recording_egress_id}
                            />
                        </div>
                    </div>
                ) : !isLoading ? (
                    <div className="flex h-full items-center justify-center p-8">
                        <StatePlaceholder
                            type="empty"
                            title="No recordings found"
                            description="We couldn't find any recordings for the selected date range."
                        />
                    </div>
                ) : (
                    <div className="flex h-full items-center justify-center">
                        <div className="flex flex-col items-center gap-4 text-muted-foreground">
                            <div className="relative">
                                <div className="h-14 w-14 rounded-2xl bg-muted animate-pulse" />
                                <Loader2 className="absolute inset-0 m-auto h-6 w-6 animate-spin text-primary/40" />
                            </div>
                            <span className="text-sm font-medium tracking-wide">Gathering your recordings...</span>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default RecordingsPage;
