"use client"

import { useSearchParams } from "next/navigation"
import { ScrollArea } from "@/components/ui/scroll-area"
import { SkeletonRows } from "@/components/ui/skeletonRows"
import { Search, ArrowLeft, X, Eye } from "@/lib/icons";
import { useRouter } from "next/navigation"
import { useEffect } from "react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { useSearch } from "@/hooks/useSearch"
import { useFetchOnlyOnce } from "@/hooks/useFetch"
import { GetEndpointUrl } from "@/services/endPoints"
import type { UserProfileInterface } from "@/types/user"
import { getIcon, getHighlightedTitle, getHighlightedContext, isResultPreviewable } from "@/lib/utils/helpers/search"
import ConnectorSearchResults from "@/components/ai/ConnectorSearchResults"
import SearchAnswer from "@/components/ai/SearchAnswer"

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
        results,
        isLoading,
        handleResultClick,
        handlePreview,
        handleSearchSubmit
    } = useSearch({ initialQuery: query })

    useEffect(() => {
        setInputValue(query)
    }, [query, setInputValue])

    const onSearchSubmit = (e: React.FormEvent) => {
        e.preventDefault()
        handleSearchSubmit()
    }

    return (
        <div className="flex flex-col h-full bg-background overflow-hidden font-sans">
            {/* Header with Search Group */}
            <div className="flex flex-col gap-3 p-4 md:px-6 md:pt-6 md:pb-4 border-b sticky top-0 z-10 bg-background">
                <div className="flex items-center gap-3">
                    <Button 
                        variant="ghost" 
                        size="icon" 
                        onClick={() => router.back()}
                        aria-label="Go back"
                        className="h-8 w-8 shrink-0"
                    >
                        <ArrowLeft className="h-4 w-4" />
                    </Button>
                    <h1 className="text-xl font-semibold text-foreground truncate">
                        {query ? `Results for “${query}”` : "Search"}
                    </h1>
                </div>

                <form onSubmit={onSearchSubmit} className="relative w-full max-w-2xl">
                    <div className="relative group">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground group-focus-within:text-foreground transition-colors" />
                        <Input
                            value={inputValue}
                            onChange={(e) => setInputValue(e.target.value)}
                            aria-label="Search"
                            type="search"
                            className="pl-9 pr-10 h-10 w-full bg-background focus-visible:ring-offset-0 [&::-webkit-search-cancel-button]:hidden"
                            placeholder="Search for chats, posts, docs, or people…"
                        />
                        {inputValue && (
                            <button
                                type="button"
                                aria-label="Clear search"
                                onClick={() => setInputValue("")}
                                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-sm hover:bg-muted text-muted-foreground transition-colors"
                            >
                                <X className="h-4 w-4" />
                            </button>
                        )}
                    </div>
                </form>
                
                {!isLoading && results.length > 0 && (
                    <p className="text-xs text-muted-foreground tabular-nums" aria-live="polite">
                        {results.length === 1 ? "1 result" : `${results.length} results`}
                    </p>
                )}
            </div>

            <ScrollArea className="flex-1">
                <div className="max-w-3xl p-2 md:px-4 md:py-3 space-y-3">
                    <SearchAnswer query={inputValue} selfUUID={selfUUID} />
                    {isLoading ? (
                        /* Shaped like the result rows below, so the list does not
                           jump when matches arrive. The announcement carries the
                           wording the spinner used to show. */
                        <div role="status" aria-label="Searching across all records">
                            <SkeletonRows rows={5} />
                        </div>
                    ) : results.length > 0 ? (
                        /* Results are rows, not cards: a monochrome glyph for
                           the kind, the title, and where it is from. The kind
                           used to be said three times over (a tinted icon tile,
                           an uppercase pill, then the context line), and every
                           row was a box that turned orange under the pointer. */
                        <ul className="divide-y divide-border/60">
                            {results.map((result, idx) => (
                                <li
                                    key={idx}
                                    className="group relative flex items-start gap-3 rounded-md px-2 py-3 transition-colors duration-150 hover:bg-accent/60 focus-within:bg-accent/60"
                                >
                                    <div className="mt-0.5 shrink-0 text-muted-foreground" aria-hidden="true">
                                        {getIcon(result, "h-4 w-4")}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <h3 className="text-sm font-medium text-foreground line-clamp-1">
                                            {/* The title is the row's one control; it stretches over the row. */}
                                            <button
                                                type="button"
                                                onClick={() => handleResultClick(result)}
                                                className="text-left after:absolute after:inset-0 after:rounded-md focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-ring/50"
                                            >
                                                {getHighlightedTitle(result)}
                                            </button>
                                        </h3>
                                        <div className="mt-0.5 text-xs text-muted-foreground line-clamp-2">
                                            {getHighlightedContext(result)}
                                        </div>
                                    </div>
                                    {isResultPreviewable(result) && (
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            onClick={(e) => {
                                                e.stopPropagation()
                                                handlePreview(result)
                                            }}
                                            aria-label="Preview attachment"
                                            className="relative z-[1] h-8 w-8 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 hover:text-foreground"
                                        >
                                            <Eye className="h-4 w-4" />
                                        </Button>
                                    )}
                                </li>
                            ))}
                        </ul>
                    ) : !query ? (
                        <div className="px-2 py-16">
                            <h2 className="text-base font-semibold text-foreground">Search your workspace</h2>
                            <p className="mt-1 max-w-sm text-sm text-muted-foreground text-pretty">
                                Find chats, posts, docs and people across everything you have access to.
                            </p>
                        </div>
                    ) : (
                        <div className="px-2 py-16">
                            <h2 className="text-base font-semibold text-foreground">Nothing matches “{query}”</h2>
                            <p className="mt-1 max-w-sm text-sm text-muted-foreground text-pretty">
                                Check the spelling, or try a shorter word. Search covers what you can open, so a private channel you are not in won’t show.
                            </p>
                            {query && (
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="mt-4"
                                    onClick={() => setInputValue("")}
                                >
                                    Clear search
                                </Button>
                            )}
                        </div>
                    )}

                    <ConnectorSearchResults query={inputValue} />
                </div>
            </ScrollArea>
        </div>
    )
}
