import React from "react";
import {ChatUserAvatar} from "@/components/chat/chatUserAvatar";
import {removeHtmlTags} from "@/lib/utils/removeHtmlTags";
import {formatTimeForPostOrComment} from "@/lib/utils/date/formatTimeForPostOrComment";
import {ChatUserListUserAvatar} from "@/components/chat/chatUserListUserAvatar";
import {useSelector} from "react-redux";
import {RootState} from "@/store/store";
import { Video, Trash2 } from "@/lib/icons";
import { statusColors } from "@/lib/colors";
import {app_channel_path} from "@/types/paths";
import {RecordingInfoInterface} from "@/types/recording";
import {useFetchOnlyOnce} from "@/hooks/useFetch";
import {UserProfileInterface} from "@/types/user";
import {GetEndpointUrl} from "@/services/endPoints";
import {format} from "date-fns";


export const RecordingListRecording = ({
                                                     recordingInfo,
                                                     currentUserId: propUserId,
                                                     onDelete
                                                 }: {recordingInfo: RecordingInfoInterface, currentUserId?: string, onDelete?: (egressId: string) => void}) => {

    const { data: selfProfile } = useFetchOnlyOnce<UserProfileInterface>(propUserId ? "" : GetEndpointUrl.SelfProfile);
    const currentUserId = propUserId || selfProfile?.data?.user_uuid;

    const handleDelete = (e: React.MouseEvent) => {
        e.stopPropagation()
        if (onDelete && recordingInfo.recording_egress_id) {
            onDelete(recordingInfo.recording_egress_id)
        }
    }

    return (
        <div className="group flex items-center gap-4 p-4 hover:bg-primary/5 cursor-pointer transition-all duration-150 border-b border-border/40 last:border-0 relative overflow-hidden">
            <div className="absolute left-0 top-0 bottom-0 w-1 bg-primary opacity-0 group-hover:opacity-100 transition-opacity" />
            
            <div className="relative">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-600 shadow-sm ring-1 ring-emerald-500/20 group-hover:scale-105 transition-transform duration-150">
                    <Video size={24} />
                </div>
            </div>

            <div className="flex-1 flex flex-col min-w-0">
                <div className="flex justify-between items-center mb-0.5">
                    <h3 className="font-bold text-foreground/90 truncate text-sm sm:text-base">
                        {recordingInfo.recording_channel?.ch_name 
                            ? `# ${recordingInfo.recording_channel.ch_name}` 
                            : recordingInfo.recording_dm?.dm_participants?.find(p => p.user_uuid !== currentUserId)?.user_name 
                                || "Direct Message Meeting"}
                    </h3>
                    <span className="text-[10px] sm:text-xs font-medium text-muted-foreground/60 whitespace-nowrap bg-muted/30 px-2 py-0.5 rounded-full">
                        {(() => {
                            if (!recordingInfo.recording_stared_at) return "";
                            try {
                                const d = new Date(recordingInfo.recording_stared_at);
                                if (!isNaN(d.getTime())) {
                                    return format(d, "MMM d, h:mm a");
                                }
                            } catch (e) {}
                            return "";
                        })()}
                    </span>
                </div>

                <div className="flex items-center gap-2 text-[11px] sm:text-xs text-muted-foreground/80">
                    <span className="font-semibold text-foreground/70">
                        {recordingInfo.recording_started_by?.user_name || "Assistant"}
                    </span>
                    <span className="opacity-40">•</span>
                    <span className="bg-primary/5 px-1.5 py-0.25 rounded  font-medium">
                        {Math.round(recordingInfo.recording_duration)}s
                    </span>
                    {recordingInfo.recording_size > 0 && (
                        <>
                            <span className="opacity-40">•</span>
                            <span>{(recordingInfo.recording_size / (1024 * 1024)).toFixed(1)} MB</span>
                        </>
                    )}
                </div>
            </div>
            
            <div className="flex items-center gap-1">
                {onDelete && (
                    <button
                        onClick={handleDelete}
                        className="h-8 w-8 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-destructive/10 text-destructive"
                        title="Delete recording"
                    >
                        <Trash2 size={16} />
                    </button>
                )}
                <div className="hidden sm:flex self-center opacity-0 group-hover:opacity-100 transition-opacity">
                     <div className="h-8 w-8 rounded-full flex items-center justify-center bg-primary/10 text-primary">
                        <svg width="15" height="15" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg" className="translate-x-0.5">
                            <path d="M3.24182 2.32181C2.9063 2.15603 2.5 2.40453 2.5 2.78359V12.2164C2.5 12.5955 2.9063 12.844 3.24182 12.6782L12.7443 7.96181C13.0852 7.79284 13.0852 7.20716 12.7443 7.03819L3.24182 2.32181Z" fill="currentColor"></path>
                        </svg>
                     </div>
                </div>
            </div>
        </div>
    );
};

