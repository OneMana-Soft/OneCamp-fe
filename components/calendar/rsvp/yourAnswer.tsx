"use client"

import { useEffect, useState } from "react"
import { Input } from "@/components/ui/input"
import { toast } from "@/hooks/use-toast"
import { responseOf } from "@/lib/calendar/answers"
import type { Answer } from "@/lib/calendar/eventsApi"
import { GoingControl } from "@/components/calendar/rsvp/goingControl"
import { cn } from "@/lib/utils/helpers/cn"

/** The longest note an answer takes (business/Calendar maxAnswerNoteRunes). */
export const ANSWER_NOTE_MAX = 500

/**
 * A guest's own answer in the event's panel (calendar A2): "Going?" with
 * Yes, Maybe and No, and once they have answered, a note for the organiser
 * ("Ten minutes late"), saved with the answer when the field is left or
 * Enter is pressed. Escape puts the note back as it was.
 */
export function YourAnswer({
  answer,
  note,
  organiserName,
  onAnswer,
  className,
}: {
  answer: string | undefined
  note: string | undefined
  organiserName: string
  /** Sends an answer, with a note when one is given: true when it went, false when it couldn't, null when it wasn't sent. */
  onAnswer: (a: Answer, note?: string) => Promise<boolean | null>
  className?: string
}) {
  const saved = note ?? ""
  const [draft, setDraft] = useState(saved)
  useEffect(() => setDraft(saved), [saved])
  const given = responseOf(answer)

  const saveNote = async () => {
    const next = draft.trim()
    if (given === "needs_action" || next === saved) return
    const ok = await onAnswer(given, next)
    if (ok === null) setDraft(saved)
    else if (!ok) toast({ title: "Couldn't save your note. Try again.", variant: "destructive" })
  }

  return (
    <section className={cn("space-y-2", className ?? "mt-6")} data-event-answer="">
      <GoingControl answer={answer} onAnswer={(a) => onAnswer(a)} />
      {given !== "needs_action" ? (
        <Input
          value={draft}
          maxLength={ANSWER_NOTE_MAX}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => void saveNote()}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault()
              e.currentTarget.blur()
            } else if (e.key === "Escape" && draft !== saved) {
              // A note being changed goes back to what was saved; with nothing changed, Esc is the panel's.
              e.stopPropagation()
              setDraft(saved)
            }
          }}
          data-escape-own={draft !== saved ? "" : undefined}
          placeholder={`Add a note for ${organiserName}`}
          aria-label="Your note with your answer"
          className="h-8"
        />
      ) : null}
    </section>
  )
}
