"use client"

import { useSearchParams } from "next/navigation"
import { ScrollArea } from "@/components/ui/scroll-area"
import { LazySearchInput } from "@/components/ui/lazy-search-input"
import { ArrowLeft, ChevronDown, ChevronRight } from "@/lib/icons"
import { useRouter } from "next/navigation"
import { useCallback, useEffect, useMemo, useRef } from "react"
import { Button } from "@/components/ui/button"
import { useQuerySearch } from "@/hooks/useQuerySearch"
import { useFetchOnlyOnce } from "@/hooks/useFetch"
import { GetEndpointUrl } from "@/services/endPoints"
import type { UserProfileInterface } from "@/types/user"
import { searchResultKeys } from "@/lib/utils/helpers/search"
import { cn } from "@/lib/utils/helpers/cn"
import { WhoKnowsSlot } from "@/components/whoKnows/WhoKnowsSlot"
import { moveListFocus } from "@/lib/search/listFocus"
import { resultPath } from "@/lib/search/resultPath"
import { groupResults, isScope, visibleScopes } from "@/lib/search/scopes"
import type { QuerySort } from "@/lib/search/queryApi"
import { useFreeWords } from "@/hooks/useFreeWords"
import { HubRowSkeleton } from "@/components/ui/hubRow"
import { SpotSearchV3 } from "@/components/ui/graphics/hubSpots"
import { DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { ScopeChips } from "@/components/search/scopeChips"
import { SearchResultRow } from "@/components/search/searchResultRow"
import { ErrorState } from "@/components/ui/error-state"
import { readSearchWithin } from "@/lib/search/within"
import { addressLater } from "@/lib/navigation/addressLater"
import { useTabInAddress } from "@/components/task/tabInAddress"
import { SearchWithinChip, useWithinName } from "@/components/search/searchWithinChip"
import { lazyPart } from "@/lib/lazy/lazyPart"

const SORT_LABELS: Record<QuerySort, string> = { best: "best match", newest: "newest", oldest: "oldest" }

// The filter chips (with the grammar they write in) are a chunk of their own:
// the page is at its source ceiling (app/firstLoad.test.ts). So is Who knows'
// strip (WhoKnowsSlot). A
// part whose code can't come (offline) is nothing, and the page carries on:
// React.lazy threw to the page's error screen, and kept that failure for the
// rest of the visit, Try again included.
const queryFilters = lazyPart(() => import("@/components/search/queryFilters").then((m) => m.QueryFilters))

/**
 * The search page (design v3, hub.md S7–S13): a 52px header, the hub's 760px
 * column from the sheet's edge, a raised 44px field, the filters it holds as
 * chips, scope chips with their counts, the AI's answer, and the results as
 * two-line rows grouped by type. The text is read with the one grammar on the
 * server (docs C2-1): the counts are its honest counts (D-23), and what it
 * read differently from what was typed is said under the field.
 */
export default function SearchPage() {
    const searchParams = useSearchParams()
    // query is what the app links with; q is what people and browsers type.
    const query = searchParams.get("query") || searchParams.get("q") || ""
    // One conversation, when the search came from its header (QA F-15): said
    // as a chip, and kept as the address follows what is typed.
    const withinKey = searchParams.toString()
    const within = useMemo(() => readSearchWithin(new URLSearchParams(withinKey)), [withinKey])
    const withinName = useWithinName(within)
    const router = useRouter()

    const selfProfile = useFetchOnlyOnce<UserProfileInterface>(GetEndpointUrl.SelfProfile)
    const selfUUID = selfProfile.data?.data?.user_uuid || ""

    const initialScope = searchParams.get("in")
    const {
        inputValue,
        setInputValue,
        debouncedValue,
        results,
        resultsFor,
        scope,
        setScope,
        sort,
        setSort,
        counts,
        total,
        notes,
        isLoading,
        isRefreshing,
        isError,
        isRetrying,
        retry,
        handleResultClick,
        handlePreview,
        handleSearchSubmit,
        hasMore,
        loadMore,
        isLoadingMore,
    } = useQuerySearch({ initialQuery: query, initialScope: isScope(initialScope) ? initialScope : "all", debounceMs: 150, within })

    const inputRef = useRef<HTMLInputElement>(null)
    const listRef = useRef<HTMLDivElement>(null)
    // The address follows what is typed, so a reload and a shared link show
    // the search on screen: a moment after the last key, or at once for a
    // press, so a result clicked meanwhile still opens (addressLater). The
    // query this page wrote itself is remembered, so the address catching up
    // never rewrites the box while somebody types.
    const written = useRef(query)
    const toAddress = useTabInAddress()

    useEffect(() => {
        if (query === written.current) return
        written.current = query
        setInputValue(query)
    }, [query, setInputValue])

    // Merged into the address: the conversation searched stays; ?q= (as a
    // browser types it) and the opening scope (in) go.
    useEffect(() => {
        const next = inputValue.trim()
        if (next === written.current.trim()) return
        return addressLater(() => {
            written.current = next
            toAddress({ query: next || null, q: null, in: null })
        }, 150)
    }, [inputValue, toAddress])

    // Everywhere again: the same words, without the conversation.
    const searchEverywhere = useCallback(() => {
        const words = inputValue.trim()
        written.current = words
        router.replace(words ? `/app/search?query=${encodeURIComponent(words)}` : "/app/search", { scroll: false })
        inputRef.current?.focus()
    }, [inputValue, router])

    // "/" focuses the field from anywhere on the page that is not a field.
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return
            const t = e.target as HTMLElement | null
            if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return
            e.preventDefault()
            inputRef.current?.focus()
        }
        window.addEventListener("keydown", onKey)
        return () => window.removeEventListener("keydown", onKey)
    }, [])

    const shown = debouncedValue.trim()
    // The words without the filters: what the AI's answer, the connected
    // apps and Who knows search for, which read no modifiers.
    const words = useFreeWords(inputValue) ?? ""
    const shownWords = useFreeWords(shown)
    // The count names the words alone: a date or a person spelled out in it
    // wrapped the line at 390; the chips say those.
    const countWords = useFreeWords(resultsFor)
    // A filtered search's words wait for the grammar, and its count and list
    // wait with them: Who knows' place is settled before the first result
    // draws, so no result moves for it, and the count never says done over
    // rows still loading.
    const listLoading = isLoading || shownWords === undefined

    // The server sorts, and counts every chip, pages not fetched yet included.
    const chips = useMemo(() => visibleScopes(results, counts), [results, counts])
    const groups = useMemo(() => groupResults(results, scope, counts), [results, scope, counts])
    // Keyed by the hit, not its place: a refined query reorders the list.
    const keys = useMemo(() => {
        const all = searchResultKeys(results)
        return new Map(results.map((r, i) => [r, all[i]]))
    }, [results])

    const onSearchSubmit = (e: React.FormEvent) => {
        e.preventDefault()
        handleSearchSubmit()
    }

    // A filter chip writes its text, and the field keeps the caret.
    const writeFilters = useCallback((text: string) => {
        setInputValue(text)
        inputRef.current?.focus()
    }, [setInputValue])

    return (
        <div className="flex h-full flex-col overflow-hidden bg-background font-sans">
            {/* The header: 52px, a ghost back and the page's name. Not on a
                phone, whose top bar already says "Search". */}
            <div data-search-title-row="" className="hidden h-[52px] shrink-0 items-center gap-2 border-b border-line px-4 sm:flex md:pl-5">
                <Button variant="ghost" size="icon-sm" onClick={() => router.back()} aria-label="Go back" className="-ml-1">
                    <ArrowLeft className="size-4" />
                </Button>
                <h1 className="text-title-3 font-semibold text-foreground">Search</h1>
            </div>

            {/* Radix wraps the content in a display:table box that grows to its widest
                row, so a long result title pushed the whole column past a phone's edge. */}
            <ScrollArea className="flex-1 [&_[data-radix-scroll-area-viewport]>div]:!block">
                <div data-search-column="" className="max-w-[760px] px-4 pb-16 pt-4 md:px-6 md:pt-6">
                    <form onSubmit={onSearchSubmit} role="search" className="relative w-full">
                        <LazySearchInput
                            ref={inputRef}
                            size="lg"
                            value={inputValue}
                            onValueChange={setInputValue}
                            onKeyDown={(e) => {
                                if (e.key === "ArrowDown" && listRef.current) {
                                    e.preventDefault()
                                    moveListFocus(listRef.current, 1)
                                }
                            }}
                            aria-label="Search"
                            name="query"
                            placeholder={within ? `Search in ${withinName}…` : "Search messages, docs, tasks and people…"}
                            hint={<kbd className="kbd pointer-events-none me-0.5 hidden md:inline-flex">/</kbd>}
                        />
                    </form>

                    {/* The conversation searched, then the filter chips; the row keeps its height while they load, so nothing under it moves. */}
                    <div className="mt-3 flex min-h-[26px] flex-wrap items-center gap-1.5">
                        {within ? <SearchWithinChip name={withinName} onRemove={searchEverywhere} /> : null}
                        <queryFilters.Part text={inputValue} onChange={writeFilters} inConversation={!!within} />
                    </div>

                    {notes.length > 0 ? (
                        <ul data-search-notes="" aria-live="polite" className="mt-2 space-y-0.5 text-meta text-ink-3">
                            {notes.map((n) => (
                                <li key={n}>{n}</li>
                            ))}
                        </ul>
                    ) : null}

                    {shown && (results.length > 0 || isLoading) ? (
                        <div className="mt-3">
                            <ScopeChips scopes={chips} counts={counts} value={scope} onChange={setScope} />
                        </div>
                    ) : null}

                    {/* Always there, so the list does not drop when the count arrives. */}
                    <div className="mt-3 flex h-6 items-center gap-1 text-ui-sm text-ink-3 tabular-nums" aria-live="polite">
                        {!listLoading && results.length > 0 ? (
                            <>
                                <span data-search-count="" className="min-w-0 truncate">
                                    {total === 1 ? "1 result" : `${total.toLocaleString("en-GB")} results`}
                                    {countWords ? ` for “${countWords}”` : null}
                                </span>
                                <span aria-hidden>·</span>
                                <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                        <Button variant="ghost" size="xs" className="-ml-1 shrink-0 gap-0.5 text-ink-3">
                                            sorted by {SORT_LABELS[sort]}
                                            <ChevronDown className="size-3" />
                                        </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="start">
                                        <DropdownMenuRadioGroup value={sort} onValueChange={(v) => setSort(v as QuerySort)}>
                                            <DropdownMenuRadioItem value="best">Best match</DropdownMenuRadioItem>
                                            <DropdownMenuRadioItem value="newest">Newest</DropdownMenuRadioItem>
                                            <DropdownMenuRadioItem value="oldest">Oldest</DropdownMenuRadioItem>
                                        </DropdownMenuRadioGroup>
                                    </DropdownMenuContent>
                                </DropdownMenu>
                            </>
                        ) : null}
                    </div>

                    {/* Who knows about the words (DG9, both editions): not inside one conversation. */}
                    {!isError && !within && shownWords ? (
                        <WhoKnowsSlot words={shownWords} />
                    ) : null}

                    {listLoading ? (
                        <div role="status" aria-label="Searching across all records" className="mt-3">
                            {[0, 1, 2, 3, 4, 5].map((i) => (
                                <HubRowSkeleton key={i} density="two-line" />
                            ))}
                        </div>
                    ) : isError ? (
                        // In place of the results, never under an earlier query's (QA DSA-04).
                        <div data-search-error="">
                            <ErrorState subject={`results for “${shown}”`} onRetry={retry} retrying={isRetrying} />
                        </div>
                    ) : results.length > 0 ? (
                        <div
                            ref={listRef}
                            data-search-results=""
                            aria-busy={isRefreshing || undefined}
                            className={cn("mt-3 transition-opacity duration-150", isRefreshing && "opacity-60")}
                            onKeyDown={(e) => {
                                if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return
                                e.preventDefault()
                                if (!moveListFocus(e.currentTarget, e.key === "ArrowDown" ? 1 : -1) && e.key === "ArrowUp") inputRef.current?.focus()
                            }}
                        >
                            {groups.map((g) => (
                                <section key={g.scope} data-search-group={g.scope} aria-labelledby={`search-group-${g.scope}`} className="mb-4">
                                    <h2
                                        id={`search-group-${g.scope}`}
                                        className="hub-sticky-head sticky top-0 z-[3] flex h-8 items-center gap-2 pl-7 text-meta font-medium text-ink-3"
                                    >
                                        {g.label}
                                        <span className="font-book tabular-nums">{g.total.toLocaleString("en-GB")}</span>
                                    </h2>
                                    <ul>
                                        {g.rows.map((result) => {
                                            const href = resultPath(result, selfUUID) ?? undefined
                                            return <SearchResultRow key={keys.get(result)} result={result} onOpen={handleResultClick} onPreview={handlePreview} href={href} />
                                        })}
                                    </ul>
                                    {g.more ? (
                                        // A way to the kind's own list, so it reads as a link, apart from
                                        // Show more under it.
                                        <Button
                                            type="button"
                                            variant="link"
                                            size="sm"
                                            data-search-show-all={g.scope}
                                            onClick={() => setScope(g.scope)}
                                            className="ml-7 mt-1 h-auto gap-0.5 p-0 text-meta font-medium"
                                        >
                                            {g.more}
                                            <ChevronRight className="size-3.5" />
                                        </Button>
                                    ) : null}
                                </section>
                            ))}
                            {hasMore ? (
                                <div className="mb-4 pl-7">
                                    <Button
                                        type="button"
                                        variant="secondary"
                                        size="sm"
                                        data-search-show-more=""
                                        onClick={() => void loadMore?.()}
                                        disabled={isLoadingMore}
                                        busy={isLoadingMore}
                                    >
                                        {isLoadingMore ? "Loading more…" : "Show more"}
                                    </Button>
                                </div>
                            ) : null}
                            <p className="hidden pl-7 text-meta text-ink-3 md:flex md:items-center md:gap-1">
                                <kbd className="kbd">↑</kbd>
                                <kbd className="kbd">↓</kbd> to move through them
                            </p>
                        </div>
                    ) : !shown ? (
                        <div data-search-empty="blank" className="mt-12 flex flex-col items-start">
                            <SpotSearchV3 className="mb-4" />
                            <h2 className="text-heading font-semibold text-foreground">Search your workspace</h2>
                            <p className="mt-1 max-w-sm text-ui text-ink-2 text-pretty">
                                Find chats, posts, docs and people across everything you have access to.
                            </p>
                        </div>
                    ) : (
                        <div data-search-empty="none" className="mt-12 flex flex-col items-start">
                            <SpotSearchV3 className="mb-4" />
                            <h2 className="text-heading font-semibold text-foreground">Nothing matches “{shown}”</h2>
                            <p className="mt-1 max-w-sm text-ui text-ink-2 text-pretty">Check the spelling, or try fewer words.</p>
                        </div>
                    )}

                </div>
            </ScrollArea>
        </div>
    )
}
