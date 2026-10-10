import {useFetch} from "@/hooks/useFetch";
import {GetEndpointUrl, PostEndpointUrl} from "@/services/endPoints";
import {useEffect, useState} from "react";
import {GenericSearchTextInterface} from "@/types/user";
import {usePost} from "@/hooks/usePost";
import {DocListResult} from "@/components/doc/docListResult";
import {DocInfoInterface, DocInfoListInterface, DocInfoListInterfaceResp} from "@/types/doc";

export const DocListTabPublic = ({searchQuery, onCreate}: {searchQuery: string, onCreate: () => void}) => {
    const post = usePost();
    
    // Main List Pagination state
    const [pageIndex, setPageIndex] = useState(0)
    const [allDocs, setAllDocs] = useState<DocInfoInterface[]>([])
    const [hasMore, setHasMore] = useState(true)
    const pageSize = 20

    // Search Pagination state
    const [searchPageIndex, setSearchPageIndex] = useState(0)
    const [searchAllDocs, setSearchAllDocs] = useState<DocInfoInterface[]>([])
    const [searchHasMore, setSearchHasMore] = useState(true)
    const [isSearchLoading, setIsSearchLoading] = useState(false)
    // The search whose first page is in searchAllDocs.
    const [searchedFor, setSearchedFor] = useState("")

    // Fetch data for the main list
    const endpoint = `${GetEndpointUrl.GetUserPublicDocList}?pageIndex=${pageIndex}&pageSize=${pageSize}`;
    const { data: pageData, isLoading } = useFetch<DocInfoListInterfaceResp>(searchQuery.trim().length === 0 ? endpoint : "")

    // Function to fetch search results
    const fetchSearchResults = async (query: string, page: number) => {
        setIsSearchLoading(true)
        const resp = await post.makeRequest<GenericSearchTextInterface, DocInfoListInterface >({
            apiEndpoint: PostEndpointUrl.SearchPublicDocList,
            payload: {
                search_text: query,
                page_index: page,
                page_size: pageSize
            }
        })
        setIsSearchLoading(false)
        if (page === 0) setSearchedFor(query)
        if (resp && resp.docs) {
            // Note: usePost unwraps .data, so resp is DocInfoListInterface
            const docs = resp.docs || []
            
            if (page === 0) {
                setSearchAllDocs(docs)
            } else {
                setSearchAllDocs(prev => [...prev, ...docs])
            }
            if (docs.length < pageSize) {
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
            setSearchAllDocs([])
            fetchSearchResults(searchQuery, 0)
        } else {
            setSearchAllDocs([])
        }
    }, [searchQuery])

    // Append data for main list
    useEffect(() => {
        if (pageData?.data?.docs && searchQuery.trim().length === 0) {
            const docs = pageData.data.docs || []
            if (pageIndex === 0) {
                setAllDocs(docs)
            } else {
                setAllDocs(prev => [...prev, ...docs])
            }
            
            if (docs.length < pageSize) {
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

    // Between a new search and its first answer, and between the first page
    // arriving and the effect above copying it into the list, the list is
    // loading, not empty: otherwise "No documents" flashes for a frame.
    const searching = searchQuery.trim().length > 0
    const searchPending = searching && searchedFor !== searchQuery
    const firstPagePending = !searching && allDocs.length === 0 && (pageData?.data?.docs?.length ?? 0) > 0
    const renderDocList = searching ? (searchPending ? [] : searchAllDocs) : allDocs
    const currentIsLoading = searching ? isSearchLoading || searchPending : isLoading || firstPagePending
    const currentHasMore = (searchQuery.trim().length > 0) ? searchHasMore : hasMore

    return (
        <DocListResult 
            docList={renderDocList || []} 
            onLoadMore={onLoadMore}
            hasMore={currentHasMore}
            isLoading={currentIsLoading}
            onCreate={searchQuery.trim().length > 0 ? undefined : onCreate}
            searchQuery={searchQuery}
        />
    )
}
