import {useRouter} from "next/navigation";
import {ConditionalWrap} from "@/components/conditionalWrap/conditionalWrap";
import {useMedia} from "@/context/MediaQueryContext";
import TouchableDiv from "@/components/animation/touchRippleAnimation";
import {RecordingInfoInterface} from "@/types/recording";
import {RecordingListRecording} from "@/components/recording/recordingListRecording";
import {openUI} from "@/store/slice/uiSlice";
import {useDispatch} from "react-redux";

export const RecordingListResult = ({recordingList, getMediaURL, getTranscriptURL}: {recordingList: RecordingInfoInterface[], getMediaURL: string, getTranscriptURL: string}) => {

    const router = useRouter();

    const dispatch = useDispatch();

    const handleClick = (egressId: string) => {

        const date = new Date(recordingList.find((r) => r.recording_egress_id === egressId)?.recording_stared_at || "");
        const fileName = `Recording-${date.toLocaleDateString()}-${date.toLocaleTimeString()}.mp4`;
        const fileSize = recordingList.find((r) => r.recording_egress_id === egressId)?.recording_size || 0;
        const recordedAt = recordingList.find((r) => r.recording_egress_id === egressId)?.recording_stared_at || "";
        dispatch(openUI({
            key: 'recordingPlayer',
            data: {egressId: egressId, mediaGetUrl: getMediaURL, transcriptGetUrl: getTranscriptURL, fileSize: fileSize, fileName: fileName, recordedAt: recordedAt}
        }));

    }
    const {isMobile} = useMedia()


    if(recordingList.length == 0 ) {
        return (
            <div className='flex justify-center items-center h-full text-muted-foreground'>
                No recordings found 😓
            </div>
        )
    }


    return (
        <div className="w-full h-full flex justify-center overflow-y-auto pt-2 no-scrollbar">
            <div className=" w-full md:w-[45vw] flex flex-col">
                {
                    recordingList.map((recording: RecordingInfoInterface, i) => {
                        return (
                            <ConditionalWrap key = {recording.recording_egress_id} condition={isMobile} wrap={
                                (c)=>(
                                    <TouchableDiv rippleBrightness={0.8} rippleDuration={800}>{c}
                                    </TouchableDiv>

                                )
                            }>
                            <div key = {recording.recording_egress_id}  onClick={()=>handleClick(recording.recording_egress_id)}>
                                <RecordingListRecording
                                    recordingInfo={recording}
                                />
                            </div>
                                </ConditionalWrap>
                        )
                    })

                }



            </div>
        </div>
    )
}
