"use client"

import { Search, X } from "@/lib/icons"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils/helpers/cn"
import { useCallback, useRef } from "react"
import { sanitizeFilterQuery } from "@/lib/utils/sanitizeFilterQuery"

interface SearchFieldProps {
    placeholder: string
    value: string
    onChange: (value: string) => void
    className?: string
}

export const SearchField: React.FC<SearchFieldProps> = ({
    placeholder,
    value,
    onChange,
    className,
}) => {
    const searchRef = useRef<HTMLInputElement>(null)

    const handleClear = () => {
        onChange("")
        searchRef.current?.focus()
    }

    const handleChange = useCallback(
        (e: React.ChangeEvent<HTMLInputElement>) => {
            const sanitized = sanitizeFilterQuery(e.target.value)
            onChange(sanitized)
        },
        [onChange],
    )

    return (
        <div className={cn("relative flex items-center px-3 md:px-4 py-2", className)}>
            <Search
                className="absolute left-5 md:left-6 h-4 w-4 text-muted-foreground pointer-events-none"
                aria-hidden
            />
            <Input
                ref={searchRef}
                type="search"
                placeholder={placeholder}
                value={value}
                onChange={handleChange}
                className={cn(
                    "h-9 w-full pl-8 pr-8 rounded-md",
                    "bg-muted/40 border-transparent shadow-none",
                    "placeholder:text-muted-foreground/80 text-sm",
                    "focus-visible:ring-1 focus-visible:ring-ring/40 focus-visible:bg-background focus-visible:border-border",
                    "transition-colors",
                    "[&::-webkit-search-cancel-button]:appearance-none",
                )}
            />
            {value && (
                <button
                    type="button"
                    onClick={handleClear}
                    aria-label="Clear search"
                    className={cn(
                        "absolute right-5 md:right-6 h-5 w-5 rounded",
                        "flex items-center justify-center",
                        "text-muted-foreground hover:text-foreground hover:bg-accent",
                        "transition-colors",
                    )}
                >
                    <X className="h-3.5 w-3.5" />
                </button>
            )}
        </div>
    )
}
