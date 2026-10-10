import {useFetch} from "@/hooks/useFetch";
import {GetEndpointUrl, PostEndpointUrl} from "@/services/endPoints";
import {ChannelInfoInterface, ChannelInfoListInterfaceResp} from "@/types/channel";
import {useEffect, useState} from "react";
import {GenericSearchTextInterface} from "@/types/user";
import {usePost} from "@/hooks/usePost";
import {ChannelListResult} from "@/components/channel/chnnelListResult";
import {sortChannelList} from "@/lib/utils/sortChannelList";
import { EmptyState } from "@/components/ui/empty-state";
import { SpotSearch, SpotWelcome } from "@/components/ui/graphics/spots";
import { ErrorState } from "@/components/ui/error-state"
import { ChannelListSkeleton, ChannelListState, useRowsWhileSearching } from "@/components/channel/channelListFrame";
import { cn } from "@/lib/utils/helpers/cn";
import {Button} from "@/components/ui/button";
import {useDispatch} from "react-redux";
import {openUI} from "@/store/slice/uiSlice";

/**
 * The channels you're in. Empty, it offers the ones you could join (onDiscover
 * opens the Discover tab) before making a new one: it used to offer only
 * "Create a Channel", to someone whose team already talks in channels they
 * hadn't found.
 */
export const ChannelListTabActive = ({searchQuery, onDiscover}:{searchQuery: string; onDiscover?: () => void}) => {
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
    // The query the search results are for: until they are for this one, the
    // rows already shown stay, dimmed (useRowsWhileSearching).
    const [searchedFor, setSearchedFor] = useState("")

    // Fetch data for the main list
    const endpoint = `${GetEndpointUrl.GetUserActiveChannelList}?pageIndex=${pageIndex}&pageSize=${pageSize}`;
    const { data: pageData, isLoading, isError, mutate } = useFetch<ChannelInfoListInterfaceResp>(searchQuery.trim().length === 0 ? endpoint : "")

    // Function to fetch search results
    const fetchSearchResults = async (query: string, page: number) => {
        setIsSearchLoading(true)
        let resp: ChannelInfoInterface[] | undefined
        try {
            resp = await post.makeRequest<GenericSearchTextInterface, ChannelInfoInterface[] >({
                apiEndpoint: PostEndpointUrl.SearchActiveUserChannelList,
                payload: {
                    search_text: query,
                    page_index: page,
                    page_size: pageSize
                }
            })
        } catch {
            resp = undefined
        } finally {
            setIsSearchLoading(false)
        }
        const sorted = resp ? sortChannelList(resp) : []
        if (page === 0) {
            setSearchAllChannels(sorted)
            // Answered, found or not: the dimmed rows give way either way.
            setSearchedFor(query)
        } else {
            setSearchAllChannels(prev => [...prev, ...sorted])
        }
        setSearchHasMore(!!resp && resp.length >= pageSize)
        setSearchPageIndex(page)
    }

    // Effect for Search Query Change
    useEffect(() => {
        if (searchQuery.trim().length > 0) {
            setSearchPageIndex(0)
            setSearchHasMore(true)
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

    const searching = searchQuery.trim().length > 0
    const searchPending = searching && searchedFor !== searchQuery
    const shown = useRowsWhileSearching(searching ? searchAllChannels : allChannels, searchPending)
    const renderChannelList = shown.rows
    const currentIsLoading = (searchQuery.trim().length > 0) ? isSearchLoading : isLoading
    const currentHasMore = (searchQuery.trim().length > 0) ? searchHasMore : hasMore

    // One frame for every tab (channelListFrame): the rows' own skeleton on the
    // first load, which drew nothing at all; the empty and failed states in
    // one place under the search; and while a search is on its way, the rows
    // already shown, dimmed.
    const firstLoad = !searching && isLoading && allChannels.length === 0

    return (
        <div className="flex-1 overflow-hidden flex flex-col">
            {firstLoad ? (
                <ChannelListSkeleton />
            ) : renderChannelList.length > 0 ? (
                <div aria-busy={shown.stale || undefined} className={cn("flex min-h-0 flex-1 flex-col transition-opacity duration-150", shown.stale && "opacity-60")}>
                    <ChannelListResult
                        channelList={renderChannelList}
                        onLoadMore={onLoadMore}
                        hasMore={currentHasMore}
                        isLoading={currentIsLoading}
                    />
                </div>
            ) : isError && !searching ? (
                // Ahead of the empty branch: an empty list would tell a member
                // of twelve channels that they belong to none.
                <ChannelListState>
                    <ErrorState subject="your channels" onRetry={() => void mutate()} />
                </ChannelListState>
            ) : searchPending || currentIsLoading ? (
                <ChannelListSkeleton />
            ) : (
                <ChannelListState>
                    <EmptyState
                            illustration={searching ? <SpotSearch /> : <SpotWelcome />}
                            title={searching ? "No matches found" : "You're not in any channels yet"}
                            description={searching
                                ? `No channel you're in has “${searchQuery.trim()}” in its name.`
                                : "Find the channels your team already talks in, or start a new one."}
                            action={!searching && (
                                <div className="flex flex-wrap justify-center gap-2">
                                    {onDiscover && (
                                        <Button onClick={onDiscover} size="sm">
                                            Discover channels
                                        </Button>
                                    )}
                                    <Button onClick={() => dispatch(openUI({ key: 'createChannel' }))} variant="outline" size="sm">
                                        Create a channel
                                    </Button>
                                </div>
                            )}
                        />
                </ChannelListState>
            )}
        </div>
    )
}
