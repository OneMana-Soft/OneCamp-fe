"use client"

// The sign-up allow-list as chips (design v3, admin A7): each domain or
// address a 24px chip with a globe or an at glyph and an ×. A comma, a space
// or Enter makes a chip; pasting a list makes several; Backspace in an empty
// field takes the last one back into the field. A chip the list can't hold
// is danger-tinted, with its reason as a tooltip (and in its accessible
// name), so the problem sits on the entry itself; one line under the field
// says it in words too (a tip alone was missed), or the server's refusal,
// whose named entries take the tint.

import * as React from "react"
import { useId, useRef, useState } from "react"
import { AtSign, Globe, X } from "@/lib/icons"
import { cn } from "@/lib/utils/helpers/cn"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { SIGN_UP_RULES, type ChipRules, type EntryKind } from "@/components/admin/allowListEntries"

export function AllowListChipInput({
  id,
  value,
  onChange,
  refusal,
  disabled,
  describedBy,
  inputRef,
  rules = SIGN_UP_RULES,
}: {
  id: string
  value: string[]
  onChange: (next: string[]) => void
  /** The server's refusal: said under the field, which it rings; the entries it names take the danger tint. */
  refusal?: string
  disabled?: boolean
  describedBy?: string
  inputRef?: React.Ref<HTMLInputElement>
  /** What an entry is: how typing splits into entries, what's wrong with one, its glyph and the field's words. The sign-up list's by default. */
  rules?: ChipRules
}) {
  const [text, setText] = useState("")
  const ownRef = useRef<HTMLInputElement | null>(null)
  const listId = useId()
  const lineId = `${id}-problem`
  const named = refusal ? wordsOf(refusal) : null
  const line = refusal || value.map(rules.problem).find(Boolean)

  const setRefs = (el: HTMLInputElement | null) => {
    ownRef.current = el
    if (typeof inputRef === "function") inputRef(el)
    else if (inputRef) (inputRef as React.MutableRefObject<HTMLInputElement | null>).current = el
  }

  /** Adds what was typed as chips, skipping any already on the list. */
  const commit = (raw: string) => {
    const fresh = rules.split(raw).filter((e, i, all) => !value.includes(e) && all.indexOf(e) === i)
    if (fresh.length) onChange([...value, ...fresh])
    setText("")
  }

  const remove = (entry: string) => {
    onChange(value.filter((e) => e !== entry))
    ownRef.current?.focus()
  }

  return (
    <>
      <div
        data-chip-field=""
        data-invalid={refusal ? "true" : undefined}
        onClick={(e) => {
          if (e.target === e.currentTarget) ownRef.current?.focus()
        }}
        className={cn(
          "field-surface flex min-h-11 w-full cursor-text flex-wrap items-center gap-1.5 rounded-md px-1.5 py-1.5 md:min-h-9",
          refusal && "ring-1 ring-inset ring-destructive",
          disabled && "pointer-events-none opacity-50",
        )}
      >
        <ul id={listId} aria-label={rules.listLabel} className="contents">
          {value.map((entry) => (
            <li key={entry} className="contents">
              <EntryChip entry={entry} problem={rules.problem(entry) ?? ((named?.has(entry.replace(/^@/, "")) && refusal) || null)} glyph={rules.glyph(entry)} onRemove={() => remove(entry)} />
            </li>
          ))}
        </ul>
        <input
          ref={setRefs}
          id={id}
          name={rules.name}
          type="text"
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          enterKeyHint="done"
          disabled={disabled}
          value={text}
          placeholder={value.length ? "" : rules.placeholder}
          aria-describedby={[describedBy, line && lineId].filter(Boolean).join(" ") || undefined}
          aria-invalid={!!line || undefined}
          onChange={(e) => {
            const v = e.target.value
            // A comma, semicolon or space ends an entry as it is typed.
            if (/[\s,;]/.test(v)) commit(v)
            else setText(v)
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault()
              commit(text)
            } else if (e.key === "Backspace" && text === "" && value.length) {
              e.preventDefault()
              const last = value[value.length - 1]
              onChange(value.slice(0, -1))
              setText(last)
            }
          }}
          onBlur={() => {
            if (text.trim()) commit(text)
          }}
          onPaste={(e) => {
            const pasted = e.clipboardData.getData("text")
            if (/[\s,;]/.test(pasted)) {
              e.preventDefault()
              commit(text + pasted)
            }
          }}
          className="h-7 min-w-[10ch] flex-1 bg-transparent px-1 text-base text-foreground outline-none placeholder:text-faint-foreground md:h-6 md:text-sm"
        />
      </div>
      {line ? (
        <p id={lineId} role="alert" className="mt-2 text-xs text-danger-ink text-pretty">
          {line}
        </p>
      ) : null}
    </>
  )
}

/** The entries a refusal names: its words, lower case, without the punctuation around them. Pure. */
function wordsOf(text: string): Set<string> {
  return new Set(text.toLowerCase().split(/\s+/).map((w) => w.replace(/^[^a-z0-9*@]+|[^a-z0-9]+$/g, "").replace(/^@/, "")))
}

/** One entry: 24px, a 12px glyph, the entry, an ×; danger-tinted with its reason when refused. */
function EntryChip({ entry, problem, glyph, onRemove }: { entry: string; problem: string | null; glyph: EntryKind; onRemove: () => void }) {
  const Glyph = glyph === "domain" ? Globe : AtSign
  const chip = (
    <span
      data-allow-chip=""
      data-invalid={problem ? "true" : undefined}
      tabIndex={problem ? 0 : undefined}
      className={cn(
        "chip h-6 min-w-0 max-w-full gap-1 pl-1.5 pr-1",
        problem && "bg-destructive/10 text-danger-ink shadow-none",
      )}
    >
      <Glyph className={cn("size-3 shrink-0", problem ? "text-danger-ink" : "text-ink-3")} aria-hidden="true" />
      <span className="truncate">{entry}</span>
      {problem && <span className="sr-only">: {problem}</span>}
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove ${entry}`}
        className="inline-flex size-4 shrink-0 items-center justify-center rounded-xs text-faint-foreground hover:bg-press hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
      >
        <X className="size-3" aria-hidden="true" />
      </button>
    </span>
  )
  if (!problem) return chip
  return (
    <Tooltip>
      <TooltipTrigger asChild>{chip}</TooltipTrigger>
      <TooltipContent>{problem}</TooltipContent>
    </Tooltip>
  )
}
