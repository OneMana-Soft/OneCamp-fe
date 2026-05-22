import { DateRangeField } from "../dateRangePicker/dateRangeField";
import {useState, useEffect, useCallback} from "react";
import { DateRange } from "react-day-picker";
import { useMedia } from "@/context/MediaQueryContext";
import { Video, Loader2 } from "@/lib/icons";
import { statusColors } from "@/lib/colors";
import { subDays } from "date-fns";
import {RecordingListResult} from "@/components/recording/recordingListResult";
import {useFetch} from "@/hooks/useFetch";
import {UserListInterfaceResp} from "@/types/user";
import {GetEndpointUrl, PostEndpointUrl} from "@/services/endPoints";
import {ChannelInfoInterfaceResp} from "@/types/channel";
import {RecordingInfoInterface, RecordingPaginationResRaw} from "@/types/recording";
import {VirtualInfiniteScroll} from "@/components/list/virtualInfiniteScroll";
import {RecordingListRecording} from "@/components/recording/recordingListRecording";
import {useDispatch} from "react-redux";
import {openUI} from "@/store/slice/uiSlice";
import {ConditionalWrap} from "@/components/conditionalWrap/conditionalWrap";
import TouchableDiv from "@/components/animation/touchRippleAnimation";
import {StatePlaceholder} from "@/components/ui/StatePlaceholder";
import {usePost} from "@/hooks/usePost";

export const ChannelRecording = ({ channelId }: { channelId: string }) => {
  const [selectedDateRage, setSelectedDateRage] = useState<DateRange | undefined>({
    from: subDays(new Date(), 30),
    to: new Date(),
  });

  const [pageIndex, setPageIndex] = useState(0);
  const [allRecordings, setAllRecordings] = useState<RecordingInfoInterface[]>([]);
  const [hasMore, setHasMore] = useState(true);
  const pageSize = 20;
  const dispatch = useDispatch();
  const post = usePost();

  const startDate = selectedDateRage?.from?.toISOString() || "";
  const endDate = selectedDateRage?.to?.toISOString() || "";

  const endpoint = startDate && endDate
      ? `${GetEndpointUrl.ChannelRecordingList}/${channelId}?startDate=${startDate}&endDate=${endDate}&pageIndex=${pageIndex}&pageSize=${pageSize}`
      : "";

  const channelInfoEndpoint = `${GetEndpointUrl.ChannelBasicInfo}/${channelId}`;
  const { data: channelInfoData } = useFetch<ChannelInfoInterfaceResp>(channelInfoEndpoint);
  const isAdmin = channelInfoData?.channel_info?.ch_is_admin || false;

  const { data: pageData, isLoading } = useFetch<RecordingPaginationResRaw>(endpoint);

  const handleDelete = async (egressId: string) => {
    try {
      await post.makeRequest({
        apiEndpoint: PostEndpointUrl.DeleteChannelRecording,
        appendToUrl: `/${egressId}`,
        showToast: true,
      })
      setAllRecordings(prev => prev.filter(r => r.recording_egress_id !== egressId))
    } catch {
      // handled by usePost
    }
  };

  useEffect(() => {
    if (pageData?.channel_info?.recordings) {
      setAllRecordings((prev) => {
        const combined = pageIndex === 0 ? pageData.channel_info!.recordings : [...prev, ...pageData.channel_info!.recordings];
        const unique = Array.from(new Map(combined.map(item => [item.recording_egress_id, item])).values());
        return unique;
      });
      setHasMore(pageData.channel_info.has_more);
    }
  }, [pageData, pageIndex]);

  useEffect(() => {
    setPageIndex(0);
    setAllRecordings([]);
  }, [selectedDateRage]);

  const onLoadMore = useCallback(() => {
    if (!isLoading && hasMore) {
      setPageIndex((prev) => prev + 1);
    }
  }, [isLoading, hasMore]);

  const handleClick = (recording: RecordingInfoInterface) => {
    const getMediaURL = GetEndpointUrl.GetChannelRecordingMedia + '/' + channelId;
    const getTranscriptURL = GetEndpointUrl.GetChannelRecordingTranscript + '/' + channelId;

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

  const { isDesktop, isMobile } = useMedia();

  const renderItem = (recording: RecordingInfoInterface, i: number) => (
    <ConditionalWrap key={recording.recording_egress_id} condition={isMobile} wrap={
        (c) => (
            <TouchableDiv rippleBrightness={0.8} rippleDuration={800} onClick={() => handleClick(recording)}>
                {c}
            </TouchableDiv>
        )
    }>
        <div onClick={isMobile ? undefined : () => handleClick(recording)}>
            <RecordingListRecording recordingInfo={recording} onDelete={isAdmin ? handleDelete : undefined} />
        </div>
    </ConditionalWrap>
  );

  return (
    <div className="h-full flex flex-col">
      {isDesktop && (
          <div
              className='flex  px-3 font-semibold text-lg p-2 truncate overflow-x-hidden overflow-ellipsis justify-between border-b'>

              <div className="flex justify-center items-center space-x-2">
                  <div className='${statusColors.online.solid} flex justify-center items-center rounded-md w-8 h-8 p-1.5 shadow-sm'>
                    <Video className="text-white" size={18} />
                  </div>
                  <div>{"Recordings"}</div>
            </div>
            <div className="flex items-center gap-4">
              <DateRangeField
                dateRange={selectedDateRage}
                setDateRange={setSelectedDateRage}
              />
              {isLoading && (
                  <div className="flex items-center gap-2 animate-in fade-in slide-in-from-right-2">
                      <Loader2 className="h-4 w-4 animate-spin text-primary/60" />
                  </div>
              )}
            </div>
          </div>
      )}
      {
        isMobile &&
        <DateRangeField
          dateRange={selectedDateRage}
          setDateRange={setSelectedDateRage}
        />
      }

      <div className="flex-1 min-h-0 overflow-auto">
          {allRecordings.length > 0 ? (
              <div className="w-full h-full flex justify-center no-scrollbar">
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
                  <Loader2 className="h-8 w-8 animate-spin text-primary/40" />
              </div>
          )}
      </div>
      
    </div>
  );
};
