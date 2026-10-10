"use client"

import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils/helpers/cn"
import { useRef, memo, useCallback, useMemo } from "react"
import { X, Search, Eye } from "@/lib/icons";
import { SearchResult } from "@/services/searchService"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { SkeletonRows } from "@/components/ui/skeletonRows"
import { useSearch } from "@/hooks/useSearch"
import { getIcon, getHighlightedTitle, getContext, isResultPreviewable, searchResultKeys } from "@/lib/utils/helpers/search"
import { moveListFocus } from "@/lib/search/listFocus"

const SearchResultItem = memo(({ result, onClick, onPreview }: { result: SearchResult, onClick: (result: SearchResult) => void, onPreview: (result: SearchResult) => void }) => {
    const isPreviewable = isResultPreviewable(result)

    return (
        // A row, and a real button: it was a div with a click handler, so a
        // result could be clicked but never reached from the keyboard. The type
        // is said by the icon and the line under the title ("Task assigned
        // to…"), not again in a capitals badge above it; the hover is a neutral step, not the accent.
        <div className="group flex items-center gap-1 rounded-md hover:bg-highlight focus-within:bg-highlight transition-colors">
            <button
                type="button"
                data-search-result=""
                onClick={() => onClick(result)}
                className="flex min-w-0 flex-1 items-center gap-3 rounded-md px-2.5 py-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70"
            >
                <span className="shrink-0" aria-hidden="true">
                    {getIcon(result)}
                </span>
                <span className="flex-1 min-w-0">
                    <span className="block text-sm font-medium text-foreground truncate">
                        {getHighlightedTitle(result)}
                    </span>
                    <span className="block text-2xs text-muted-foreground truncate">
                        {getContext(result)}
                    </span>
                </span>
            </button>
            {isPreviewable && (
                <button
                    onClick={(e) => {
                        e.stopPropagation()
                        onPreview(result)
                    }}
                    className="mr-1 p-2 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto focus-visible:opacity-100 focus-visible:pointer-events-auto [@media(hover:none)]:opacity-100 [@media(hover:none)]:pointer-events-auto"
                    aria-label="Preview attachment"
                    title="Preview attachment"
                >
                    <Eye className="h-4 w-4" />
                </button>
            )}
        </div>
    )
})
SearchResultItem.displayName = "SearchResultItem"

export default function DesktopNavigationSearch() {
    const searchRef = useRef<HTMLInputElement>(null)
    const listRef = useRef<HTMLDivElement>(null)
    const {
        inputValue,
        setInputValue,
        results,
        isLoading,
        isRefreshing,
        open,
        setOpen,
        handleClear,
        handleResultClick,
        handlePreview,
        handleSearchSubmit
    } = useSearch()
    const keys = useMemo(() => searchResultKeys(results), [results])

    // Note: Ctrl+K now opens the global Command Palette instead of focusing this input.

    const onClear = useCallback(() => {
        handleClear()
        searchRef.current?.focus()
    }, [handleClear])

    // Down from the box into the results and back up out of them, as in the
    // palette: the dropdown could be reached only with Tab, row by row.
    const handleKeyDownCapture = useCallback((e: React.KeyboardEvent) => {
        if (e.key === "Enter") {
            handleSearchSubmit()
        } else if (e.key === "ArrowDown" && listRef.current) {
            e.preventDefault()
            moveListFocus(listRef.current, 1)
        } else if (e.key === "Escape") {
            setOpen(false)
        }
    }, [handleSearchSubmit, setOpen])

    const onListKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
        if (e.key === "Escape") {
            setOpen(false)
            searchRef.current?.focus()
            return
        }
        if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return
        e.preventDefault()
        if (!moveListFocus(e.currentTarget, e.key === "ArrowDown" ? 1 : -1) && e.key === "ArrowUp") searchRef.current?.focus()
    }, [setOpen])

    return (
        <div className="w-full max-w-[500px] font-sans">
            <Popover open={open && !!inputValue} onOpenChange={setOpen}>
                <PopoverTrigger asChild>
                    <div className="relative group">
                        <Search aria-hidden="true" className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                        <Input
                            ref={searchRef}
                            type="search"
                            // Says what it searches. "Global Search" named the
                            // feature, in title case, rather than the task.
                            placeholder="Search messages, docs and tasks…"
                            aria-label="Search messages, docs and tasks"
                            autoComplete="off"
                            value={inputValue}
                            onChange={(e) => setInputValue(e.target.value)}
                            onKeyDown={handleKeyDownCapture}
                            onFocus={() => inputValue && setOpen(true)}
                            className={cn(
                                "h-9 w-full pl-9 pr-9",
                                "text-sm placeholder:text-muted-foreground",
                                "rounded-md border-border bg-background/60",
                                "focus-visible:bg-background",
                                "transition-colors duration-150",
                                "[&::-webkit-search-cancel-button]:appearance-none"
                            )}
                        />
                        <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-2">
                            {inputValue && (
                                <button
                                    onClick={onClear}
                                    className="p-1 rounded-md hover:bg-muted text-muted-foreground transition-colors cursor-pointer"
                                    aria-label="Clear search"
                                >
                                    <X className="h-4 w-4" />
                                </button>
                            )}
                            {/*
                              No kbd hint here. Ctrl/⌘+K opens the global
                              Command Palette, NOT this input — surfacing
                              the shortcut here would mislead users into
                              expecting the input to focus.
                            */}
                        </div>
                    </div>
                </PopoverTrigger>
                <PopoverContent
                    className="w-[500px] p-0 shadow-overlay border-border bg-background rounded-lg overflow-hidden"
                    align="start"
                    onOpenAutoFocus={(e) => e.preventDefault()}
                >
                    <div className="max-h-[450px] overflow-y-auto w-full scroll-smooth">
                        {inputValue && (
                            <div className="p-2">
                                {isLoading ? (
                                    <div role="status" aria-label="Searching records">
                                        <SkeletonRows rows={4} lines={1} />
                                    </div>
                                ) : results.length > 0 ? (
                                    <div ref={listRef} onKeyDown={onListKeyDown} aria-busy={isRefreshing || undefined} className={cn("space-y-1 transition-opacity duration-150", isRefreshing && "opacity-60")}>
                                        {results.map((result, idx) => (
                                            <SearchResultItem
                                                // By what it is, not where it sits: a
                                                // refined query reorders the list, and
                                                // keyed by position every row re-rendered
                                                // as somebody else's.
                                                key={keys[idx]}
                                                result={result}
                                                onClick={handleResultClick}
                                                onPreview={handlePreview}
                                            />
                                        ))}
                                        <button
                                            type="button"
                                            data-search-result=""
                                            onClick={() => handleSearchSubmit()}
                                            className="block w-full rounded-md px-2.5 py-2 text-left text-xs font-medium text-primary border-t border-border/50 hover:bg-muted/50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70"
                                        >
                                            See all results for “{inputValue}”
                                        </button>
                                    </div>
                                ) : (
                                    <p className="px-2.5 py-6 text-sm text-muted-foreground">
                                        Nothing matches “{inputValue}”. Try another word, or press Enter for the full search.
                                    </p>
                                )}
                            </div>
                        )}
                    </div>
                </PopoverContent>
            </Popover>
        </div>
    )
}