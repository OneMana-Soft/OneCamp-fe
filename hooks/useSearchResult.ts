"use client"

import { useState, useEffect, useMemo, useCallback, useRef } from "react"
import { debounceUtil } from "@/lib/utils/helpers/debounce"
import {SearchableItem} from "@/types/search";

interface UseSearchResultsProps<T extends SearchableItem> {
    query: string
    onSearch: (query: string) => Promise<T[]>
    selectedItems: T[]
    debounceTime?: number
}

export function useSearchResults<T extends SearchableItem>({
                                                               query,
                                                               onSearch,
                                                               selectedItems,
                                                               debounceTime = 300,
                                                           }: UseSearchResultsProps<T>) {
    const [allResults, setAllResults] = useState<T[]>([])
    const [isLoading, setIsLoading] = useState(false)

    // Use a ref to store the onSearch function to avoid recreating the debounced function
    const onSearchRef = useRef(onSearch)

    // Update the ref when onSearch changes
    useEffect(() => {
        onSearchRef.current = onSearch
    }, [onSearch])

    // Create a stable function that uses the ref
    const handleSearch = useCallback(
        (...args: unknown[]) => {
            const searchQuery = args[0] as string

            if (!searchQuery || !searchQuery.trim()) {
                setAllResults([])
                setIsLoading(false)
                return
            }

            setIsLoading(true)

            onSearchRef
                .current(searchQuery)
                .then((results) => {
                    setAllResults(results)
                })
                .catch((error) => {
                    console.error("Error searching:", error)
                    setAllResults([])
                })
                .finally(() => {
                    setIsLoading(false)
                })
        },
        [], // Empty dependency array since we use the ref
    )

    // Create the debounced function with stable dependencies
    const debouncedSearch = useMemo(() => debounceUtil(handleSearch, debounceTime), [handleSearch, debounceTime])
    useEffect(() => debouncedSearch.cancel, [debouncedSearch])

    // Call the debounced function when query changes
    useEffect(() => {
        if (query.trim()) {
            debouncedSearch(query)
        } else {
            setAllResults([])
            setIsLoading(false)
        }
    }, [query, debouncedSearch])

    // Filter out already selected items
    const filteredResults = useMemo(() => {
        const selectedIds = new Set(selectedItems.map((item) => item.id))
        return allResults.filter((item) => !selectedIds.has(item.id))
    }, [allResults, selectedItems])

    return {
        results: allResults,
        isLoading,
        filteredResults,
    }
}
