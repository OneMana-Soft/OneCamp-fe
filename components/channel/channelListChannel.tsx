import React from "react";
import { getLastMessagePreview } from "@/lib/utils/lastMessagePreview";
import { formatListTimestamp } from "@/lib/utils/date/formatTimeForPostOrComment";
import { ChannelTile } from "@/components/ui/graphics/ChannelTile";
import { placeHue } from "@/lib/placeHue";
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
        channelId,
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

        // A channel wears its hue (INTERACTION_SPEC D13, superseding v3
        // chat's rule 1.2): the tile the sidebar, its header, the palette
        // and search draw too, so a channel is one colour on every screen,
        // a lock for a private one. Its row tints in the same hue.
        const leading = <ChannelTile id={channelId} isPrivate={isPrivate} size={32} />;

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
                data-hue={placeHue("channel", channelId)}
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
