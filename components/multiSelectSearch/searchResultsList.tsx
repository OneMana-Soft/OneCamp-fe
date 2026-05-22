"use client"

import type React from "react"

import { cn } from "@/lib/utils/helpers/cn"
import {SearchableItem} from "@/types/search";
import {DefaultSearchResultItem} from "@/components/multiSelectSearch/defaultSearchResultItem";


interface SearchResultsListProps<T extends SearchableItem> {
    items: T[]
    selectedIndex: number | null
    onSelect: (item: T) => void
    onHighlight: (index: number) => void
    renderItem?: (item: T, isHighlighted: boolean) => React.ReactNode
}

export function SearchResultsList<T extends SearchableItem>({
                                                                items,
                                                                selectedIndex,
                                                                onSelect,
                                                                onHighlight,
                                                                renderItem,
                                                            }: SearchResultsListProps<T>) {
    return (
        <ul className="max-h-60 overflow-auto py-1">
            {items.map((item, index) => (
                <li
                    key={item.id}
                    onClick={() => onSelect(item)}
                    onMouseEnter={() => onHighlight(index)}
                    className={cn(
                        "cursor-pointer px-3 py-2",
                        "hover:bg-accent",
                        selectedIndex === index && "bg-accent",
                    )}
                >
                    {renderItem ? renderItem(item, selectedIndex === index) : <DefaultSearchResultItem item={item} />}
                </li>
            ))}
        </ul>
    )
}
