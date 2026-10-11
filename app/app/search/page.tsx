"use client"

import { useSearchParams } from "next/navigation"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Search, ArrowLeft, X, ChevronDown } from "@/lib/icons"
import { useRouter } from "next/navigation"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { useSearch } from "@/hooks/useSearch"
import { useFetchOnlyOnce } from "@/hooks/useFetch"
import { GetEndpointUrl } from "@/services/endPoints"
import type { UserProfileInterface } from "@/types/user"
import { searchResultKeys } from "@/lib/utils/helpers/search"
import { cn } from "@/lib/utils/helpers/cn"
import { moveListFocus } from "@/lib/search/listFocus"
import { resultPath } from "@/lib/search/resultPath"
import { groupResults, isScope, scopeCounts, sortResults, visibleScopes, type SearchScope, type SearchSort } from "@/lib/search/scopes"
import { HubRowSkeleton } from "@/components/ui/hubRow"
import { SpotSearchV3 } from "@/components/ui/graphics/hubSpots"
import { DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { ScopeChips } from "@/components/search/scopeChips"
import { SearchResultRow } from "@/components/search/searchResultRow"

/**
 * The search page (design v3, hub.md S7–S13): a 52px header, the hub's 760px
 * column from the sheet's edge, a raised 44px field, scope chips with their
 * counts, and the results as two-line rows grouped by type.
 */
export default function SearchPage() {
    const searchParams = useSearchParams()
    // query is what the app links with; q is what people and browsers type.
    const query = searchParams.get("query") || searchParams.get("q") || ""
    const router = useRouter()

    const selfProfile = useFetchOnlyOnce<UserProfileInterface>(GetEndpointUrl.SelfProfile)
    const selfUUID = selfProfile.data?.data?.user_uuid || ""

    const {
        inputValue,
        setInputValue,
        debouncedValue,
        results,
        isLoading,
        isRefreshing,
        isError,
        retry,
        handleResultClick,
        handlePreview,
        handleSearchSubmit
    } = useSearch({ initialQuery: query, debounceMs: 150 })

    const inputRef = useRef<HTMLInputElement>(null)
    const listRef = useRef<HTMLDivElement>(null)
    // The address follows what is typed, so a reload and a shared link show
    // the search on screen. The query this page wrote itself is remembered, so
    // the address catching up never rewrites the box while somebody types.
    const written = useRef(query)

    useEffect(() => {
        if (query === written.current) return
        written.current = query
        setInputValue(query)
    }, [query, setInputValue])

    useEffect(() => {
        const next = debouncedValue.trim()
        if (next === written.current.trim()) return
        written.current = next
        router.replace(next ? `/app/search?query=${encodeURIComponent(next)}` : "/app/search", { scroll: false })
    }, [debouncedValue, router])

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
    const initialScope = searchParams.get("in")
    const [scopeState, setScopeState] = useState<{ q: string; scope: SearchScope }>({ q: shown, scope: isScope(initialScope) ? initialScope : "all" })
    // A new query starts on All: a scope picked for the last words may hold nothing now.
    const scope = scopeState.q === shown ? scopeState.scope : "all"
    const setScope = useCallback((s: SearchScope) => setScopeState({ q: shown, scope: s }), [shown])
    const [sort, setSort] = useState<SearchSort>("best")

    const sorted = useMemo(() => sortResults(results, sort), [results, sort])
    const counts = useMemo(() => scopeCounts(results), [results])
    const chips = useMemo(() => visibleScopes(results), [results])
    const groups = useMemo(() => groupResults(sorted, scope), [sorted, scope])
    // Keyed by the hit, not its place: a refined query reorders the list.
    const keys = useMemo(() => {
        const all = searchResultKeys(results)
        return new Map(results.map((r, i) => [r, all[i]]))
    }, [results])

    const onSearchSubmit = (e: React.FormEvent) => {
        e.preventDefault()
        handleSearchSubmit()
    }

    const total = scope === "all" ? results.length : counts[scope]

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
                        <div data-search-field="" className="hub-field relative flex h-11 items-center rounded-[10px]">
                            <Search className="pointer-events-none absolute left-3.5 size-[18px] text-ink-3" aria-hidden />
                            <input
                                ref={inputRef}
                                value={inputValue}
                                onChange={(e) => setInputValue(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === "ArrowDown" && listRef.current) {
                                        e.preventDefault()
                                        moveListFocus(listRef.current, 1)
                                    }
                                }}
                                aria-label="Search"
                                type="search"
                                name="query"
                                autoComplete="off"
                                placeholder="Search messages, docs, tasks and people…"
                                className="h-full w-full rounded-[10px] bg-transparent pl-11 pr-11 text-base text-foreground outline-none placeholder:text-ink-3 [&::-webkit-search-cancel-button]:hidden"
                            />
                            {inputValue ? (
                                <button
                                    type="button"
                                    aria-label="Clear search"
                                    onClick={() => {
                                        setInputValue("")
                                        inputRef.current?.focus()
                                    }}
                                    className="absolute right-2.5 grid size-6 place-items-center rounded-sm text-ink-3 transition-colors hover:bg-hover hover:text-foreground focus-visible:outline-2 focus-visible:outline-brand"
                                >
                                    <X className="size-4" />
                                </button>
                            ) : (
                                <kbd className="kbd pointer-events-none absolute right-3 hidden md:inline-flex">/</kbd>
                            )}
                        </div>
                    </form>

                    {shown && (results.length > 0 || isLoading) ? (
                        <div className="mt-3">
                            <ScopeChips scopes={chips} counts={counts} value={scope} onChange={setScope} />
                        </div>
                    ) : null}

                    {/* Always there, so the list does not drop when the count arrives. */}
                    <div className="mt-3 flex h-6 items-center gap-1 text-ui-sm text-ink-3 tabular-nums" aria-live="polite">
                        {!isLoading && results.length > 0 ? (
                            <>
                                <span data-search-count="">
                                    {total === 1 ? "1 result" : `${total} results`} for “{shown}”
                                </span>
                                <span aria-hidden>·</span>
                                <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                        <Button variant="ghost" size="xs" className="-ml-1 gap-0.5 text-ink-3">
                                            sorted by {sort === "best" ? "best match" : "newest"}
                                            <ChevronDown className="size-3" />
                                        </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="start">
                                        <DropdownMenuRadioGroup value={sort} onValueChange={(v) => setSort(v as SearchSort)}>
                                            <DropdownMenuRadioItem value="best">Best match</DropdownMenuRadioItem>
                                            <DropdownMenuRadioItem value="newest">Newest</DropdownMenuRadioItem>
                                        </DropdownMenuRadioGroup>
                                    </DropdownMenuContent>
                                </DropdownMenu>
                            </>
                        ) : null}
                    </div>

                    {isLoading ? (
                        <div role="status" aria-label="Searching across all records" className="mt-3">
                            {[0, 1, 2, 3, 4, 5].map((i) => (
                                <HubRowSkeleton key={i} density="two-line" />
                            ))}
                        </div>
                    ) : isError ? (
                        <div data-search-error="" className="mt-6 flex items-center gap-3 rounded-lg bg-sunken px-4 py-3">
                            <p className="flex-1 text-ui text-ink-2">Search isn’t answering right now.</p>
                            <Button variant="ghost" size="sm" onClick={retry}>
                                Try again
                            </Button>
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
                                        className="hub-sticky-head sticky top-0 z-[3] flex h-8 items-center gap-2 pl-12 text-meta font-medium text-ink-3"
                                    >
                                        {g.label}
                                        <span className="font-book tabular-nums">{g.total}</span>
                                    </h2>
                                    <ul>
                                        {g.rows.map((result) => {
                                            const href = resultPath(result, selfUUID) ?? undefined
                                            return <SearchResultRow key={keys.get(result)} result={result} onOpen={handleResultClick} onPreview={handlePreview} href={href} />
                                        })}
                                    </ul>
                                    {g.more ? (
                                        <button
                                            type="button"
                                            data-search-show-all={g.scope}
                                            onClick={() => setScope(g.scope)}
                                            className="ml-12 mt-1 text-meta font-medium text-ink-2 transition-colors hover:text-foreground"
                                        >
                                            {g.more}
                                        </button>
                                    ) : null}
                                </section>
                            ))}
                            <p className="hidden pl-12 text-meta text-ink-3 md:flex md:items-center md:gap-1">
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
