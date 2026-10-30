"use client"

import * as React from "react"

import { Search, X } from "@/lib/icons"
import { fieldKeyDown } from "@/lib/keys/ime"
import { escapeTaken, takeEscape } from "@/lib/keys/escapeOwn"
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group"
import { cn } from "@/lib/utils/helpers/cn"

export interface SearchInputProps extends Omit<React.ComponentPropsWithoutRef<"input">, "value" | "onChange" | "size" | "type"> {
  value: string
  onValueChange: (value: string) => void
  /** Escape with nothing to clear (close a toolbar's search). */
  onEscape?: () => void
  /** Clear (×) while there is text. */
  clearable?: boolean
  /** The group's; inputClassName is the text's. */
  className?: string
  inputClassName?: string
  /** sm: a toolbar's (dense); md: a field's; lg: 44px everywhere. */
  size?: "sm" | "md" | "lg"
  /** At the end while empty: the key that focuses it ("/"). */
  hint?: React.ReactNode
}

const GLYPH = { sm: "size-3.5", md: "size-4", lg: "size-[18px]" } as const

interface Props extends SearchInputProps {
  /**
   * The field this one takes the place of (LazySearchInput's, drawn while
   * this chunk came): when someone is typing in it, its focus and caret move
   * here, so no key is lost.
   */
  from?: HTMLInputElement | null
}

/**
 * THE SEARCH FIELD (InputGroup: glyph · text · Clear or hint), named by its
 * label or its placeholder without the "…". Escape clears, else is onEscape's,
 * else goes on; while it has a use for it the field owns the press
 * (data-escape-own, lib/keys/escape) and takes what it answers (takeEscape).
 */
export const SearchInput = React.forwardRef<HTMLInputElement, Props>(
  ({ value, onValueChange, onEscape, clearable = true, className, inputClassName, size = "md", hint, onKeyDown, placeholder, "aria-label": ariaLabel, from, ...props }, ref) => {
    // Read as this field first draws, while the one it replaces is still on
    // the page: the swap renders and commits in one go, so no key comes between.
    const [took] = React.useState(() => (from && from === document.activeElement ? [from.selectionStart ?? 0, from.selectionEnd ?? 0] : null))
    const caret = React.useRef(took)
    return (
      <InputGroup className={cn(size === "lg" && "h-11 rounded-[10px]", className)} dense={size !== "md"} data-search-input="">
        <InputGroupAddon className={cn(size === "lg" && "ps-3.5")}>
          <Search className={GLYPH[size]} aria-hidden="true" />
        </InputGroupAddon>
        <InputGroupInput
          ref={ref}
          type="search"
          enterKeyHint="search"
          autoComplete="off"
          spellCheck={false}
          placeholder={placeholder}
          aria-label={ariaLabel ?? placeholder?.replace(/(…|\.\.\.)$/, "")}
          data-escape-own={value || onEscape ? "" : undefined}
          className={cn(size === "lg" && "md:text-base", inputClassName)}
          {...props}
          autoFocus={props.autoFocus || !!took}
          onFocus={(e) => {
            if (caret.current) e.currentTarget.setSelectionRange(caret.current[0], caret.current[1])
            caret.current = null
            props.onFocus?.(e)
          }}
          value={value}
          onChange={(e) => onValueChange(e.target.value)}
          onKeyDown={fieldKeyDown((e) => {
            onKeyDown?.(e)
            if (e.key !== "Escape" || escapeTaken(e.nativeEvent)) return
            if (value) {
              takeEscape(e.nativeEvent)
              onValueChange("")
            } else if (onEscape) {
              takeEscape(e.nativeEvent)
              onEscape()
            }
          })}
        />
        {clearable && value ? (
          <InputGroupAddon align="inline-end">
            <InputGroupButton
              aria-label="Clear search"
              onClick={(e) => {
                onValueChange("")
                e.currentTarget.closest("[data-slot=input-group]")?.querySelector("input")?.focus()
              }}
            >
              <X />
            </InputGroupButton>
          </InputGroupAddon>
        ) : hint && !value ? (
          <InputGroupAddon align="inline-end">{hint}</InputGroupAddon>
        ) : null}
      </InputGroup>
    )
  },
)
SearchInput.displayName = "SearchInput"
