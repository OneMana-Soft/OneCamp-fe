"use client"

import { useCallback, useMemo, useRef, useState } from "react"
import { parseEventText, parsedRange, type ParsedEvent } from "@/lib/calendar/parseEventText"
import type { EventFormValues } from "@/lib/calendar/eventForm"

/** Whether a parse names a day, a time or a length. Pure. */
const namesWhen = (p: ParsedEvent) => !!p.date || p.startMinutes !== undefined || p.durationMinutes !== undefined
/** What a parse names of when, to tell whether a change of title changed it. Pure. */
const whenKey = (p: ParsedEvent) => `${p.date?.getTime() ?? ""}|${p.startMinutes ?? ""}|${p.durationMinutes ?? ""}`

/**
 * Plain words typed in a new event's title ("Lunch with Ada tomorrow 1pm"),
 * read as the quick card reads them (parseEventText, parsedRange): the day,
 * time and length they name move the event from where it stood before they
 * were typed, and it is saved titled without them. Only typing moves it: a
 * title it opens with (a duplicate's) moves nothing, and a time picked after
 * the words stands until the words change. `onChange` is the form's; `saved`
 * is the values to save; `reset` forgets where it stood and the words that
 * moved it, for a form that stays mounted and opens again.
 */
export function usePlainWords(
  values: EventFormValues,
  setValues: (next: EventFormValues) => void,
): { onChange: (next: EventFormValues) => void; saved: EventFormValues; reset: () => void } {
  const base = useRef<{ start: Date; end: Date } | null>(null)
  // What the words that last moved it named: only those leave its title.
  const [moved, setMoved] = useState("")
  const reset = useCallback(() => {
    base.current = null
    setMoved("")
  }, [])
  const parsed = useMemo(() => parseEventText(values.title), [values.title])
  const onChange = (next: EventFormValues) => {
    if (next.title === values.title || next.allDay) return setValues(next)
    const words = parseEventText(next.title)
    if (!namesWhen(parsed) || !base.current) base.current = { start: values.start, end: values.end }
    if (!namesWhen(words) || whenKey(words) === whenKey(parsed)) return setValues(next)
    const b = base.current
    setMoved(whenKey(words))
    setValues({ ...next, ...parsedRange(words, b.start, Math.round((b.end.getTime() - b.start.getTime()) / 60000)) })
  }
  const typed = namesWhen(parsed) && whenKey(parsed) === moved && !!parsed.title
  return { onChange, saved: typed ? { ...values, title: parsed.title } : values, reset }
}
