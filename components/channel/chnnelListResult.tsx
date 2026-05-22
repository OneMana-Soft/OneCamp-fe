import { ChannelInfoInterface } from "@/types/channel";
import { ChannelListChannel } from "@/components/channel/channelListChannel";
import * as React from "react";
import { app_channel_path } from "@/types/paths";
import Link from "next/link";
import { VirtualInfiniteScroll } from "@/components/list/virtualInfiniteScroll";
import { useSelector } from "react-redux";
import { RootState } from "@/store/store";
import { PageContainer } from "@/components/ui/pageContainer";
import { EmptyState } from "@/components/ui/empty-state";
import { Inbox } from "@/lib/icons";

export const ChannelListResult = ({
    channelList,
    onLoadMore,
    hasMore,
    isLoading,
}: {
    channelList: ChannelInfoInterface[]
    onLoadMore?: () => void
    hasMore?: boolean
    isLoading?: boolean
}) => {
    const channelCallStatus = useSelector(
        (state: RootState) => state.channel.channelCallStatus,
    );

    if (channelList.length === 0 && !isLoading) {
        return (
            <PageContainer className="flex items-center justify-center">
                <EmptyState
                    icon={Inbox}
                    title="No results"
                    description="Try a different search or check back later."
                />
            </PageContainer>
        );
    }

    const renderItem = (channel: ChannelInfoInterface) => {
        return (
            <Link
                key={channel.ch_uuid}
                href={`${app_channel_path}/${channel.ch_uuid}`}
                className="block focus:outline-none"
            >
                <ChannelListChannel
                    lastUsername={channel.ch_posts?.[0]?.post_by?.user_name || ""}
                    lastUserMessage={channel.ch_posts?.[0]?.post_text || ""}
                    lastMessageTime={channel.ch_posts?.[0]?.post_created_at || ""}
                    channelName={channel.ch_name}
                    unseenMessageCount={channel.unread_post_count || 0}
                    userSelected={false}
                    attachmentCount={channel.ch_posts?.[0]?.post_attachments?.length || 0}
                    isCallActive={
                        channelCallStatus[channel.ch_uuid]?.active ||
                        channel.ch_call_active ||
                        false
                    }
                />
            </Link>
        );
    };

    return (
        <PageContainer className="overflow-y-auto py-2">
            <VirtualInfiniteScroll
                items={channelList}
                renderItem={renderItem}
                onLoadMore={onLoadMore || (() => {})}
                hasMore={hasMore || false}
                keyExtractor={(item) => item.ch_uuid}
            />
        </PageContainer>
    );
};
