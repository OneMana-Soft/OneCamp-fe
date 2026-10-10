import React from "react";
import { getLastMessagePreview } from "@/lib/utils/lastMessagePreview";
import { formatListTimestamp } from "@/lib/utils/date/formatTimeForPostOrComment";
import { Hash } from "@/lib/icons";
import { IdentityMark } from "@/components/ui/graphics/IdentityMark";
import { CallActiveIndicator } from "@/components/callIndicator/CallActiveIndicator";
import { ListRow, UnreadBadge } from "@/components/ui/listRow";
import { AttachmentMediaReq } from "@/types/attachment";

interface DmItemProps {
    /** Whose colour the row's mark is (lib/campHue, by uuid). */
    channelId: string;
    lastUsername: string;
    lastUserMessage: string;
    lastMessageTime: string;
    channelName: string;
    unseenMessageCount: number;
    userSelected: boolean;
    attachmentCount: number;
    lastAttachments?: AttachmentMediaReq[];
    isCallActive?: boolean;
}

export const ChannelListChannel: React.FC<DmItemProps> = React.memo(
    ({
        channelId,
        lastUsername,
        lastUserMessage,
        lastMessageTime,
        channelName,
        unseenMessageCount,
        userSelected,
        lastAttachments,
        isCallActive,
    }) => {
        const message = getLastMessagePreview(lastUserMessage, lastAttachments);

        const hasUnread = unseenMessageCount > 0;

        // The channel's colour: a tint tile with its # in the strong cut, the
        // same mark the channel's header carries.
        const leading = <IdentityMark id={channelId} variant="tile" size={32} icon={<Hash strokeWidth={2} />} />;

        const titleNode = (
            <span className="inline-flex items-center gap-1.5">
                <span className="truncate">{channelName}</span>
                {isCallActive && <CallActiveIndicator size="sm" />}
            </span>
        );

        const subtitle = message ? (
            <>
                {lastUsername && (
                    <span className="text-muted-foreground/90 font-medium">
                        {lastUsername}:{" "}
                    </span>
                )}
                {message}
            </>
        ) : (
            <span className="text-muted-foreground/70">No messages yet</span>
        );

        return (
            <ListRow
                density="default"
                selected={userSelected}
                emphasize={hasUnread}
                leading={leading}
                title={titleNode}
                meta={lastMessageTime ? formatListTimestamp(lastMessageTime) : undefined}
                trailing={hasUnread ? <UnreadBadge count={unseenMessageCount} /> : undefined}
                subtitle={subtitle}
            />
        );
    },
);

ChannelListChannel.displayName = "ChannelListChannel";
