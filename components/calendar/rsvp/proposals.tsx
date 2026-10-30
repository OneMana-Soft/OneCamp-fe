"use client"

import { useId, useState } from "react"
import { format, isValid, parse } from "date-fns"
import { Button } from "@/components/ui/button"
import { DateField, TimeField, timeValueOf } from "@/components/ui/date-field"
import { Clock } from "@/lib/icons"
import { movedEnd } from "@/lib/calendar/spanMove"
import { busyWith } from "@/lib/ui/busyWith"
import { dayAndTime } from "@/lib/utils/date/clock"
import type { EventProposal } from "@/types/calendar"
import type { FaceGuest } from "@/components/calendar/rsvp/guestFaces"

// Proposing another time (calendar head 4): a chunk of its own
// (proposalsChunk), drawn only where a proposal shows or is asked for, so the
// event's panel and the guest's public page carry none of it before.

/**
 * The time a day ("yyyy-MM-dd") and two times ("HH:mm") on the reader's own
 * clock make: null while a part is missing or it doesn't end after it starts.
 */
export function proposalOf(day: string, from: string, until: string): EventProposal | null {
  if (!day || !from || !until) return null
  const at = (time: string) => parse(`${day} ${time}`, "yyyy-MM-dd HH:mm", new Date())
  const start = at(from)
  const end = at(until)
  if (!isValid(start) || !isValid(end) || end <= start) return null
  return { start: start.toISOString(), end: end.toISOString() }
}

/**
 * A proposed time, never broken inside: a range on one day stays whole, and
 * one across days breaks after its dash alone.
 */
function When({ p }: { p: EventProposal }) {
  const start = new Date(p.start)
  const end = new Date(p.end)
  const text = dayAndTime(start, end)
  const cut = text.indexOf(" – ")
  return (
    <span className="tabular-nums text-ink">
      {start.toDateString() === end.toDateString() || cut < 0 ? (
        <span className="whitespace-nowrap">{text}</span>
      ) : (
        <>
          <span className="whitespace-nowrap">{text.slice(0, cut + 2)}</span> <span className="whitespace-nowrap">{text.slice(cut + 3)}</span>
        </>
      )}
    </span>
  )
}

/**
 * Another time to propose with the answer: a day, from and until, the event's
 * own to begin with. Moving From keeps the time's length, as the event form's
 * start does.
 */
export function ProposeTime({
  from,
  onPropose,
  onClose,
}: {
  /** The event's own time. */
  from: { start: Date; end: Date }
  /** Sends the time: true when it went (the form closes), false when it couldn't (said by the sender), null when it wasn't sent. */
  onPropose: (p: EventProposal) => Promise<boolean | null>
  onClose: () => void
}) {
  const [day, setDay] = useState(() => format(from.start, "yyyy-MM-dd"))
  const [start, setStart] = useState(() => timeValueOf(from.start))
  const [end, setEnd] = useState(() => timeValueOf(from.end))
  const [busy, setBusy] = useState(false)
  const captionId = useId()
  const proposed = proposalOf(day, start, end)
  const moveFrom = (next: string) => {
    setStart(next)
    const to = proposalOf(day, next, "23:59")
    if (proposed && to) setEnd(timeValueOf(movedEnd(new Date(proposed.start), new Date(proposed.end), new Date(to.start))))
  }
  const send = async () => {
    if (!proposed) return
    setBusy(true)
    const ok = await onPropose(proposed)
    setBusy(false)
    if (ok) onClose()
  }
  return (
    <div role="group" aria-labelledby={captionId} className="grid gap-2 rounded-lg bg-sunken p-2.5" data-propose-time="">
      <p id={captionId} className="flex items-center gap-1.5 text-ui-sm text-ink-2">
        <Clock className="size-3.5 shrink-0" aria-hidden="true" />
        Propose a new time
      </p>
      <DateField aria-label="Day" value={day} onChange={setDay} min={format(new Date(), "yyyy-MM-dd")} dense />
      <div className="flex items-center gap-2 text-ui-sm text-ink-3">
        <div className="min-w-0 flex-1">
          <TimeField aria-label="From" value={start} onChange={moveFrom} dense />
        </div>
        <span>to</span>
        <div className="min-w-0 flex-1">
          <TimeField aria-label="Until" value={end} since={start} onChange={setEnd} dense />
        </div>
      </div>
      {proposed ? null : (
        <p role="alert" className="text-meta text-danger-ink">
          Pick a time that ends after it starts.
        </p>
      )}
      <div className="flex justify-end gap-1">
        <Button type="button" variant="ghost" size="sm" onClick={onClose}>
          Cancel
        </Button>
        <Button type="button" size="sm" busy={busy} onClick={() => void send()}>
          Propose
        </Button>
      </div>
    </div>
  )
}

/** The time the guest proposed, with a way to take it back (a refusal is said by the sender). */
export function YourProposal({ proposal, onTakeBack }: { proposal: EventProposal; onTakeBack: () => Promise<boolean | null> }) {
  const [busy, setBusy] = useState(false)
  const takeBack = async () => {
    setBusy(true)
    await onTakeBack()
    setBusy(false)
  }
  return (
    <div className="flex min-h-8 items-center justify-between gap-2 text-meta text-ink-2" data-your-proposal="">
      <span className="min-w-0">
        You proposed <When p={proposal} />
      </span>
      <Button type="button" variant="ghost" size="xs" busy={busy} onClick={() => void takeBack()}>
        Take it back
      </Button>
    </div>
  )
}

/** A guest's proposed time on their row, used or dismissed by whoever may change the event. */
export function ProposedRow({
  guest,
  proposal,
  onUse,
  onDismiss,
}: {
  guest: FaceGuest
  proposal: EventProposal
  onUse?: (p: EventProposal) => Promise<void>
  onDismiss?: (g: FaceGuest) => Promise<void>
}) {
  const [running, setRunning] = useState<"use" | "dismiss" | null>(null)
  const run = (what: "use" | "dismiss", act: () => Promise<void>) => {
    setRunning(what)
    void act().finally(() => setRunning(null))
  }
  return (
    <div className="mt-1 grid gap-1" data-guest-proposal="">
      <p className="text-meta text-ink-2">
        Proposes <When p={proposal} />
      </p>
      {onUse || onDismiss ? (
        <div className="flex flex-wrap gap-1">
          {onUse ? (
            <Button type="button" variant="secondary" size="xs" {...busyWith(running, "use")} onClick={() => run("use", () => onUse(proposal))}>
              Use this time
            </Button>
          ) : null}
          {onDismiss ? (
            <Button type="button" variant="ghost" size="xs" {...busyWith(running, "dismiss")} aria-label={`Dismiss ${guest.name}'s proposal`} onClick={() => run("dismiss", () => onDismiss(guest))}>
              Dismiss
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
