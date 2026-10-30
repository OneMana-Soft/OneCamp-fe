"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { toast } from "@/hooks/use-toast"
import { Clock } from "@/lib/icons"
import { responseOf } from "@/lib/calendar/answers"
import type { Answer } from "@/lib/calendar/eventsApi"
import type { EventProposal } from "@/types/calendar"
import { GoingControl } from "@/components/calendar/rsvp/goingControl"
import { Proposals } from "@/components/calendar/rsvp/proposalsChunk"
import { cn } from "@/lib/utils/helpers/cn"

/** The longest note an answer takes (business/Calendar maxAnswerNoteRunes). */
export const ANSWER_NOTE_MAX = 500

/**
 * A guest's own answer in the event's panel (calendar A2): "Going?" with
 * Yes, Maybe and No, and once they have answered, a note for the organiser
 * ("Ten minutes late"), saved with the answer when the field is left or
 * Enter is pressed. Escape puts the note back as it was. Where the event
 * takes one, another time can be proposed with the answer (calendar head 4),
 * and taken back while it stands.
 */
export function YourAnswer({
  answer,
  note,
  organiserName,
  onAnswer,
  proposal,
  proposeFrom,
  className,
}: {
  answer: string | undefined
  note: string | undefined
  organiserName: string
  /** Sends an answer, with a note and another time when given (null takes it back): true when it went, false when it couldn't, null when it wasn't sent. */
  onAnswer: (a: Answer, note?: string, proposal?: EventProposal | null) => Promise<boolean | null>
  /** The time the guest proposed, while it stands. */
  proposal?: EventProposal
  /** The event's own time, where it takes a proposal. */
  proposeFrom?: { start: Date; end: Date }
  className?: string
}) {
  const saved = note ?? ""
  const [draft, setDraft] = useState(saved)
  useEffect(() => setDraft(saved), [saved])
  const [proposing, setProposing] = useState(false)
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
        <>
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
          {proposal ? (
            <Proposals.View
              fallback={<div className="min-h-8" />}
              render={(m) => <m.YourProposal proposal={proposal} onTakeBack={() => onAnswer(given, undefined, null)} />}
            />
          ) : proposing && proposeFrom ? (
            <Proposals.View
              fallback={<div role="status" aria-label="Opening the times" className="h-[7.75rem] rounded-lg bg-sunken" />}
              render={(m) => <m.ProposeTime from={proposeFrom} onPropose={(p) => onAnswer(given, undefined, p)} onClose={() => setProposing(false)} />}
            />
          ) : proposeFrom ? (
            <Button
              type="button"
              variant="ghost"
              size="xs"
              className="-ml-2 text-ink-2"
              onPointerEnter={() => void Proposals.prefetch()}
              onFocus={() => void Proposals.prefetch()}
              onClick={() => setProposing(true)}
              data-propose-open=""
            >
              <Clock aria-hidden="true" />
              Propose a new time
            </Button>
          ) : null}
        </>
      ) : null}
    </section>
  )
}
