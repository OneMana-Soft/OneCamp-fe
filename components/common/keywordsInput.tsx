"use client"

// KeywordsInput: words and short phrases gathered as chips. Type one and
// press Enter (or the +); each chip has its own remove. One control for every
// list of keywords: a workflow's trigger words and your notification
// keywords (chat P3). A word is kept once, in any case, as the server matches
// it (helpers.KeywordPattern: whole word, any case).

import * as React from "react"
import { Plus, X } from "@/lib/icons"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils/helpers/cn"

/** value with word added: trimmed, inner spaces folded, once in any case. Pure. */
export function withKeyword(value: readonly string[], word: string): string[] {
  const v = word.trim().replace(/\s+/g, " ")
  if (!v || value.some((k) => k.toLowerCase() === v.toLowerCase())) return [...value]
  return [...value, v]
}

export function KeywordsInput({
  value,
  onChange,
  id,
  placeholder = "Type a word and press Enter…",
  maxLength = 80,
  max,
  disabled,
  className,
}: {
  value: readonly string[]
  onChange: (next: string[]) => void
  id?: string
  placeholder?: string
  /** The longest a keyword may be. */
  maxLength?: number
  /** How many may be kept; the input closes at it. */
  max?: number
  disabled?: boolean
  className?: string
}) {
  const [draft, setDraft] = React.useState("")
  const full = max !== undefined && value.length >= max
  const add = () => {
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
          disabled={disabled || full || !draft.trim()}
          // The field's height: 44px on a phone, 32px from md up.
          className="h-11 w-11 shrink-0 md:h-8 md:w-8"
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>
      {value.length > 0 && (
        <ul className="flex flex-wrap gap-1.5" aria-label="Keywords kept">
          {value.map((kw) => (
            <li key={kw} className="inline-flex items-center gap-1 rounded-md bg-muted py-1 pl-2 pr-1 text-xs">
              {kw}
              <button
                type="button"
                aria-label={`Remove keyword ${kw}`}
                disabled={disabled}
                onClick={() => onChange(value.filter((k) => k !== kw))}
                className="rounded-sm p-1 text-muted-foreground transition-colors hover:bg-background hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70"
              >
                <X className="h-3 w-3" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
