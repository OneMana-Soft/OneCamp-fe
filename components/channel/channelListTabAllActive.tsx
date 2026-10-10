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
import {ListSkeleton} from "@/components/ui/ListSkeleton";

export const ChannelListTabAllActive = ({searchQuery}:{searchQuery: string}) => {
    // GetAllActiveChannelList returns an object with channels_list array
    const {
        data: allChannelsResponse,
        isLoading: isAllLoading
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


    return (
        <div className="flex flex-col h-full">

            <div className="flex-1 overflow-hidden flex flex-col">
                <LocalizedErrorBoundary fallbackTitle="Channel List Error" fallbackDescription="We couldn't load the global channel list.">
                    {filteredChannels.length > 0 ?
                        <ChannelListResult 
                            channelList={filteredChannels}
                            isLoading={isAllLoading}
                        />:
                        (!isAllLoading && (
                            <div className="p-4">
                                <EmptyState
                                    illustration={searchQuery.trim().length > 0 ? <SpotSearch /> : <SpotWelcome />}
                                    title={searchQuery.trim().length > 0 ? "No channels match" : "All caught up!"}
                                    description={searchQuery.trim().length > 0 
                                        ? `No channel you could join has “${searchQuery.trim()}” in its name.`
                                        : "Looks like you have joined all available public channels. New channels will appear here once created."}
                                />
                            </div>
                        ))
                    }
                    {isAllLoading && filteredChannels.length === 0 && (
                         <ListSkeleton rows={8} />
                    )}
                </LocalizedErrorBoundary>
            </div>
        </div>
    );
};