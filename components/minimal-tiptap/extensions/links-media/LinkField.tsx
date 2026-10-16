"use client"

import * as React from "react"
import { cn } from "@/lib/utils/helpers/cn"
import { Button } from "@/components/ui/button"
import { takeLinkFocus } from "./hosts"

/**
 * Asks for the link an empty bookmark or embed is for: a field and its button,
 * with a line saying what works and, after a try, what was wrong and what to
 * do. Enter makes it, Escape leaves it for the text.
 */
export function LinkField({
  label,
  action,
  hint,
  selected,
  check,
  onSubmit,
  onEscape,
}: {
  label: string
  action: string
  hint?: React.ReactNode
  selected?: boolean
  /** What's wrong with a web address for this block, if anything. */
  check?: (href: string) => React.ReactNode | null
  onSubmit(href: string): void
  onEscape?(): void
}) {
  const [value, setValue] = React.useState("")
  const [problem, setProblem] = React.useState<React.ReactNode>(null)
  const input = React.useRef<HTMLInputElement>(null)
  const id = React.useId()

  // Only in the tab that just made it from "/" (hosts.ts). A frame later:
  // Tiptap's focus command, which inserted the block, puts the editor's own
  // focus off to the next frame, and took it back from the field.
  React.useEffect(() => {
    if (takeLinkFocus()) requestAnimationFrame(() => input.current?.focus())
  }, [])

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    const href = value.trim()
    if (!/^https?:\/\/\S+$/i.test(href)) {
      setProblem("Give a link that starts with http:// or https://.")
      return
    }
    const wrong = check?.(href)
    if (wrong) {
      setProblem(wrong)
      return
    }
    onSubmit(href)
  }

  return (
    // Selected, the block is ringed; typing in its field, the field's own ring says enough.
    <div className={cn("rounded-[12px] bg-sunken p-3", selected && "ring-2 ring-brand ring-offset-2 ring-offset-sheet focus-within:ring-0 focus-within:ring-offset-0")}>
      <form onSubmit={submit} noValidate className="flex items-center gap-2">
        <input
          ref={input}
          type="url"
          inputMode="url"
          aria-label={label}
          aria-describedby={hint || problem ? `${id}-note` : undefined}
          aria-invalid={problem ? true : undefined}
          placeholder={label}
          value={value}
          onChange={(e) => {
            setValue(e.target.value)
            setProblem(null)
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") onEscape?.()
          }}
          className="h-9 min-w-0 flex-1 select-text rounded-lg bg-raised px-3 text-ui-sm text-ink shadow-e1 outline-none placeholder:text-ink-3 focus-visible:ring-2 focus-visible:ring-brand max-sm:h-11"
        />
        <Button type="submit" className="h-9 shrink-0 max-sm:h-11">
          {action}
        </Button>
      </form>
      {problem || hint ? (
        <p id={`${id}-note`} role={problem ? "alert" : undefined} className={cn("mt-2 text-meta", problem ? "text-danger-ink" : "text-ink-3")}>
          {problem || hint}
        </p>
      ) : null}
    </div>
  )
}
