import { withinParam, type SearchWithin } from "@/lib/search/within";
import { PostEndpointUrl } from "@/services/endPoints";
import { SearchGet } from "@/services/endpoints/search";
import { usePost } from "@/hooks/usePost";
import { useCallback } from "react";
import axiosInstance from "@/lib/axiosInstance";

/**
 * A calendar event as search finds it (the backend's events index, written
 * from the calendar's store): never its notes, who is on it or an address.
 * A timed event's start and end are in seconds; an all-day one has its dates
 * ("2026-10-30", the end the day after its last).
 */
export interface SearchEventHit {
    event_uuid: string;
    event_title?: string;
    event_location?: string;
    event_kind?: string;
    event_start?: number;
    event_end?: number;
    event_start_date?: string;
    event_end_date?: string;
    event_tz?: string;
    event_repeats?: boolean;
    event_organiser_id?: string;
    event_organiser_full_name?: string;
    event_calendar_id?: string;
    event_project_id?: string;
    event_private?: boolean;
    created_date?: number;
    updated_date?: number;
}

export interface SearchResult {
    type: "chat" | "post" | "comment" | "attachment" | "doc" | "board" | "task" | "user" | "project" | "channel" | "team" | "event";
    event?: SearchEventHit;
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

/** `quiet`: no toast for a failed search, where the screen says so itself. */
export const useGlobalSearch = ({ quiet = false }: { quiet?: boolean } = {}) => {
    const { makeRequest, isSubmitting } = usePost();

    const search = useCallback(async (searchText: string): Promise<SearchResponse | undefined> => {
        return makeRequest<{ global_search_text: string }, SearchResponse>({
            apiEndpoint: PostEndpointUrl.GlobalSearch,
            payload: { global_search_text: searchText },
            showToast: false,
            quiet
        });
    }, [makeRequest, quiet]);

    return { search, isSubmitting };
};

/**
 * The search request for a query. The query is a path segment, so it is
 * encoded: unencoded, "#engineering" was cut at the "#" and answered 404,
 * "a/b" was a route that doesn't exist, and "50%" failed before it was sent.
 */
export const GlobalSearchGet = (searchText: string, within?: SearchWithin | null) => {
    const path = `${SearchGet.GlobalSearch}${encodeURIComponent(searchText.trim())}`;
    // In one conversation, when the search came from its header (QA F-15).
    return within ? `${path}?${withinParam(within)}` : path;
};

/**
 * The page of a search after the cursor a page answered with (its next), for
 * "Show more": the server asks the index for the hits after that page's last.
 */
export async function fetchSearchPage(searchText: string, after: string, within?: SearchWithin | null): Promise<SearchResponse> {
    const scope = within ? `&${withinParam(within)}` : "";
    const res = await axiosInstance.get(`${GlobalSearchGet(searchText)}?after=${encodeURIComponent(after)}${scope}`);
    const data = res.data?.data ?? {};
    return { page: data.page ?? [], has_more: !!data.has_more, next: data.next };
}
