"use client"

import {useMemo} from "react";
import {useApi} from "@/hooks/useApi";
import {GetEndpointUrl} from "@/services/endPoints";
import type {ChannelInfoInterface} from "@/types/channel";
import {ChannelListResult} from "@/components/channel/chnnelListResult";
import {ChannelInfoListSchema} from "@/lib/validations/schemas";
import { EmptyState } from "@/components/ui/empty-state";
import { SpotSearch, SpotWelcome } from "@/components/ui/graphics/spots";
import {LocalizedErrorBoundary} from "@/components/error/LocalizedErrorBoundary";
import { ChannelListSkeleton, ChannelListState } from "@/components/channel/channelListFrame";
import { ErrorState } from "@/components/ui/error-state";

export const ChannelListTabAllActive = ({searchQuery}:{searchQuery: string}) => {
    // GetAllActiveChannelList returns an object with channels_list array
    const {
        data: allChannelsResponse,
        isLoading: isAllLoading,
        isError,
        mutate,
    } = useApi<any>(
        GetEndpointUrl.GetAllActiveChannelList, 
        { schema: ChannelInfoListSchema }
    );

    const allChannels = (allChannelsResponse?.channels_list || []) as ChannelInfoInterface[];

    // Filter locally for now if specialized search endpoint is not ready/available
    const filteredChannels = useMemo(() => {
        if (!searchQuery.trim()) return allChannels;
        const lowQuery = searchQuery.toLowerCase();
        return allChannels.filter(ch => 
            ch.ch_name.toLowerCase().includes(lowQuery)
        );
    }, [searchQuery, allChannels]);


    // The frame the other tabs draw in (channelListFrame). A failed load said
    // "All caught up!", the empty state, and the loading rows were the generic
    // ListSkeleton: round 40px avatars on a 56px pitch, outside the 880px column.
    return (
        <div className="flex flex-col h-full">

            <div className="flex-1 overflow-hidden flex flex-col">
                <LocalizedErrorBoundary fallbackTitle="Couldn't show the channels" fallbackDescription="We couldn't load the list of channels you could join.">
                    {filteredChannels.length > 0 ? (
                        <ChannelListResult
                            channelList={filteredChannels}
                            isLoading={isAllLoading}
                        />
                    ) : isAllLoading ? (
                        <ChannelListSkeleton />
                    ) : isError ? (
                        <ChannelListState>
                            <ErrorState subject="the channels you could join" onRetry={() => void mutate()} />
                        </ChannelListState>
                    ) : (
                        <ChannelListState>
                            <EmptyState
                                illustration={searchQuery.trim().length > 0 ? <SpotSearch /> : <SpotWelcome />}
                                title={searchQuery.trim().length > 0 ? "No channels match" : "All caught up!"}
                                description={searchQuery.trim().length > 0
                                    ? `No channel you could join has “${searchQuery.trim()}” in its name.`
                                    : "Looks like you have joined all available public channels. New channels will appear here once created."}
                            />
                        </ChannelListState>
                    )}
                </LocalizedErrorBoundary>
            </div>
        </div>
    );
};
