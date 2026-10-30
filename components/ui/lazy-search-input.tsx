"use client"

import * as React from "react"

import { lazyView } from "@/lib/lazy/lazyView"
import type { SearchInputProps } from "@/components/ui/search-input"
import { Search, X } from "@/lib/icons"
import { cn } from "@/lib/utils/helpers/cn"

// SearchInput as a chunk of its own; until it lands, a field of its size takes what is typed,
// and hands its focus and caret over (from) once any word being composed is in.
const chunk = lazyView(() => import("@/components/ui/search-input"))

export const warmSearchInput = () => chunk.warm()

const HEIGHT = { sm: "h-8", md: "h-11 md:h-8", lg: "h-11 rounded-[10px]" } as const
const GLYPH = { sm: "size-3.5", md: "size-4", lg: "size-[18px]" } as const

export const LazySearchInput = React.forwardRef<HTMLInputElement, SearchInputProps>((props, ref) => {
  const { value, onValueChange, placeholder, size = "md", className, inputClassName, "aria-label": ariaLabel, clearable = true, ...rest } = props
  delete rest.onEscape
  delete rest.hint
  const group = React.useRef<HTMLDivElement>(null)
  const [composing, setComposing] = React.useState(false)
  const fallback = (
    <div
      ref={group}
      role="group"
      data-slot="input-group"
      data-search-input=""
      onCompositionStart={() => setComposing(true)}
      onCompositionEnd={() => setTimeout(setComposing, 0, false)}
      className={cn("field-surface flex w-full min-w-0 items-center rounded-md", HEIGHT[size], className)}
    >
      <span className={cn("flex shrink-0 items-center ps-2.5 text-ink-3", size === "lg" && "ps-3.5")}>
        <Search className={GLYPH[size]} aria-hidden="true" />
      </span>
      <input
        {...rest}
        ref={ref}
        type="search"
        enterKeyHint="search"
        autoComplete="off"
        spellCheck={false}
        placeholder={placeholder}
        aria-label={ariaLabel ?? placeholder?.replace(/(…|\.\.\.)$/, "")}
        value={value}
        onChange={(e) => onValueChange(e.target.value)}
        className={cn("h-full w-full min-w-0 flex-1 bg-transparent px-1.5 text-base text-ink outline-none placeholder:text-ink-3 md:text-sm", size === "lg" && "md:text-base", inputClassName)}
      />
      {clearable && value ? (
        <span className="flex h-full shrink-0 items-center pe-1">
          <button
            type="button"
            aria-label="Clear search"
            data-touch-target=""
            onClick={() => {
              onValueChange("")
              group.current?.querySelector("input")?.focus()
            }}
            className="inline-flex size-6 items-center justify-center rounded-md text-ink-3 hover:bg-hover hover:text-ink"
          >
            <X className="size-3.5" aria-hidden="true" />
          </button>
        </span>
      ) : null}
    </div>
  )
  return <chunk.View fallback={fallback} render={(m) => (composing ? fallback : <m.SearchInput ref={ref} {...props} from={group.current?.querySelector("input")} />)} />
})
LazySearchInput.displayName = "LazySearchInput"
