"use client"

import { useCallback, useMemo, useState } from "react"
import { useAppRouter } from "@/lib/navigation/appRouter"
import useSWR from "swr"
import { useDebounce } from "@/hooks/useDebounce"
import { useSearchResultActions } from "@/hooks/useSearchResultActions"
import { querySearch, querySearchRequest, queryNotes, scopeTotals, shownCounts, type QuerySearchAnswer, type QuerySort } from "@/lib/search/queryApi"
import { searchWithinHref, type SearchWithin } from "@/lib/search/within"
import type { SearchScope } from "@/lib/search/scopes"
import type { SearchResult } from "@/services/searchService"

const NO_RESULTS: SearchResult[] = []

interface UseQuerySearchProps {
    initialQuery?: string
    /** The chip the page opens on (its address's in=). */
    initialScope?: SearchScope
    debounceMs?: number
    /** One conversation to search in (QA F-15); everything when unset. */
    within?: SearchWithin | null
}

/**
 * The search page's search on the one grammar (POST /query/search, docs
 * C2-1): the text is the server's to read, so a modifier typed or written by
 * a filter chip filters there, and the chips' counts are the server's honest
 * counts (D-23), never "20+". The chip on show and the order are the
 * server's to apply, page by page.
 *
 * As the palette's search does (hooks/useSearch.ts): the last answer stays up
 * while the next is on its way, never for a query whose search failed, and
 * the pages Show more fetched belong to the search they were fetched for.
 */
export function useQuerySearch({ initialQuery = "", initialScope = "all", debounceMs = 150, within = null }: UseQuerySearchProps = {}) {
    const [inputValue, setInputValue] = useState(initialQuery)
    const debouncedValue = useDebounce(inputValue, debounceMs)
    const router = useAppRouter()
    const q = debouncedValue.trim()
    const searching = q.length >= 2

    // A new query starts on All: a chip picked for the last words may hold nothing now.
    const [scopeState, setScopeState] = useState<{ q: string; scope: SearchScope }>({ q, scope: initialScope })
    const scope = scopeState.q === q ? scopeState.scope : "all"
    const setScope = useCallback((s: SearchScope) => setScopeState({ q, scope: s }), [q])
    const [sort, setSort] = useState<QuerySort>("best")

    const request = useMemo(() => (searching ? querySearchRequest(q, scope, sort, within) : null), [searching, q, scope, sort, within])
    const key = request ? `query-search ${JSON.stringify(request)}` : ""
    const { data, error, isLoading, mutate } = useSWR<QuerySearchAnswer>(key || null, () => querySearch(request!), {
        revalidateOnFocus: false,
        shouldRetryOnError: false,
    })
    const failed = searching && Boolean(error) && data === undefined

    // The last answer, with the search it answered, stays up while the next
    // is on its way (kept while rendering, as hooks/useSearch.ts does).
    const [last, setLast] = useState<{ key: string; q: string; data: QuerySearchAnswer } | null>(null)
    if (searching && data !== undefined && (last?.key !== key || last.data !== data)) {
        setLast({ key, q, data })
    }
    const answer = data !== undefined ? { key, q, data } : searching && !failed ? last : null
    const current = searching && answer?.key === key
    const firstPage = (searching && answer?.data.page) || NO_RESULTS

    // The pages Show more fetched after the first, for the search they were
    // fetched for; the newest page's counts are the ones shown (each page's
    // are counted again).
    const [more, setMore] = useState<{ key: string; rows: SearchResult[]; next?: string; hasMore: boolean; latest?: QuerySearchAnswer }>({ key: "", rows: [], hasMore: false })
    const [isLoadingMore, setIsLoadingMore] = useState(false)
    const ownMore = current && more.key === key
    const results = useMemo(() => (ownMore ? [...firstPage, ...more.rows] : firstPage), [ownMore, firstPage, more.rows])
    const hasMore = current && (ownMore ? more.hasMore : !!answer?.data.has_more)
    const nextCursor = !current ? undefined : ownMore ? more.next : answer?.data.next
    const latest = ownMore && more.latest ? more.latest : answer?.data

    const loadMore = useCallback(async () => {
        if (!hasMore || !nextCursor || isLoadingMore || !request) return
        setIsLoadingMore(true)
        try {
            const page = await querySearch({ ...request, after: nextCursor })
            setMore((m) => {
                const before = m.key === key ? m.rows : []
                return { key, rows: [...before, ...page.page], next: page.next, hasMore: page.has_more && !!page.next, latest: page }
            })
        } catch {
            // Show more stays; pressing it again asks again.
        } finally {
            setIsLoadingMore(false)
        }
    }, [hasMore, nextCursor, isLoadingMore, request, key])

    // The counts: the server's, and once every page is in, the rows (D-23).
    // While another search's answer stands in, its own counts do: the rows
    // it shows aren't this search's.
    const counts = useMemo(
        () => shownCounts(scopeTotals(latest?.totals ?? {}), results, scope, current ? hasMore : true),
        [latest, results, scope, current, hasMore],
    )
    const total = counts[scope]
    const shownAnswer = answer?.data
    const notes = useMemo(() => (current ? queryNotes(shownAnswer) : []), [current, shownAnswer])

    // Typing ahead of the search: no answer is due yet, so nothing is "not found".
    const pending = inputValue.trim().length >= 2 && inputValue.trim() !== q
    const asking = searching && isLoading && !failed
    const isSearching = (asking || pending) && results.length === 0
    const isRefreshing = (asking || pending) && results.length > 0

    const { handleResultClick, handlePreview } = useSearchResultActions()

    const handleSearchSubmit = useCallback((query?: string) => {
        const text = (query || inputValue).trim()
        if (text.length >= 2) router.push(within ? searchWithinHref(within, text) : `/app/search?query=${encodeURIComponent(text)}`)
    }, [inputValue, router, within])

    return {
        inputValue,
        setInputValue,
        debouncedValue,
        results,
        // The query the results answer: the one typed, or while its answer is on its way, the one before.
        resultsFor: answer?.q ?? "",
        scope,
        setScope,
        sort,
        setSort,
        // Each chip's count, and the count of the chip on show, as D-23 shows them.
        counts,
        total,
        // How the text was read, and what couldn't be applied, in the server's words.
        notes,
        isLoading: isSearching,
        isRefreshing,
        isError: failed,
        isRetrying: failed && isLoading,
        retry: () => void mutate(),
        handleResultClick,
        handlePreview,
        handleSearchSubmit,
        hasMore,
        loadMore,
        isLoadingMore,
    }
}
