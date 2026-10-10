"use client"

import { Search, X } from "@/lib/icons"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils/helpers/cn"
import { useCallback, useRef } from "react"
import { sanitizeFilterQuery } from "@/lib/utils/sanitizeFilterQuery"

interface SearchFieldProps {
    placeholder: string
    /** The field's name for a screen reader; the placeholder without its "…" when not given. */
    ariaLabel?: string
    value: string
    onChange: (value: string) => void
    className?: string
}

export const SearchField: React.FC<SearchFieldProps> = ({
    placeholder,
    ariaLabel,
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
                // A placeholder is not a name: it is gone once something is typed.
                aria-label={ariaLabel ?? placeholder.replace(/(…|\.\.\.)$/, "")}
                value={value}
                onChange={handleChange}
                className={cn(
                    // Phone first, like the Input underneath: 44px tall and 16px
                    // text, from md up 36px and 14px. Set to 14px everywhere, every
                    // list's search box made iOS zoom the page in on focus (and stay
                    // zoomed), and at 36px it was under the 44px touch guidance.
                    "h-11 md:h-9 w-full pl-8 pr-11 md:pr-8 rounded-md",
                    "bg-muted/40 border-transparent shadow-none",
                    "placeholder:text-muted-foreground/80 text-base md:text-sm",
                    "focus-visible:ring-1 focus-visible:ring-ring/70 focus-visible:bg-background focus-visible:border-border",
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
                        // A thumb's target on a phone (the field's right 44px), the
                        // small square it was from md up.
                        "absolute right-3 h-11 w-11 rounded-md md:right-6 md:h-5 md:w-5 md:rounded",
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
