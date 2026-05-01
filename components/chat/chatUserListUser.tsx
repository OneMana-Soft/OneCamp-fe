import React, {useMemo} from "react";
import {removeHtmlTags} from "@/lib/utils/removeHtmlTags";
import {formatTimeForPostOrComment} from "@/lib/utils/date/formatTimeForPostOrComment";
import {ChatUserListUserAvatar} from "@/components/chat/chatUserListUserAvatar";
import {useSelector} from "react-redux";
import {RootState} from "@/store/store";
import {useUserInfoState} from "@/hooks/useUserInfoState";
import {UserProfileDataInterface, USER_STATUS_ONLINE} from "@/types/user";
import {GroupedAvatar} from "@/components/groupedAvatar/groupedAvatar";
import {formatCount} from "@/lib/utils/helpers/formatCount";
import {CallActiveIndicator} from "@/components/callIndicator/CallActiveIndicator";

interface DmItemProps {
    lastUsername: string;
    lastUserMessage: string;
    lastMessageTime: string;
    unseenMessageCount: number;
    userSelected: boolean
    attachmentCount: number
    dmParticipants: UserProfileDataInterface[]
    selfProfile: UserProfileDataInterface
    isCallActive?: boolean
}

const ChatUserListUser: React.FC<DmItemProps> = ({
                                           lastUsername,
                                           lastUserMessage,
                                           lastMessageTime,
                                           unseenMessageCount,
                                           userSelected, 
                                           dmParticipants,
                                           attachmentCount,
                                           selfProfile,
                                           isCallActive
                                       }) => {

    // Memoize computed values
    const isSelfDm = useMemo(() => dmParticipants.length === 0, [dmParticipants.length]);

    const UName = useMemo(() =>
            isSelfDm ? selfProfile.user_name : dmParticipants.map((t) => t.user_name).join(",") || selfProfile?.user_name,
        [dmParticipants]
    );

    const message = useMemo(() => {
        if (lastUserMessage === '' && attachmentCount > 0) {
            return 'sent attachment';
        }
        if (lastUserMessage !== '') {
            return removeHtmlTags(lastUserMessage);
        }
        return '';
    }, [lastUserMessage, attachmentCount]);

    const otherParticipants = useMemo(() => {
        if (dmParticipants.length === 1) {
            return dmParticipants[0];
        }
        if (dmParticipants.length === 0 && selfProfile) {
            return selfProfile;
        }
        return null;
    }, [dmParticipants, selfProfile]);

    const userStatusState = useUserInfoState(otherParticipants?.user_uuid)

    const isOnline = useMemo(() => {
        if (!otherParticipants) return false;
        
        const isReduxLoaded = userStatusState && userStatusState.deviceConnected !== -1;
        const currentStatus = isReduxLoaded && userStatusState.status ? userStatusState.status : (otherParticipants.user_status || 'offline');
        const currentDeviceCount = isReduxLoaded ? userStatusState.deviceConnected : (otherParticipants.user_device_connected || 0);

        return currentStatus === USER_STATUS_ONLINE && currentDeviceCount > 0;
    }, [otherParticipants, userStatusState]);

    const rightPanelState = useSelector((state: RootState) => state.rightPanel.rightPanelState);

    const formattedTime = useMemo(() => 
        lastMessageTime ? formatTimeForPostOrComment(lastMessageTime) : '',
        [lastMessageTime]
    );

    const displayName = useMemo(() => 
        isSelfDm ? `(You) ${UName}` : UName,
        [isSelfDm, UName]
    );

    return (
        <div 
            className={`group flex items-start gap-4 p-4 border-b hover:cursor-pointer hover:bg-primary/10 hover:shadow-xl transition-all duration-200 w-full ${userSelected ? "bg-sidebarActive bg-primary/10 shadow-sm" : ""}`}
        >
            {/* Avatar Section */}
            <div className="relative shrink-0 mt-0.5">
                <div className="relative">
                    {otherParticipants && <ChatUserListUserAvatar userName={UName} userProfileObjKey={otherParticipants.user_profile_object_key}/>}
                    {dmParticipants.length > 1 && <GroupedAvatar users={isSelfDm ? [selfProfile] : dmParticipants} max={2} overlap={20} className={'!pr-0'}/>}
                    {isCallActive && <CallActiveIndicator size="sm" className="absolute -top-1 -left-1 z-20 shadow-sm ring-2 ring-background" />}
                    {isOnline && <div className="h-2.5 w-2.5 ring-[2px] ring-background rounded-full bg-green-500 absolute bottom-0 right-0"></div>}
                </div>
                {unseenMessageCount !== 0 && (
                    <div className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-destructive text-[10px] font-bold text-white shadow-sm ring-2 ring-background z-20">
                        {formatCount(unseenMessageCount)}
                    </div>
                )}
            </div>

            {/* Content Section */}
            <div className="flex-1 space-y-1 overflow-hidden">
                <div className="flex justify-between items-start gap-2">
                    <div className="flex flex-col overflow-hidden">
                        <span className="font-semibold text-foreground leading-tight truncate">
                            {displayName}
                        </span>
                        {lastUsername && message && (
                            <span className="text-xs text-muted-foreground/80 truncate">
                                last message by @{lastUsername}
                            </span>
                        )}
                    </div>
                    {formattedTime && (
                        <span className="text-[10px] font-medium text-muted-foreground/70 bg-muted/50 px-1.5 py-0.5 rounded shrink-0 whitespace-nowrap">
                            {formattedTime}
                        </span>
                    )}
                </div>

                <div className={`text-sm text-foreground/80 leading-relaxed font-normal truncate p-2 rounded-md border border-border/20 group-hover:border-border/40 transition-colors ${userSelected ? "bg-sidebarActive/50 border-primary/20" : "bg-muted/10"}`}>
                    {message ? (
                        <div className="flex items-center gap-1 overflow-hidden">
                            <span className="shrink-0">{lastUsername}:</span>
                            <span className="truncate">{message}</span>
                        </div>
                    ) : (
                        isSelfDm ? "Take notes by sending yourself message" : "Start Conversation by saying Hi 👋"
                    )}
                </div>
            </div>
        </div>
    );
};

export default React.memo(ChatUserListUser);
