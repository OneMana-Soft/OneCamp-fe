"use client"

import { useState, useCallback, useEffect, useMemo } from "react"
import { useRouter } from "next/navigation"
import { useDispatch } from "react-redux"
import {useFetch, useFetchOnlyOnce} from "@/hooks/useFetch"
import { useDebounce } from "@/hooks/useDebounce"
import { fetchSearchPage, GlobalSearchGet, SearchResult } from "@/services/searchService"
import { searchWithinHref, withinParam, type SearchWithin } from "@/lib/search/within"
import { openUI } from "@/store/slice/uiSlice"
import type {UserProfileInterface} from "@/types/user";
import {GetEndpointUrl} from "@/services/endPoints";
import { resultPath } from "@/lib/search/resultPath";
import { getAttachmentLightboxData } from "@/lib/utils/helpers/search";

const NO_RESULTS: SearchResult[] = []

interface UseSearchProps {
    initialQuery?: string;
    debounceMs?: number;
    /** One conversation to search in (QA F-15); everything when unset. */
    within?: SearchWithin | null;
}

export const useSearch = ({ 
    initialQuery = "", 
    debounceMs = 300,
    within = null,
}: UseSearchProps = {}) => {
    const [inputValue, setInputValue] = useState(initialQuery)
    const debouncedValue = useDebounce(inputValue, debounceMs)
    const [open, setOpen] = useState(false)
    const router = useRouter()
    const selfProfile = useFetchOnlyOnce<UserProfileInterface>(GetEndpointUrl.SelfProfile)
    const dispatch = useDispatch()

    const searching = debouncedValue.trim().length >= 2
    const q = debouncedValue.trim()
    // A query in a conversation is its own search (QA F-15): its answer, and
    // the pages Show more fetches for it, never join the same words searched
    // everywhere.
    const key = q + (within ? `\u0000${withinParam(within)}` : "")
    // This query's own answer, and only its own: no other query's answer
    // stands in for it in SWR's cache (keepPreviousData did, and a failed
    // search kept the last query's results under the new query's heading,
    // QA DSA-04).
    const { data: searchData, isLoading, isError, mutate: retrySearch } = useFetch<any>(
        searching ? GlobalSearchGet(debouncedValue, within) : "",
        undefined,
        { revalidateOnFocus: false },
    )
    // This query's search failed, whatever an earlier one found.
    const failed = searching && Boolean(isError) && searchData === undefined

    // The last answer, with the query it answered, stays up while the next one
    // is on its way. Each new query was a new key with nothing in it, so the
    // results blinked to a skeleton and back on every pause in typing, and the
    // command palette swapped its commands in and out under the cursor. It
    // never stands in for a query whose search failed.
    // Kept as the answer arrives, while rendering (React's "information from
    // previous renders"): an effect would cost the palette a commit a key.
    // Kept as it is while it holds the same page.
    const [last, setLast] = useState<{ key: string; q: string; data: any } | null>(null)
    if (searching && searchData !== undefined && (last?.key !== key || last.data?.data?.page !== searchData?.data?.page)) {
        setLast({ key, q, data: searchData })
    }
    const answer = searchData !== undefined ? { key, q, data: searchData } : searching && !failed ? last : null
    // The shown results answer the query being searched (not one before it).
    const current = searching && answer?.key === key

    // One empty list, so a list with nothing in it is the same list each render.
    const firstPage: SearchResult[] = (searching && answer?.data?.data?.page) || NO_RESULTS

    // The pages "Show more" fetched after the first, for the query they were
    // fetched for: a new query starts from its own first page. The page used
    // to say "20 results" for the first 20 of any number, with no way on.
    const [more, setMore] = useState<{ key: string; rows: SearchResult[]; next?: string; hasMore: boolean }>({ key: "", rows: [], hasMore: false })
    const [isLoadingMore, setIsLoadingMore] = useState(false)
    // Show more has answered for this query, even with nothing.
    const ownMore = current && more.key === key
    const results: SearchResult[] = useMemo(() => (ownMore ? [...firstPage, ...more.rows] : firstPage), [ownMore, firstPage, more.rows])
    // Only the query's own first page goes on to its next: an earlier query's
    // cursor would fetch that query's second page under this one.
    const hasMore = current && (ownMore ? more.hasMore : !!answer?.data?.data?.has_more)
    const nextCursor: string | undefined = !current ? undefined : ownMore ? more.next : answer?.data?.data?.next

    const loadMore = useCallback(async () => {
        if (!hasMore || !nextCursor || isLoadingMore) return
        setIsLoadingMore(true)
        try {
            const page = await fetchSearchPage(debouncedValue.trim(), nextCursor, within)
            setMore((m) => {
                const before = m.key === key ? m.rows : []
                return { key, rows: [...before, ...page.page], next: page.next, hasMore: page.has_more && !!page.next }
            })
        } catch {
            // Show more stays; pressing it again asks again.
        } finally {
            setIsLoadingMore(false)
        }
    }, [hasMore, nextCursor, isLoadingMore, key, debouncedValue, within])
    // Typing ahead of the search: the pause it waits for (debounceMs) hasn't
    // come yet, so no answer is due. Until it is, nothing is "not found": the
    // palette said "Nothing called “Wh”" between two keystrokes.
    const pending = inputValue.trim().length >= 2 && inputValue.trim() !== debouncedValue.trim()
    // Waiting with nothing to show yet (a first search, not a refinement), and
    // refreshing while an older answer shows, which lists dim. A failed search
    // being asked again stays failed until it answers (isRetrying), so the
    // page doesn't flicker between its error and a skeleton.
    const asking = searching && isLoading && !failed
    const isSearching = (asking || pending) && results.length === 0
    const isRefreshing = (asking || pending) && results.length > 0

    useEffect(() => {
        if (inputValue && debouncedValue) {
            setOpen(true)
        } else if (!inputValue) {
            setOpen(false)
        }
    }, [inputValue, debouncedValue])

    const handleClear = useCallback(() => {
        setInputValue("")
        setOpen(false)
    }, [])

    // A search narrowed to one conversation stays narrowed (QA F-15): Enter
    // in its field opened the whole workspace's search for the same words.
    const handleSearchSubmit = useCallback((query?: string) => {
        const searchQuery = (query || inputValue).trim()
        if (searchQuery.length >= 2) {
            setOpen(false)
            router.push(within ? searchWithinHref(within, searchQuery) : `/app/search?query=${encodeURIComponent(searchQuery)}`)
        }
    }, [inputValue, router, within])

    // One mapping for where a hit opens (resultPath), as the page's links and
    // the palette's rows use: this switch spelled it out a second time, and
    // sent a DM message to /app/chat/<message id>. A person opens their card.
    const handleResultClick = useCallback((result: SearchResult) => {
        setOpen(false)
        setInputValue("")

        if (result.type === "user") {
            dispatch(openUI({ key: 'otherUserProfile', data: { userUUID: result.user?.user_id } }))
            return
        }
        const path = resultPath(result, selfProfile.data?.data.user_uuid || "")
        if (path) router.push(path)
    }, [router, dispatch, selfProfile.data?.data.user_uuid])

    const handlePreview = useCallback((result: SearchResult) => {
        const lightboxData = getAttachmentLightboxData(result, selfProfile.data?.data.user_uuid || "")
        if (lightboxData) {
            dispatch(openUI({
                key: 'attachmentLightbox',
                data: lightboxData
            }))
        }
    }, [dispatch, selfProfile.data?.data.user_uuid])

    return {
        inputValue,
        setInputValue,
        debouncedValue,
        results,
        // The query the results answer: the one typed, or while its answer is
        // on its way, the one before.
        resultsFor: answer?.q ?? "",
        isLoading: isSearching,
        isRefreshing,
        // This query's search failed, so the page says so rather than
        // "nothing matches", and shows no earlier query's results.
        isError: failed,
        // Try again is under way.
        isRetrying: failed && isLoading,
        retry: () => void retrySearch(),
        open,
        setOpen,
        handleClear,
        handleResultClick,
        handlePreview,
        handleSearchSubmit,
        // More than these: "20+ results", and Show more fetches the next page.
        hasMore,
        loadMore,
        isLoadingMore,
    }
}
