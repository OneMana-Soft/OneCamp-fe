"use client"

import * as React from "react"
import { Input } from "@/components/ui/input"
import { isComposingKey } from "@/lib/keys/ime"
import { inlineInput } from "@/lib/ui/fieldRow"
import { propertyValue } from "@/lib/ui/propertyRow"
import { cn } from "@/lib/utils/helpers/cn"

/**
 * A value typed in the task panel (the estimate, and a project's text,
 * number, money and link fields): the panel's ghost value button at rest, the
 * size of every other value, and a box only while it is typed in.
 *
 * It was a ghost box at rest too, which a touch screen draws at 16px so iOS
 * doesn't zoom in on it (globals.css, NO ZOOM ON FOCUS), so on a phone "Add
 * estimate" stood larger than every value around it, and its 44px box made
 * the rows' gaps uneven (PTC-44).
 *
 * Enter and leaving the box save the draft (onCommit); Escape puts the value
 * back and saves nothing. A key that ends the edit gives the focus back to the
 * value, so the keyboard stays where it was.
 */
export function InlineEdit({
  id,
  value,
  placeholder,
  onCommit,
  prefix,
  inputMode,
  spellCheck,
  className,
  inputClassName,
}: {
  id: string
  /** What the value reads as at rest, and the box's first draft. */
  value: string
  /** What an empty value says at rest, and in the empty box. */
  placeholder: string
  onCommit: (draft: string) => void
  /** Beside the value or the box once there is one: a currency. */
  prefix?: React.ReactNode
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"]
  spellCheck?: boolean
  /** The value's own classes at rest (a width, tabular figures). */
  className?: string
  /** The box's own classes (its width). */
  inputClassName?: string
}) {
  const [editing, setEditing] = React.useState(false)
  const [draft, setDraft] = React.useState(value)
  const cancelled = React.useRef(false)
  const byKey = React.useRef(false)
  const button = React.useRef<HTMLButtonElement>(null)

  React.useEffect(() => {
    if (!editing && byKey.current) {
      byKey.current = false
      button.current?.focus()
    }
  }, [editing])

  const finish = () => {
    setEditing(false)
    if (cancelled.current) {
      cancelled.current = false
      return
    }
    if (draft !== value) onCommit(draft)
  }

  return (
    <span className="inline-flex min-w-0 max-w-full items-center">
      {prefix && (value || editing) && <span className="mr-1 shrink-0 text-xs text-muted-foreground">{prefix}</span>}
      {editing ? (
        <Input
          id={id}
          // As tall as the value it stands in for, on a phone too: a 44px box
          // would push the rows under it down while it is typed in.
          dense
          autoFocus
          value={draft}
          inputMode={inputMode}
          spellCheck={spellCheck}
          placeholder={placeholder}
          autoComplete="off"
          onChange={(e) => setDraft(e.target.value)}
          onBlur={finish}
          onKeyDown={(e) => {
            // An input method's Enter picks a word and its Escape drops one.
            if (isComposingKey(e.nativeEvent)) return
            if (e.key === "Enter") {
              byKey.current = true
              e.currentTarget.blur()
            }
            if (e.key === "Escape") {
              // Handled: the panel this value sits in stays open.
              e.preventDefault()
              cancelled.current = true
              byKey.current = true
              e.currentTarget.blur()
            }
          }}
          className={cn(inlineInput, prefix ? "ml-0" : undefined, inputClassName)}
        />
      ) : (
        <button
          ref={button}
          id={id}
          type="button"
          data-inline-edit=""
          data-touch-target=""
          onClick={() => {
            setDraft(value)
            setEditing(true)
          }}
          className={cn(propertyValue, "w-fit min-w-0", prefix && value ? "ml-0" : undefined, !value && "text-ink-3", className)}
        >
          <span className="truncate">{value || placeholder}</span>
        </button>
      )}
    </span>
  )
}
