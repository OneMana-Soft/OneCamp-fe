"use client"

/**
 * ModelCombobox — a clickable, searchable model picker for the AI admin
 * panel that ALSO accepts a free-text model id not in the list.
 *
 * Replaces the previous native <datalist> on an <input>, which was unreliable
 * across browsers (options often didn't render, the visible option text was
 * the file size rather than the model id, and click-to-select was flaky). A
 * proper popover + cmdk combobox gives a real dropdown while still letting an
 * admin type any tag the catalog didn't enumerate (e.g. a brand-new Ollama
 * model, or a cloud model id the provider's /models endpoint omits).
 */

import React, { useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import { Check, ChevronsUpDown, RefreshCw } from "@/lib/icons"
import { cn } from "@/lib/utils/helpers/cn"
import { ModelView, formatBytes } from "@/services/aiModelService"

export const ModelCombobox: React.FC<{
  value: string
  models: ModelView[]
  loading?: boolean
  disabled?: boolean
  placeholder?: string
  onChange: (model: string) => void
}> = ({ value, models, loading, disabled, placeholder, onChange }) => {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")

  // Whether the typed query exactly matches a known model. If not (and it's
  // non-empty), offer it as a "use custom id" row so unlisted tags work.
  const trimmed = query.trim()
  const hasExactMatch = useMemo(
    () => models.some((m) => m.id === trimmed),
    [models, trimmed],
  )

  const commit = (model: string) => {
    onChange(model)
    setOpen(false)
    setQuery("")
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className="h-9 w-full justify-between font-normal"
        >
          <span className={cn("truncate", !value && "text-muted-foreground")}>
            {value || (loading ? "loading…" : placeholder || "Select or type a model id")}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] min-w-[260px] p-0" align="start">
        {/* shouldFilter: cmdk filters CommandItems by their value against the
            query, which is exactly what we want for the model list. */}
        <Command>
          <CommandInput
            placeholder="Search or type a model id…"
            value={query}
            onValueChange={setQuery}
            className="h-9"
          />
          <CommandList>
            <CommandEmpty>
              {loading ? "Loading models…" : "No installed models match. Type a tag to use it."}
            </CommandEmpty>

            {models.length > 0 && (
              <CommandGroup heading="Available models">
                {models.map((m) => (
                  <CommandItem
                    key={m.id}
                    value={m.id}
                    onSelect={() => commit(m.id)}
                    className="flex items-center justify-between gap-2"
                  >
                    <span className="flex items-center gap-2 min-w-0">
                      <Check className={cn("h-4 w-4 shrink-0", value === m.id ? "opacity-100" : "opacity-0")} />
                      <span className="truncate">{m.id}</span>
                    </span>
                    <span className="shrink-0 text-[11px] text-muted-foreground">
                      {!m.installed ? "not installed" : m.size_bytes ? formatBytes(m.size_bytes) : ""}
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            {/* Allow a custom id that isn't in the catalog. */}
            {trimmed !== "" && !hasExactMatch && (
              <CommandGroup heading="Custom">
                <CommandItem value={`__custom__${trimmed}`} onSelect={() => commit(trimmed)}>
                  Use “{trimmed}”
                </CommandItem>
              </CommandGroup>
            )}
          </CommandList>
        </Command>
        {loading && (
          <div className="flex items-center gap-1.5 border-t border-border/50 px-3 py-1.5 text-[11px] text-muted-foreground">
            <RefreshCw className="h-3 w-3 animate-spin" /> refreshing…
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}
