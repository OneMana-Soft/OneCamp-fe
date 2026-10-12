"use client"

import { useState, useCallback, useEffect } from "react"
import { useRouter } from "next/navigation"
import { useDispatch } from "react-redux"
import {useFetch, useFetchOnlyOnce} from "@/hooks/useFetch"
import { useDebounce } from "@/hooks/useDebounce"
import { GlobalSearchGet, SearchResult } from "@/services/searchService"
import { openUI } from "@/store/slice/uiSlice"
import type {UserProfileInterface} from "@/types/user";
import {GetEndpointUrl} from "@/services/endPoints";
import { resultPath } from "@/lib/search/resultPath";
import { getAttachmentLightboxData } from "@/lib/utils/helpers/search";

const NO_RESULTS: SearchResult[] = []

interface UseSearchProps {
    initialQuery?: string;
    debounceMs?: number;
    syncWithUrl?: boolean;
}

export const useSearch = ({ 
    initialQuery = "", 
    debounceMs = 300,
    syncWithUrl = false 
}: UseSearchProps = {}) => {
    const [inputValue, setInputValue] = useState(initialQuery)
    const debouncedValue = useDebounce(inputValue, debounceMs)
    const [open, setOpen] = useState(false)
    const router = useRouter()
    const selfProfile = useFetchOnlyOnce<UserProfileInterface>(GetEndpointUrl.SelfProfile)
    const dispatch = useDispatch()

    const searching = debouncedValue.trim().length >= 2
    // The last answer stays up while the next one is on its way. Each new
    // query was a new key with nothing in it, so the results blinked to a
    // skeleton and back on every pause in typing, and the command palette
    // swapped its commands in and out under the cursor.
    const { data: searchData, isLoading, isError, mutate: retrySearch } = useFetch<any>(
        searching ? GlobalSearchGet(debouncedValue) : "",
        undefined,
        { keepPreviousData: true, revalidateOnFocus: false },
    )

    // One empty list, so a list with nothing in it is the same list each render.
    const results: SearchResult[] = (searching && searchData?.data?.page) || NO_RESULTS
    // Waiting with nothing to show yet (a first search, not a refinement), and
    // refreshing while an older answer shows, which lists dim.
    const isSearching = searching && isLoading && results.length === 0
    const isRefreshing = searching && isLoading && results.length > 0

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

    const handleSearchSubmit = useCallback((query?: string) => {
        const searchQuery = query || inputValue
        if (searchQuery.trim().length >= 2) {
            setOpen(false)
            router.push(`/app/search?query=${encodeURIComponent(searchQuery.trim())}`)
        }
    }, [inputValue, router])

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
        isLoading: isSearching,
        isRefreshing,
        // A failed search, so the page can say so rather than "nothing matches".
        isError: searching && Boolean(isError) && results.length === 0,
        retry: () => void retrySearch(),
        open,
        setOpen,
        handleClear,
        handleResultClick,
        handlePreview,
        handleSearchSubmit
    }
}
