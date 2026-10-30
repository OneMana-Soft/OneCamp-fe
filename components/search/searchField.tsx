"use client"

import { useCallback } from "react"

import { LazySearchInput } from "@/components/ui/lazy-search-input"
import { cn } from "@/lib/utils/helpers/cn"
import { sanitizeFilterQuery } from "@/lib/utils/sanitizeFilterQuery"

interface SearchFieldProps {
    placeholder: string
    /** The field's name for a screen reader; the placeholder without its "…" when not given. */
    ariaLabel?: string
    value: string
    onChange: (value: string) => void
    className?: string
}

/**
 * A list's search box at the head of the list (channels, people, tasks,
 * projects, teams): the shared SearchInput, inset in its own padding so its
 * edge and its halo never meet the edge of the scroller it sits in, and with
 * what is typed cleaned of the characters a filter can't take.
 */
export const SearchField: React.FC<SearchFieldProps> = ({ placeholder, ariaLabel, value, onChange, className }) => {
    const change = useCallback((next: string) => onChange(sanitizeFilterQuery(next)), [onChange])
    return (
        <div data-list-search="" className={cn("px-3 py-2 md:px-4", className)}>
            <LazySearchInput placeholder={placeholder} aria-label={ariaLabel} value={value} onValueChange={change} />
        </div>
    )
}
