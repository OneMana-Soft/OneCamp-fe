import { PostEndpointUrl, GetEndpointUrl } from "@/services/endPoints";
import { usePost } from "@/hooks/usePost";
import { useCallback } from "react";

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

export interface SearchResponse {
    page: SearchResult[];
    has_more: boolean;
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

export const GlobalSearchGet = (searchText: string) => `${GetEndpointUrl.GlobalSearch}${searchText}`;
