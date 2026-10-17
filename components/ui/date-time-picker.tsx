"use client"

import * as React from "react"
import { format } from "date-fns"
import { Calendar as CalendarIcon } from "@/lib/icons"

import { cn } from "@/lib/utils/helpers/cn"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { parseEventText, parsedRange } from "@/lib/calendar/parseEventText"
import { clockTime } from "@/lib/utils/date/clock"
import { ix } from "@/lib/ui/interactive"

interface DateTimePickerProps {
  value?: Date
  onChange?: (date: Date) => void
  disabled?: boolean
  /** The trigger's id, so a label's htmlFor (a FormControl's) names it. */
  id?: string
  /** For an end time: the start, so the time list shows durations ("10:15 · 45 min"). */
  since?: Date
  "aria-label"?: string
  "aria-describedby"?: string
  "aria-invalid"?: boolean
}

/** Every quarter hour of a day, as minutes from midnight: 96 options. */
export const QUARTER_HOURS = Array.from({ length: 96 }, (_, i) => i * 15)

/**
 * What a time answers to when typed: its label on the reader's clock ("930am"
 * or "0930"), and the 24-hour clock's with and without its leading zero
 * ("930", "2130"). A label on a 24-hour clock starts with its zero, so "9"
 * found nothing there; now 9 finds 09:00 and 21 finds 21:00 on either clock.
 */
export function typedKeys(minutes: number, label: string): string[] {
  const h = Math.floor(minutes / 60)
  const mm = String(minutes % 60).padStart(2, "0")
  return [label.toLowerCase().replace(/[^\da-z]/g, ""), `${h}${mm}`, `${String(h).padStart(2, "0")}${mm}`]
}

/** How far a key moves the time list's cursor. */
const STEPS = { ArrowDown: 1, ArrowUp: -1, PageDown: 4, PageUp: -4 }

function durationText(minutes: number): string {
  if (minutes <= 0) return ""
  if (minutes < 60) return `${minutes} min`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m ? `${h} h ${m}` : `${h} h`
}

/**
 * The time list (content.md C16): quarter hours in a 160 px scroll list of
 * 28 px rows, the chosen one an ink fill, scrolled into view on open. For an
 * end time it shows how long the event would be.
 *
 * One Tab stop (CA-31): the arrows, Home and End move through the times,
 * typing "9" or "930" jumps to the first that starts so, and Enter or Space
 * picks. Each time is a row of the interaction layer (its ring, its tint).
 */
export function TimeList({
  value,
  onPick,
  since,
  className,
}: {
  /** Minutes from midnight. */
  value: number | null
  onPick: (minutes: number) => void
  since?: number
  className?: string
}) {
  const box = React.useRef<HTMLDivElement>(null)
  React.useEffect(() => {
    const el = box.current?.querySelector<HTMLElement>("[aria-selected='true']")
    if (el && box.current) {
      const top = el.offsetTop - box.current.clientHeight / 2 + el.offsetHeight / 2
      const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
      if (box.current.scrollTo) box.current.scrollTo({ top, behavior: reduce ? "auto" : "smooth" })
    }
    // Scroll once, when the list opens.
  }, [])
  const options = since !== undefined ? QUARTER_HOURS.filter((m) => m > since) : QUARTER_HOURS
  const chosen = options.findIndex((m) => value !== null && Math.abs(value - m) < 8)
  const [cursor, setCursor] = React.useState(Math.max(0, chosen))
  const typed = React.useRef({ text: "", at: 0 })
  const labelOf = (m: number) => clockTime(new Date(2000, 0, 1, Math.floor(m / 60), m % 60))
  const focusAt = (i: number) => {
    const at = Math.min(options.length - 1, Math.max(0, i))
    box.current?.querySelectorAll<HTMLElement>("[role='option']")[at]?.focus()
    setCursor(at)
  }
  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const step = (STEPS as Record<string, number | undefined>)[e.key]
    if (step) focusAt(cursor + step)
    else if (e.key === "Home") focusAt(0)
    else if (e.key === "End") focusAt(options.length - 1)
    else if (/^[\da-z]$/i.test(e.key) && !e.metaKey && !e.ctrlKey && !e.altKey) {
      // Typed within a beat of the last key, it adds to what was typed.
      const now = Date.now()
      typed.current = { text: (now - typed.current.at < 800 ? typed.current.text : "") + e.key.toLowerCase(), at: now }
      const hit = options.findIndex((m) => typedKeys(m, labelOf(m)).some((k) => k.startsWith(typed.current.text)))
      if (hit >= 0) focusAt(hit)
    } else return
    e.preventDefault()
  }
  return (
    <div ref={box} role="listbox" aria-label="Time" data-time-list="" onKeyDown={onKeyDown} className={cn("h-40 overflow-y-auto overscroll-contain p-1", className)}>
      {options.map((m, i) => {
        const selected = value !== null && Math.abs(value - m) < 8
        const d = new Date(2000, 0, 1, Math.floor(m / 60), m % 60)
        return (
          <button
            key={m}
            type="button"
            role="option"
            aria-selected={selected}
            tabIndex={i === cursor ? 0 : -1}
            onFocus={() => setCursor(i)}
            onClick={() => onPick(m)}
            {...ix("row")}
            className={cn("flex h-7 w-full items-center justify-between rounded-md px-2 text-ui-sm tabular-nums", selected ? "bg-ink text-sheet" : "text-ink")}
          >
            <span>{clockTime(d)}</span>
            {since !== undefined ? <span className={cn("text-meta", selected ? "text-sheet/70" : "text-ink-3")}>{durationText(m - since)}</span> : null}
          </button>
        )
      })}
    </div>
  )
}

