import React, { useMemo } from "react";
import { removeHtmlTags } from "@/lib/utils/removeHtmlTags";
import { formatTimeForPostOrComment } from "@/lib/utils/date/formatTimeForPostOrComment";
import { ChatUserListUserAvatar } from "@/components/chat/chatUserListUserAvatar";
import { useUserInfoState } from "@/hooks/useUserInfoState";
import { UserProfileDataInterface, USER_STATUS_ONLINE } from "@/types/user";
import { GroupedAvatar } from "@/components/groupedAvatar/groupedAvatar";
import { CallActiveIndicator } from "@/components/callIndicator/CallActiveIndicator";
import { cn } from "@/lib/utils/helpers/cn";
import { statusColors } from "@/lib/colors";
import { ListRow, UnreadBadge } from "@/components/ui/listRow";

interface DmItemProps {
    lastUsername: string;
    lastUserMessage: string;
    lastMessageTime: string;
    unseenMessageCount: number;
    userSelected: boolean;
    attachmentCount: number;
    dmParticipants: UserProfileDataInterface[];
    selfProfile: UserProfileDataInterface;
    isCallActive?: boolean;
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
    isCallActive,
}) => {
    const isSelfDm = useMemo(() => dmParticipants.length === 0, [dmParticipants.length]);
    const isGroupChat = useMemo(() => dmParticipants.length > 1, [dmParticipants.length]);

    const UName = useMemo(
        () =>
            isSelfDm
                ? selfProfile.user_name
                : dmParticipants.map((t) => t.user_name).join(", ") || selfProfile?.user_name,
        [dmParticipants, isSelfDm, selfProfile],
    );

    const message = useMemo(() => {
        if (lastUserMessage === "" && attachmentCount > 0) {
            return "sent an attachment";
        }
        if (lastUserMessage !== "") {
            return removeHtmlTags(lastUserMessage);
        }
        return "";
    }, [lastUserMessage, attachmentCount]);

    const otherParticipant = useMemo(() => {
        if (dmParticipants.length === 1) return dmParticipants[0];
        if (dmParticipants.length === 0 && selfProfile) return selfProfile;
        return null;
    }, [dmParticipants, selfProfile]);

    const userStatusState = useUserInfoState(otherParticipant?.user_uuid);

    const isOnline = useMemo(() => {
        if (!otherParticipant) return false;
        const isReduxLoaded = userStatusState && userStatusState.deviceConnected !== -1;
        const currentStatus =
            isReduxLoaded && userStatusState.status
                ? userStatusState.status
                : otherParticipant.user_status || "offline";
        const currentDeviceCount = isReduxLoaded
            ? userStatusState.deviceConnected
            : otherParticipant.user_device_connected || 0;

        return currentStatus === USER_STATUS_ONLINE && currentDeviceCount > 0;
    }, [otherParticipant, userStatusState]);

    const formattedTime = useMemo(
        () => (lastMessageTime ? formatTimeForPostOrComment(lastMessageTime) : ""),
        [lastMessageTime],
    );

    const displayName = useMemo(
        () => (isSelfDm ? `${UName} (You)` : UName),
        [isSelfDm, UName],
    );

    const hasUnread = unseenMessageCount > 0;

    const leading = (
        <div className="relative h-8 w-8 shrink-0">
            {!isGroupChat && otherParticipant && (
                <>
                    <ChatUserListUserAvatar
                        userName={UName}
                        userProfileObjKey={otherParticipant.user_profile_object_key}
                    />
                    {isOnline && (
                        <span
                            aria-hidden
                            className={cn(
                                "absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full ring-2 ring-background",
                                statusColors.online.solid,
                            )}
                        />
                    )}
                    {isCallActive && (
                        <CallActiveIndicator
                            size="sm"
                            className="absolute -top-1 -left-1 z-20 ring-2 ring-background"
                        />
                    )}
                </>
            )}

            {isGroupChat && (
                <div className="flex items-center h-8 -ml-1">
                    <GroupedAvatar
                        users={isSelfDm ? [selfProfile] : dmParticipants}
                        max={dmParticipants.length > 2 ? 1 : 2}
                        overlap={14}
                        size={28}
                        className="!pr-0"
                        style={{ paddingRight: 0 }}
                    />
                    {isCallActive && (
                        <CallActiveIndicator
                            size="sm"
                            className="absolute -top-1 -left-1 z-20 ring-2 ring-background"
                        />
                    )}
                </div>
            )}
        </div>
    );

    const subtitle = message ? (
        <>
            {lastUsername && (
                <span className="text-muted-foreground/90 font-medium">{lastUsername}: </span>
            )}
            {message}
        </>
    ) : (
        <span className="text-muted-foreground/70">
            {isSelfDm ? "Jot down notes, ideas, or reminders" : "No messages yet"}
        </span>
    );

    return (
        <ListRow
            density="default"
            selected={userSelected}
            emphasize={hasUnread}
            leading={leading}
            title={displayName}
            meta={formattedTime || undefined}
            trailing={hasUnread ? <UnreadBadge count={unseenMessageCount} /> : undefined}
            subtitle={subtitle}
        />
    );
};

export default React.memo(ChatUserListUser);
