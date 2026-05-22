"use client"

import type React from "react"

import { useState, useRef, useEffect, useMemo } from "react"
import { Loader2, X } from "@/lib/icons";
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils/helpers/cn"
import {SearchableItem} from "@/types/search";
import {useSearchResults} from "@/hooks/useSearchResult";
import {useKeyboardNavigation} from "@/hooks/useKeyboardNavigation";
import {SearchResultsList} from "@/components/multiSelectSearch/searchResultsList";


interface MultiSelectSearchProps<T extends SearchableItem> {
    onSelect?: (items: T[]) => void
    onSearch: (query: string) => Promise<T[]>
    renderItem?: (item: T, isHighlighted: boolean) => React.ReactNode
    placeholder?: string
    maxItems?: number
    debounceTime?: number
    className?: string
    initialSelectedItems?: T[]
}

export function MultiSelectSearch<T extends SearchableItem>({
                                                                onSelect,
                                                                onSearch,
                                                                renderItem,
                                                                placeholder = "Search...",
                                                                maxItems,
                                                                debounceTime = 300,
                                                                className,
                                                                initialSelectedItems = [],
                                                            }: MultiSelectSearchProps<T>) {
    const [query, setQuery] = useState("")
    const [isOpen, setIsOpen] = useState(false)
    const [selectedItems, setSelectedItems] = useState<T[]>(initialSelectedItems)
    const inputRef = useRef<HTMLInputElement>(null)
    const dropdownRef = useRef<HTMLDivElement>(null)
    const containerRef = useRef<HTMLDivElement>(null)

    const {isLoading, filteredResults } = useSearchResults({
        query,
        onSearch,
        selectedItems,
        debounceTime,
    })

    const { selectedIndex, setSelectedIndex, handleKeyNavigation } = useKeyboardNavigation({
        items: filteredResults,
        isOpen,
        onSelect: handleSelect,
        onClose: () => setIsOpen(false),
    })

    function handleSelect(item: T) {
        if (maxItems && selectedItems.length >= maxItems) return

        const newSelectedItems = [...selectedItems, item]
        setSelectedItems(newSelectedItems)

        if (onSelect) {
            onSelect(newSelectedItems)
        }

        setQuery("")
        setIsOpen(false)
        inputRef.current?.focus()
    }

    function handleRemove(itemToRemove: T) {
        const newSelectedItems = selectedItems.filter((item) => item.id !== itemToRemove.id)
        setSelectedItems(newSelectedItems)

        if (onSelect) {
            onSelect(newSelectedItems)
        }
    }

    function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
        const value = e.target.value
        setQuery(value)

        if (value.trim()) {
            setIsOpen(true)
        } else {
            setIsOpen(false)
        }
    }

    function handleKeyDown(e: React.KeyboardEvent) {
        if (e.key === "Backspace" && query === "" && selectedItems.length > 0) {
            e.preventDefault()
            const newSelectedItems = selectedItems.slice(0, -1)
            setSelectedItems(newSelectedItems)
            if (onSelect) {
                onSelect(newSelectedItems)
            }
            return
        }

        handleKeyNavigation(e)
    }

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (
                dropdownRef.current &&
                !dropdownRef.current.contains(event.target as Node) &&
                containerRef.current &&
                !containerRef.current.contains(event.target as Node)
            ) {
                setIsOpen(false)
            }
        }

        document.addEventListener("mousedown", handleClickOutside)
        return () => {
            document.removeEventListener("mousedown", handleClickOutside)
        }
    }, [])

    const isMaxItemsReached = useMemo(() => {
        return maxItems !== undefined && selectedItems.length >= maxItems
    }, [maxItems, selectedItems])

    return (
        <div className={cn("relative w-full", className)}>
            <div
                ref={containerRef}
                className="flex flex-wrap items-center gap-1 rounded-md border border-input bg-secondary/20 px-3 text-sm ring-offset-background focus-within:ring-1 focus-within:ring-ring focus-within:ring-offset-1"
                onClick={() => inputRef.current?.focus()}
            >
                {selectedItems.map((item) => (
                    <Badge key={item.id} variant="secondary" className="rounded-md px-1 py-0 text-lg font-normal">
                        {item.name}
                        <button
                            type="button"
                            className="ml-1 rounded-md p-0.5 hover:bg-muted/50"
                            onClick={(e) => {
                                e.stopPropagation()
                                handleRemove(item)
                            }}
                        >
                            <X className="h-3 w-3" />
                            <span className="sr-only">Remove {item.name}</span>
                        </button>
                    </Badge>
                ))}
                <Input
                    ref={inputRef}
                    type="text"
                    value={query}
                    onChange={handleInputChange}
                    onKeyDown={handleKeyDown}
                    onFocus={() => query.trim() && setIsOpen(true)}
                    placeholder={selectedItems.length === 0 ? placeholder : ""}
                    className="flex-1 border-0 bg-transparent p-0 shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
                    disabled={isMaxItemsReached}
                />
                {isLoading && (
                    <div className="flex-shrink-0">
                        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    </div>
                )}
            </div>

            {isOpen && (filteredResults.length > 0 || isLoading) && (
                <div ref={dropdownRef} className="absolute z-[var(--z-dropdown)] mt-1 w-full rounded-md border bg-background shadow-lg">
                    <SearchResultsList
                        items={filteredResults}
                        selectedIndex={selectedIndex}
                        onSelect={handleSelect}
                        onHighlight={(index) => setSelectedIndex(index)}
                        renderItem={renderItem}
                    />
                </div>
            )}
        </div>
    )
}
