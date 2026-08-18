import {ChannelListTabs} from "@/components/channel/channelListTabs";
import {useFetch} from "@/hooks/useFetch";
import {GetEndpointUrl, PostEndpointUrl} from "@/services/endPoints";
import {ChannelInfoInterface, ChannelInfoListInterfaceResp} from "@/types/channel";
import {useEffect, useState} from "react";
import {GenericSearchTextInterface, UserDMSearchTextInterface, UserProfileDataInterface} from "@/types/user";
import {usePost} from "@/hooks/usePost";
import {ChannelListResult} from "@/components/channel/chnnelListResult";
import {sortChannelList} from "@/lib/utils/sortChannelList";
import {StatePlaceholder} from "@/components/ui/StatePlaceholder";
import { ErrorState } from "@/components/ui/error-state"
import {Button} from "@/components/ui/button";
import {useDispatch} from "react-redux";
import {openUI} from "@/store/slice/uiSlice";

export const ChannelListTabActive = ({searchQuery}:{searchQuery: string}) => {
    const post = usePost();
    const dispatch = useDispatch();
    
    // Main List Pagination state
    const [pageIndex, setPageIndex] = useState(0)
    const [allChannels, setAllChannels] = useState<ChannelInfoInterface[]>([])
    const [hasMore, setHasMore] = useState(true)
    const pageSize = 20

    // Search Pagination state
    const [searchPageIndex, setSearchPageIndex] = useState(0)
    const [searchAllChannels, setSearchAllChannels] = useState<ChannelInfoInterface[]>([])
    const [searchHasMore, setSearchHasMore] = useState(true)
    const [isSearchLoading, setIsSearchLoading] = useState(false)

    // Fetch data for the main list
    const endpoint = `${GetEndpointUrl.GetUserActiveChannelList}?pageIndex=${pageIndex}&pageSize=${pageSize}`;
    const { data: pageData, isLoading, isError, mutate } = useFetch<ChannelInfoListInterfaceResp>(searchQuery.trim().length === 0 ? endpoint : "")

    // Function to fetch search results
    const fetchSearchResults = async (query: string, page: number) => {
        setIsSearchLoading(true)
        const resp = await post.makeRequest<GenericSearchTextInterface, ChannelInfoInterface[] >({
            apiEndpoint: PostEndpointUrl.SearchActiveUserChannelList,
            payload: {
                search_text: query,
                page_index: page,
                page_size: pageSize
            }
        })
        setIsSearchLoading(false)
        if (resp) {
            const sorted = sortChannelList(resp)
            if (page === 0) {
                setSearchAllChannels(sorted)
            } else {
                setSearchAllChannels(prev => [...prev, ...sorted])
            }
            if (resp.length < pageSize) {
                setSearchHasMore(false)
            } else {
                setSearchHasMore(true)
            }
            setSearchPageIndex(page)
        }
    }

    // Effect for Search Query Change
    useEffect(() => {
        if (searchQuery.trim().length > 0) {
            setSearchPageIndex(0)
            setSearchHasMore(true)
            setSearchAllChannels([])
            fetchSearchResults(searchQuery, 0)
        } else {
            setSearchAllChannels([])
        }
    }, [searchQuery])

    // Append data for main list
    useEffect(() => {
        if (pageData?.channels_list && searchQuery.trim().length === 0) {
            if (pageIndex === 0) {
                setAllChannels(sortChannelList(pageData.channels_list))
            } else {
                setAllChannels(prev => [...prev, ...sortChannelList(pageData.channels_list)])
            }
            
            if (pageData.channels_list.length < pageSize) {
                setHasMore(false)
            } else {
                setHasMore(true) 
            }
        }
    }, [pageData, pageIndex, searchQuery])
    
    const onLoadMore = () => {
        if (searchQuery.trim().length > 0) {
            // Search Mode Load More
            if (!isSearchLoading && searchHasMore) {
                fetchSearchResults(searchQuery, searchPageIndex + 1)
            }
        } else {
            // Main List Load More
            if (!isLoading && hasMore) {
               setPageIndex(prev => prev + 1)
            }
        }
    }

    const renderChannelList = (searchQuery.trim().length > 0) ? searchAllChannels : allChannels
    const currentIsLoading = (searchQuery.trim().length > 0) ? isSearchLoading : isLoading
    const currentHasMore = (searchQuery.trim().length > 0) ? searchHasMore : hasMore

    return (
        <div className="flex-1 overflow-hidden flex flex-col">
            {renderChannelList && renderChannelList.length > 0 ?
                <ChannelListResult 
                    channelList={renderChannelList} 
                    onLoadMore={onLoadMore}
                    hasMore={currentHasMore}
                    isLoading={currentIsLoading}
                /> :
                isError ? (
                    // Ahead of the empty branch: "You haven't joined any active
                    // channels yet" would be the app telling a member of twelve
                    // channels that they belong to none.
                    <div className="p-4">
                        <ErrorState subject="your channels" onRetry={() => void mutate()} />
                    </div>
                ) :
                (!currentIsLoading && (
                    <div className="p-4">
                        <StatePlaceholder 
                            type={searchQuery.trim().length > 0 ? 'search' : 'empty'}
                            title={searchQuery.trim().length > 0 ? "No matches found" : "No active channels"}
                            description={searchQuery.trim().length > 0 
                                ? `We couldn't find any channels matching "${searchQuery}"`
                                : "You haven't joined any active channels yet. Start by creating a new one or join an existing one."}
                            action={searchQuery.trim().length === 0 && (
                                <Button onClick={() => dispatch(openUI({ key: 'createChannel' }))} variant="outline" size="sm">
                                    Create a Channel
                                </Button>
                            )}
                        />
                    </div>
                ))
            }
        </div>
    )
}