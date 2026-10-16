import React from "react";
import { getLastMessagePreview } from "@/lib/utils/lastMessagePreview";
import { formatListTimestamp } from "@/lib/utils/date/formatTimeForPostOrComment";
import { Hash, Lock } from "@/lib/icons";
import { CallActiveIndicator } from "@/components/callIndicator/CallActiveIndicator";
import { ListRow, UnreadBadge } from "@/components/ui/listRow";
import { AttachmentMediaReq } from "@/types/attachment";
import { ChannelGuestTag } from "@/components/channel/channelGuestTag";

interface DmItemProps {
    channelId: string;
    /** A private channel shows a lock where the # goes, as its header does. */
    isPrivate?: boolean;
    lastUsername: string;
    lastUserMessage: string;
    lastMessageTime: string;
    channelName: string;
    unseenMessageCount: number;
    userSelected: boolean;
    attachmentCount: number;
    lastAttachments?: AttachmentMediaReq[];
    isCallActive?: boolean;
    /** People outside the workspace can read it (a live guest link). */
    hasGuestAccess?: boolean;
}

export const ChannelListChannel: React.FC<DmItemProps> = React.memo(
    ({
        isPrivate = false,
        lastUsername,
        lastUserMessage,
        lastMessageTime,
        channelName,
        unseenMessageCount,
        userSelected,
        lastAttachments,
        isCallActive,
        hasGuestAccess = false,
    }) => {
        const message = getLastMessagePreview(lastUserMessage, lastAttachments);

        const hasUnread = unseenMessageCount > 0;

        // A channel has no hue (design v3 chat, rule 1.2 and C55): the
        // monochrome # its header and the sidebar carry, on a neutral tile,
        // a lock for a private one. The colour in a row of channels is the
        // people in them, never the room.
        const leading = (
            <span aria-hidden="true" data-channel-mark="" className="flex size-8 shrink-0 items-center justify-center rounded-[10px] bg-sunken text-ink-3 ring-1 ring-inset ring-line [&_svg]:size-4">
                {isPrivate ? <Lock /> : <Hash />}
            </span>
        );

        const titleNode = (
            <span className="inline-flex items-center gap-1.5">
                <span className="truncate">{channelName}</span>
                {hasGuestAccess && <ChannelGuestTag />}
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