/**
 * A date and a time in one control (content.md C16). The trigger is a v3
 * input reading "Thu 15 Oct · 9:30 AM"; the popover holds the shared day-cell
 * month and, under a hairline, the quarter-hour time list. Typing a moment in
 * the box at the top ("tomorrow 3pm") is read as you type, with a preview.
 */
export function DateTimePicker({ value, onChange, disabled, id, since, ...aria }: DateTimePickerProps) {
  const [isOpen, setIsOpen] = React.useState(false)
  const [text, setText] = React.useState("")
  const minutes = value ? value.getHours() * 60 + value.getMinutes() : null

  const typed = React.useMemo(() => {
    if (!text.trim()) return null
    const p = parseEventText(text)
    if (!p.date && p.startMinutes === undefined) return null
    return parsedRange(p, value ?? new Date(), 0).start
  }, [text, value])

  const handleDateSelect = (selectedDate: Date | undefined) => {
    if (!selectedDate) return
    const next = value ? new Date(value) : new Date()
    next.setFullYear(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate())
    onChange?.(next)
  }

  const handleTime = (m: number) => {
    const next = value ? new Date(value) : new Date()
    next.setHours(Math.floor(m / 60), m % 60, 0, 0)
    onChange?.(next)
    setIsOpen(false)
  }

  const sinceMinutes = since && value && since.toDateString() === value.toDateString() ? since.getHours() * 60 + since.getMinutes() : undefined

  return (
    <Popover
      open={isOpen}
      onOpenChange={(o) => {
        setIsOpen(o)
        if (!o) setText("")
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          id={id}
          {...aria}
          disabled={disabled}
          data-date-time-trigger=""
          className={cn(
            "flex h-8 w-full items-center gap-2 rounded-lg bg-raised px-2.5 text-left text-ui tabular-nums text-ink shadow-e1 outline-none transition-shadow",
            "focus-visible:focus-halo aria-[invalid=true]:ring-1 aria-[invalid=true]:ring-destructive/60",
            !value && "text-ink-3",
            disabled && "cursor-not-allowed opacity-50",
          )}
        >
          <CalendarIcon className="size-3.5 shrink-0 text-ink-3" aria-hidden="true" />
          <span className="truncate">{value ? `${format(value, "EEE d MMM")} · ${clockTime(value)}` : "Pick a date and time"}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="content-float w-[296px] rounded-xl bg-pop p-0 shadow-e3" align="start">
        <div className="px-3 pt-3">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && typed) {
                e.preventDefault()
                onChange?.(typed)
                setIsOpen(false)
                setText("")
              }
            }}
            placeholder="Type a time, like tomorrow 3pm"
            aria-label="Type a date and time"
            className="h-8 w-full rounded-lg bg-raised px-2.5 text-ui-sm text-ink shadow-e1 outline-none placeholder:text-ink-3 focus-visible:focus-halo"
          />
          {typed ? (
            <p className="mt-1 text-meta text-ink-3">
              {format(typed, "EEE d MMM")} · {clockTime(typed)} · press Enter
            </p>
          ) : null}
        </div>
        <Calendar mode="single" selected={value} onSelect={handleDateSelect} weekStartsOn={1} initialFocus className="p-3 pb-2" />
        <div className="border-t border-line">
          <TimeList value={minutes} onPick={handleTime} since={sinceMinutes} />
        </div>
      </PopoverContent>
    </Popover>
  )
}
