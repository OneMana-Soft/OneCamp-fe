"use client"

import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils/helpers/cn"
import { Badge } from "@/components/ui/badge"
import { X, Search, Eye } from "@/lib/icons";
import { useRef, useCallback, useEffect } from "react"
import { ScrollArea } from "@/components/ui/scroll-area"
import { useSearch } from "@/hooks/useSearch"
import { getIcon, getHighlightedTitle, getContext, isResultPreviewable } from "@/lib/utils/helpers/search"
import { SkeletonRows } from "@/components/ui/skeletonRows"

/**
 * Mobile home search bar.
 *
 * Previously this rendered the result list inside a shadcn <Drawer/>,
 * which auto-renders a fixed `bg-black/80` overlay across the whole
 * viewport — including the search input the user is typing into. The
 * overlay obscured the cursor, making search-as-you-type feel broken.
 *
 * The replacement is an inline-expanding results panel anchored
 * directly below the search input. There is no overlay, the input
 * stays fully readable while typing, and the results layer above the
 * page content with `z-[var(--z-popover)]`. Tapping outside the
 * panel or pressing Escape closes it; backspacing the query to empty
 * also collapses it.
 */
export function MobileHomeSearchBar() {
    const searchRef = useRef<HTMLInputElement>(null)
    const containerRef = useRef<HTMLDivElement>(null)

    const {
        inputValue,
        setInputValue,
        results,
        isLoading,
        open,
        setOpen,
        handleClear,
        handleResultClick,
        handlePreview,
        handleSearchSubmit,
    } = useSearch()

    const isOpen = open && inputValue.length > 0

    const onClear = useCallback(() => {
        handleClear()
        searchRef.current?.focus()
    }, [handleClear])

    const handleKeyDownCapture = useCallback(
        (e: React.KeyboardEvent) => {
            if (e.key === "Enter") {
                handleSearchSubmit()
                return
            }
            if (e.key === "Escape") {
                setOpen(false)
                searchRef.current?.blur()
            }
        },
        [handleSearchSubmit, setOpen],
    )

    // Close the inline panel when the user taps outside the search row
    // (input + panel). We don't use Radix Popover here because the
    // input must remain in the document flow on the page header — a
    // Popover would steal focus and re-anchor on every keystroke.
    useEffect(() => {
        if (!isOpen) return
        const onPointerDown = (e: PointerEvent) => {
            const node = containerRef.current
            if (!node) return
            if (node.contains(e.target as Node)) return
            setOpen(false)
        }
        document.addEventListener("pointerdown", onPointerDown, { passive: true })
        return () =>
            document.removeEventListener("pointerdown", onPointerDown)
    }, [isOpen, setOpen])

    const handleResultTap = useCallback(
        (result: Parameters<typeof handleResultClick>[0]) => {
            handleResultClick(result)
            setOpen(false)
        },
        [handleResultClick, setOpen],
    )

    return (
        <div ref={containerRef} className="relative w-full">
            <div className="relative w-full">
                <Search
                    className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground"
                    aria-hidden
                />
                <Input
                    ref={searchRef}
                    type="search"
                    placeholder="Search..."
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    onKeyDown={handleKeyDownCapture}
                    onFocus={() => inputValue && setOpen(true)}
                    className={cn(
                        "h-10 w-full pl-9 pr-9",
                        "rounded-full bg-secondary border-transparent",
                        "placeholder:text-muted-foreground",
                        "focus-visible:ring-1 focus-visible:ring-ring/40 focus-visible:bg-background focus-visible:border-border",
                        "transition-colors",
                        "[&::-webkit-search-cancel-button]:appearance-none",
                    )}
                />
                {inputValue && (
                    <button
                        type="button"
                        onClick={onClear}
                        aria-label="Clear search"
                        // 24px was the smallest tap target in the mobile app, and it
                        // is the escape hatch from a bad query. The icon stays small;
                        // the hit area grows to 36px with a -mr offset so the visual
                        // alignment inside the field is unchanged.
                        className="absolute right-1 top-1/2 -translate-y-1/2 inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                    >
                        <X className="h-3.5 w-3.5" />
                    </button>
                )}
            </div>

            {/*
              Results panel. Anchored directly below the input via
              `top-full`. No overlay, so the user keeps full visibility
              of the input while typing.
            */}
            {isOpen && (
                <div
                    className={cn(
                        "absolute left-0 right-0 top-full mt-2",
                        "z-[var(--z-popover)]",
                        "rounded-xl border border-border/60 bg-popover text-popover-foreground",
                        "shadow-overlay",
                        "max-h-[60vh] flex flex-col overflow-hidden",
                    )}
                    role="listbox"
                    aria-label="Search results"
                >
                    <div className="px-3 py-2 border-b border-border/60 text-xs font-medium text-muted-foreground truncate">
                        Results for &ldquo;{inputValue}&rdquo;
                    </div>
                    <ScrollArea className="flex-1">
                        <div className="p-2">
                            {isLoading ? (
                                // Skeleton rows in the shape of results, not a
                                // centred pulse: the panel keeps its height so the
                                // first result doesn't slide under a descending thumb.
                                <div role="status" aria-label="Searching">
                                    <SkeletonRows rows={3} lines={2} />
                                </div>
                            ) : results.length > 0 ? (
                                <div className="space-y-1.5">
                                    {results.map((result, idx) => (
                                        // A div with role="option", not a <button>. The row contains
                                        // its own Preview button, and a <button> inside a <button> is
                                        // invalid HTML with undefined behaviour — tapping preview
                                        // could navigate instead, inconsistently across browsers.
                                        // role="option" is also what the parent role="listbox" wants.
                                        <div
                                            key={idx}
                                            role="option"
                                            aria-selected={false}
                                            tabIndex={0}
                                            onClick={() => handleResultTap(result)}
                                            onKeyDown={(e) => {
                                                if (e.key === "Enter" || e.key === " ") {
                                                    e.preventDefault()
                                                    handleResultTap(result)
                                                }
                                            }}
                                            className={cn(
                                                "w-full flex items-center gap-3 p-2.5 rounded-lg text-left cursor-pointer",
                                                "transition-colors hover:bg-accent active:bg-accent",
                                                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
                                            )}
                                        >
                                            <div
                                                className={cn(
                                                    "shrink-0",
                                                    result.type === "user"
                                                        ? ""
                                                        : "p-1.5 rounded-md bg-muted text-muted-foreground",
                                                )}
                                            >
                                                {getIcon(result)}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2 mb-0.5">
                                                    <Badge variant="secondary" size="sm" caps className="rounded">
                                                        {result.type}
                                                    </Badge>
                                                </div>
                                                <div className="text-sm font-medium text-foreground line-clamp-1">
                                                    {getHighlightedTitle(result)}
                                                </div>
                                                <div className="text-2xs text-muted-foreground truncate">
                                                    {getContext(result)}
                                                </div>
                                            </div>
                                            {isResultPreviewable(result) && (
                                                <button
                                                    type="button"
                                                    onClick={(e) => {
                                                        e.stopPropagation()
                                                        handlePreview(result)
                                                    }}
                                                    aria-label="Preview"
                                                    className="shrink-0 inline-flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground hover:text-foreground hover:bg-accent/60 transition-colors"
                                                >
                                                    <Eye className="h-4 w-4" />
                                                </button>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="py-8 text-center">
                                    <p className="text-sm font-medium text-foreground">No results</p>
                                    <p className="text-xs text-muted-foreground mt-0.5">
                                        Try a different keyword
                                    </p>
                                </div>
                            )}
                        </div>
                    </ScrollArea>
                </div>
            )}
        </div>
    )
}
