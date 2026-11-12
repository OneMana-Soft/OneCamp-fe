"use client"

import * as React from "react"

import { cn } from "@/lib/utils/helpers/cn"
import { Input } from "@/components/ui/input"
import { DateTimeField } from "@/components/ui/date-time-field"
import { fieldKeyDown } from "@/lib/keys/ime"
import { isTouchScreen } from "@/lib/ui/touchScreen"
import { toLocalInputValue } from "@/lib/messages/schedulePresets"
import { parseWhen, whenProblem, yearOn, type WhenWindow } from "@/lib/time/whenWords"

/**
 * WHEN, IN WORDS (H3; linear-45 #1): a moment of the person's choosing, typed
 * the way it is said ("tomorrow 9", "in 3 days", "next Monday", "Dec 3
 * 14:00") with the moment said back under it as it is typed, Enter to pick
 * it, and the app's date and time fields under that to pick one by hand.
 * Later's Remind me, Send later's custom time, Pause's Custom… and the
 * Inbox's snooze take it, each with its own window (lib/time/whenWords).
 *
 * One value, "yyyy-MM-ddTHH:mm" (DateTimeField's): the words move the fields
 * to the moment they name, and "" while they name none that can be used, so
 * the picker's own action waits; cleared, they give the moment picked before
 * back, and a pick in the fields clears them. One line under the box says
 * the moment or why not, politely live, with the id the picker's action
 * points at (messageId). The box takes the focus as the field opens, but on a
 * touch screen, where it would throw up the keyboard over the sheet (the
 * sheet takes it, components/ui/drawer). Loaded with its picker, never on a
 * first load.
 *
 *   WhenField
 *   ├── "When" box           the words; Enter picks
 *   ├── the line             "tomorrow at 9:00 AM", or why not
 *   └── DateTimeField        fieldsLabel, "Pick a date and time"
 */
export function WhenField({
  value,
  onChange,
  onPick,
  within = {},
  messageId,
  fieldsLabel = "Pick a date and time",
  className,
}: {
  value: string
  onChange: (value: string) => void
  /** Enter on words that name a moment the window takes. */
  onPick: (at: Date) => void
  /** The moments the picker takes, and its own words for the rest (sendLaterProblem). */
  within?: WhenWindow
  /** The line's id, for the picker's action to point at while it waits. */
  messageId?: string
  fieldsLabel?: string
  className?: string
}) {
  const auto = React.useId()
  const lineId = messageId ?? `${auto}-line`
  const box = React.useRef<HTMLInputElement>(null)
  const [text, setText] = React.useState("")
  // The moment the fields held before the words, given back when they are cleared.
  const before = React.useRef(value)
  React.useEffect(() => {
    if (!isTouchScreen()) box.current?.focus({ preventScroll: true })
  }, [])

  const now = new Date()
  const read = parseWhen(text, now, within)
  const picked = read && "at" in read ? read : null
  const at = value ? new Date(value) : null
  const line = read ? ("at" in read ? read.words : read.problem) : whenProblem(at, now, within)
  const wrong = Boolean(line) && !picked

  const type = (next: string) => {
    if (!text.trim()) before.current = value
    setText(next)
    const r = parseWhen(next, new Date(), within)
    onChange(r === null ? before.current : "at" in r ? toLocalInputValue(r.at) : "")
  }

  return (
    <div data-slot="when-field" className={cn("flex min-w-0 flex-col gap-1.5", className)}>
      {/* A plain label, Label's look: the picker's chunk keeps off Radix's. */}
      <label htmlFor={`${auto}-box`} className="text-ui-sm font-medium leading-none text-ink-2">
        When
      </label>
      <Input
        ref={box}
        id={`${auto}-box`}
        type="text"
        autoComplete="off"
        spellCheck={false}
        enterKeyHint="done"
        placeholder="tomorrow 9, in 2 hours"
        value={text}
        aria-invalid={text.trim() && wrong ? true : undefined}
        aria-describedby={line ? lineId : undefined}
        onChange={(e) => type(e.target.value)}
        onKeyDown={fieldKeyDown((e) => {
          if (e.key !== "Enter" || !text.trim()) return
          e.preventDefault()
          if (picked) onPick(picked.at)
        })}
      />
      <p id={lineId} aria-live="polite" data-when-line={picked ? "moment" : line ? "problem" : undefined} className={cn("flex min-h-[22px] items-center text-meta", wrong && "text-danger-ink")}>
        {picked ? <span className="rounded-sm bg-camp-sky-tint px-1.5 py-0.5 font-medium tabular-nums text-camp-sky-ink first-letter:uppercase">{picked.words}</span> : line}
      </p>
      <span id={`${auto}-fields`} className="pt-0.5 text-meta text-ink-3">
        {fieldsLabel}
      </span>
      <DateTimeField
        aria-labelledby={`${auto}-fields`}
        aria-describedby={line && !text.trim() ? lineId : undefined}
        aria-invalid={wrong && !text.trim() ? true : undefined}
        value={value}
        min={toLocalInputValue(within.min ?? now)}
        max={toLocalInputValue(within.max ?? yearOn(now))}
        onChange={(v) => {
          setText("")
          onChange(v)
        }}
      />
    </div>
  )
}
