import { displayNameOf } from "@/lib/personName"
import { ChannelInfoInterface } from "@/types/channel";
import { ChannelListChannel } from "@/components/channel/channelListChannel";
import { app_channel_path } from "@/types/paths";
import Link from "next/link";
import { VirtualInfiniteScroll } from "@/components/list/virtualInfiniteScroll";
import { useSelector } from "react-redux";
import { RootState } from "@/store/store";
import { PageContainer } from "@/components/ui/pageContainer";
import { EmptyState } from "@/components/ui/empty-state";
import { Inbox } from "@/lib/icons";
import { useBotKindMap } from "@/hooks/useBotKinds";
import { relayedAuthorOf } from "@/lib/relayedAuthor";

export const ChannelListResult = ({
    channelList,
    onLoadMore,
    hasMore,
    isLoading,
    action,
}: {
    channelList: ChannelInfoInterface[]
    onLoadMore?: () => void
    hasMore?: boolean
    isLoading?: boolean
    /** A control at a row's end (Archived's Restore), beside the row's link, never in it. */
    action?: (channel: ChannelInfoInterface) => React.ReactNode
}) => {
    const channelCallStatus = useSelector(
        (state: RootState) => state.channel.channelCallStatus,
    );
    // Bots' kinds, so a channel whose latest message a guest or Slack person
    // wrote reads "Priya (Acme): text", not "Guests: [Priya (Acme) (guest)]text"
    // (see lib/relayedAuthor).
    const botKinds = useBotKindMap();

    if (channelList.length === 0 && !isLoading) {
        return (
            <PageContainer align="center" className="flex items-center justify-center">
                <EmptyState
                    icon={Inbox}
                    title="No results"
                    description="Try a different search or check back later."
                />
            </PageContainer>
        );
    }

    const renderItem = (channel: ChannelInfoInterface) => {
        const last = channel.ch_posts?.[0];
        const by = last?.post_by;
        const relayed = by?.is_bot && by.user_uuid ? relayedAuthorOf(botKinds?.[by.user_uuid], last?.post_text) : null;
        const control = action?.(channel);
        const link = (
            <Link
                key={channel.ch_uuid}
                href={`${app_channel_path}/${channel.ch_uuid}`}
                // Fetch the page and its code while the list is on screen, as
                // the desktop sidebar does. Without it a tap waited for both in
                // turn before asking for a single message (~800 ms on a phone).
                prefetch
                className="block focus:outline-none"
            >
                <ChannelListChannel
                    channelId={channel.ch_uuid}
                    isPrivate={!!channel.ch_private}
                    lastUsername={relayed ? relayed.name : displayNameOf(by) || ""}
                    lastUserMessage={relayed ? relayed.body : last?.post_text || ""}
                    lastMessageTime={channel.ch_posts?.[0]?.post_created_at || ""}
                    channelName={channel.ch_name}
                    hasGuestAccess={channel.has_guest_access === true}
                    unseenMessageCount={channel.unread_post_count || 0}
                    userSelected={false}
                    attachmentCount={channel.ch_posts?.[0]?.post_attachments?.length || 0}
                    lastAttachments={channel.ch_posts?.[0]?.post_attachments}
                    isCallActive={
                        channelCallStatus[channel.ch_uuid]?.active ||
                        channel.ch_call_active ||
                        false
                    }
                />
            </Link>
        );
        if (!control) return link;
        return (
            <div key={channel.ch_uuid} className="flex items-center gap-2">
                <div className="min-w-0 flex-1">{link}</div>
                <div className="shrink-0 pr-3">{control}</div>
            </div>
        );
    };

    return (
        <PageContainer className="overflow-y-auto py-2">
            <VirtualInfiniteScroll
                items={channelList}
                renderItem={renderItem}
                onLoadMore={onLoadMore || (() => {})}
                hasMore={hasMore || false}
                isLoading={isLoading}
                keyExtractor={(item) => item.ch_uuid}
            />
        </PageContainer>
    );
};
