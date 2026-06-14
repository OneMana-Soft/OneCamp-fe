import {ChannelInfoInterface} from "@/types/channel";
import {UserDMInterface, UserInfoRawInterface, UserProfileDataInterface} from "@/types/user";

export interface RecordingInfoInterface {
    recording_egress_id: string;
    recording_stared_at: string;
    recording_ended_at: string;
    recording_duration: number;
    recording_obj_key: string;
    recording_transcript: TranscriptInfoInterface[];
    recording_size: number;
    recording_started_by: UserProfileDataInterface;
    recording_channel: ChannelInfoInterface;
    recording_dm: UserDMInterface;
}

export interface TranscriptInfoInterface {
    transcript_from: UserProfileDataInterface
    transcript_text: string
    transcript_timestamp: number
    // Skew-free seek anchor: ms from recording start, measured in the
    // producer's own clock. Present on new recordings; absent on legacy rows
    // (playback falls back to transcript_timestamp − recording_start).
    transcript_offset_ms?: number
}

export interface RecordingPaginationResRaw {
    status?: string;
    msg?: string;
    data: {
        recordings: RecordingInfoInterface[];
        has_more: boolean;
        participant_is_member?: number;
    };
    channel_info?: {
        recordings: RecordingInfoInterface[];
        has_more: boolean;
        is_member: number;
    }
}