import { PostEndpointUrl, GetEndpointUrl } from "@/services/endPoints";
import { usePost } from "@/hooks/usePost";
import { useCallback } from "react";
import axiosInstance from "@/lib/axiosInstance";

export interface SearchResult {
    type: "chat" | "post" | "comment" | "attachment" | "doc" | "board" | "task" | "user" | "project" | "channel" | "team";
    chat?: any;
    post?: any;
    comment?: any;
    attachment?: any;
    doc?: any;
    board?: any;
    task?: any;
    user?: any;
    project?: any;
    channel?: any;
    team?: any;
    highlight?: Record<string, string[]>;
}

interface SearchResponse {
    page: SearchResult[];
    has_more: boolean;
    /** The cursor of the page after this one, while has_more. */
    next?: string;
}

export const useGlobalSearch = () => {
    const { makeRequest, isSubmitting } = usePost();

    const search = useCallback(async (searchText: string): Promise<SearchResponse | undefined> => {
        return makeRequest<{ global_search_text: string }, SearchResponse>({
            apiEndpoint: PostEndpointUrl.GlobalSearch,
            payload: { global_search_text: searchText },
            showToast: false
        });
    }, [makeRequest]);

    return { search, isSubmitting };
};

/**
 * The search request for a query. The query is a path segment, so it is
 * encoded: unencoded, "#engineering" was cut at the "#" and answered 404,
 * "a/b" was a route that doesn't exist, and "50%" failed before it was sent.
 */
export const GlobalSearchGet = (searchText: string) => `${GetEndpointUrl.GlobalSearch}${encodeURIComponent(searchText.trim())}`;

/**
 * The page of a search after the cursor a page answered with (its next), for
 * "Show more": the server asks the index for the hits after that page's last.
 */
export async function fetchSearchPage(searchText: string, after: string): Promise<SearchResponse> {
    const res = await axiosInstance.get(`${GlobalSearchGet(searchText)}?after=${encodeURIComponent(after)}`);
    const data = res.data?.data ?? {};
    return { page: data.page ?? [], has_more: !!data.has_more, next: data.next };
}
