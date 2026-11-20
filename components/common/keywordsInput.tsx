"use client"

// KeywordsInput: words and short phrases gathered as chips. Type one and
// press Enter (or the +); each chip has its own remove. One control for every
// list of keywords: a workflow's trigger words and your notification
// keywords (chat P3). A word is kept once, in any case, as the server matches
// it (helpers.KeywordPattern: whole word, any case). A caller that saves each
// change can name the words it is saving and the ones that didn't save: their
// chips say so, and Try again (onRetry) sends them again, or the reason they
// were refused (unsavedWhy) stands in its place. A caller may set a floor
// (minLength) as the server's, so a word it would refuse never leaves.

import * as React from "react"
import { Plus, X } from "@/lib/icons"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils/helpers/cn"

/** A word as it is kept: trimmed, inner spaces folded. Pure. */
const folded = (word: string) => word.trim().replace(/\s+/g, " ")

/** value with word added: folded, once in any case. Pure. */
export function withKeyword(value: readonly string[], word: string): string[] {
  const v = folded(word)
  if (!v || value.some((k) => k.toLowerCase() === v.toLowerCase())) return [...value]
  return [...value, v]
}

export function KeywordsInput({
  value,
  onChange,
  id,
  placeholder = "Type a word and press Enter…",
  maxLength = 80,
  minLength,
  max,
  disabled,
  className,
  saving,
  unsaved,
  onRetry,
  unsavedWhy,
}: {
  value: readonly string[]
  onChange: (next: string[]) => void
  id?: string
  placeholder?: string
  /** The longest a keyword may be. */
  maxLength?: number
  /** The shortest a keyword may be, in characters as the server counts them; a shorter one is never added. */
  minLength?: number
  /** How many may be kept; the input closes at it. */
  max?: number
  disabled?: boolean
  className?: string
  /** Words sent and not yet answered: their chips say Saving. */
  saving?: readonly string[]
  /** Words the save refused: their chips say Not saved. */
  unsaved?: readonly string[]
  /** Sends the unsaved words again; shown while there are any. */
  onRetry?: () => void
  /** Why the server refused the unsaved words, said where Try again would be. */
  unsavedWhy?: string
}) {
  const [draft, setDraft] = React.useState("")
  const full = max !== undefined && value.length >= max
  // Code points, as the server counts runes: one emoji is one character.
  const short = minLength !== undefined && [...folded(draft)].length < minLength
  const add = () => {
    if (short) return
    const next = withKeyword(value, draft)
    setDraft("")
    if (next.length !== value.length) onChange(next)
  }

  return (
    <div className={cn("grid gap-2", className)}>
      <div className="flex gap-2">
        <Input
          id={id}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault()
              add()
            }
          }}
          placeholder={full ? `You can keep up to ${max}.` : placeholder}
          autoComplete="off"
          maxLength={maxLength}
          disabled={disabled || full}
        />
        <Button
          aria-label="Add keyword"
          type="button"
          variant="outline"
          size="icon"
          onClick={add}
          disabled={disabled || full || !draft.trim() || short}
          // The field's height: 44px on a phone, 32px from md up.
          className="h-11 w-11 shrink-0 md:h-8 md:w-8"
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>
      {value.length > 0 && (
        <ul className="flex flex-wrap gap-1.5" aria-label="Keywords kept">
          {value.map((kw) => {
            const state = unsaved?.includes(kw) ? "Not saved" : saving?.includes(kw) ? "Saving…" : ""
            return (
              <li
                key={kw}
                aria-busy={state === "Saving…" || undefined}
                className={cn(
                  "inline-flex items-center gap-1 rounded-md bg-muted py-1 pl-2 pr-1 text-xs",
                  state === "Not saved" && "border border-dashed border-destructive/60 bg-transparent",
                )}
              >
                {kw}
                {state && <span className={cn("text-3xs", state === "Not saved" ? "text-danger-ink" : "text-ink-3")}>{state}</span>}
                <button
                  type="button"
                  aria-label={`Remove keyword ${kw}`}
                  disabled={disabled}
                  onClick={() => onChange(value.filter((k) => k !== kw))}
                  // A Not saved word's only way out: 44px on a touch screen.
                  className="extend-touch-target pointer-coarse:after:-inset-3 rounded-sm p-1 text-muted-foreground transition-colors hover:bg-background hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70"
                >
                  <X className="h-3 w-3" />
                </button>
              </li>
            )
          })}
        </ul>
      )}
      {onRetry && unsaved && unsaved.length > 0 && (
        <Button type="button" variant="outline" size="sm" onClick={onRetry} disabled={disabled} className="h-11 justify-self-start md:h-8">
          Try again
        </Button>
      )}
      {unsavedWhy && unsaved && unsaved.length > 0 && <p className="text-xs text-danger-ink">{unsavedWhy}</p>}
    </div>
  )
}
