"use client"

/**
 * ModelCombobox — a clickable, searchable model picker for the AI admin
 * panel that ALSO accepts a free-text model id not in the list.
 *
 * Replaces the previous native <datalist> on an <input>, which was unreliable
 * across browsers (options often didn't render, the visible option text was
 * the file size rather than the model id, and click-to-select was flaky). The
 * shared combobox (components/ui/combobox) gives a real dropdown while still
 * letting an admin type any tag the catalog didn't enumerate (e.g. a
 * brand-new Ollama model, or a cloud model id the provider's /models endpoint
 * omits).
 */

import React, { useMemo, useState } from "react"
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxField,
  ComboboxGroup,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox"
import { RefreshCw } from "@/lib/icons"
import { ModelView, formatBytes } from "@/services/aiModelService"

export const ModelCombobox: React.FC<{
  value: string
  models: ModelView[]
  loading?: boolean
  disabled?: boolean
  placeholder?: string
  onChange: (model: string) => void
}> = ({ value, models, loading, disabled, placeholder, onChange }) => {
  const [query, setQuery] = useState("")

  // Whether the typed query exactly matches a known model. If not (and it's
  // non-empty), offer it as a "use custom id" row so unlisted tags work.
  const trimmed = query.trim()
  const hasExactMatch = useMemo(
    () => models.some((m) => m.id === trimmed),
    [models, trimmed],
  )

  return (
    <Combobox onOpenChange={(open) => !open && setQuery("")}>
      <ComboboxField disabled={disabled} aria-label="Model" placeholder={loading ? "loading…" : placeholder || "Select or type a model id"}>
        {value || undefined}
      </ComboboxField>
      <ComboboxContent label="Models" selected={value || undefined}>
        {/* cmdk filters the rows by their value against the query, which is
            exactly what we want for the model list. */}
        <ComboboxInput placeholder="Find or type a model id…" value={query} onValueChange={setQuery} />
        <ComboboxList>
          <ComboboxEmpty>
            {loading ? "Loading models…" : "No installed models match. Type a tag to use it."}
          </ComboboxEmpty>

          {models.length > 0 && (
            <ComboboxGroup heading="Available models">
              {models.map((m) => (
                <ComboboxItem key={m.id} value={m.id} checked={value === m.id} onSelect={onChange}>
                  <span className="min-w-0 flex-1 truncate">{m.id}</span>
                  <span className="shrink-0 text-2xs text-ink-3">
                    {!m.installed ? "not installed" : m.size_bytes ? formatBytes(m.size_bytes) : ""}
                  </span>
                </ComboboxItem>
              ))}
            </ComboboxGroup>
          )}

          {/* Allow a custom id that isn't in the catalog. */}
          {trimmed !== "" && !hasExactMatch && (
            <ComboboxGroup heading="Custom">
              <ComboboxItem value={`__custom__${trimmed}`} onSelect={() => onChange(trimmed)}>
                Use “{trimmed}”
              </ComboboxItem>
            </ComboboxGroup>
          )}
        </ComboboxList>
        {loading && (
          <div className="flex items-center gap-1.5 border-t border-line px-2 pt-1.5 text-2xs text-ink-3">
            <RefreshCw className="h-3 w-3 animate-spin" /> refreshing…
          </div>
        )}
      </ComboboxContent>
    </Combobox>
  )
}
