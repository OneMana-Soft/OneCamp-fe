import React from "react";
import { removeHtmlTags } from "@/lib/utils/removeHtmlTags";
import { formatTimeForPostOrComment } from "@/lib/utils/date/formatTimeForPostOrComment";
import { Hash } from "@/lib/icons";
import { CallActiveIndicator } from "@/components/callIndicator/CallActiveIndicator";
import { cn } from "@/lib/utils/helpers/cn";
import { ListRow, UnreadBadge } from "@/components/ui/listRow";

interface DmItemProps {
    lastUsername: string;
    lastUserMessage: string;
    lastMessageTime: string;
    channelName: string;
    unseenMessageCount: number;
    userSelected: boolean;
    attachmentCount: number;
    isCallActive?: boolean;
}

export const ChannelListChannel: React.FC<DmItemProps> = React.memo(
    ({
        lastUsername,
        lastUserMessage,
        lastMessageTime,
        channelName,
        unseenMessageCount,
        userSelected,
        attachmentCount,
        isCallActive,
    }) => {
        let message = "";
        if (lastUserMessage === "" && attachmentCount > 0) {
            message = "sent an attachment";
        }
        if (lastUserMessage !== "") {
            message = removeHtmlTags(lastUserMessage);
        }

        const hasUnread = unseenMessageCount > 0;

        const leading = (
            <div className="flex h-8 w-8 items-center justify-center shrink-0 rounded-md bg-muted/40">
                <Hash
                    className={cn(
                        "h-4 w-4 transition-colors",
                        userSelected ? "text-foreground" : "text-muted-foreground",
                    )}
                    strokeWidth={2}
                />
            </div>
        );

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
                meta={lastMessageTime ? formatTimeForPostOrComment(lastMessageTime) : undefined}
                trailing={hasUnread ? <UnreadBadge count={unseenMessageCount} /> : undefined}
                subtitle={subtitle}
            />
        );
    },
);

ChannelListChannel.displayName = "ChannelListChannel";
