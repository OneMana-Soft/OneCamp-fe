"use client"

import { CalendarClock } from "@/lib/icons"
import { Button } from "@/components/ui/button"
import type { FaceGuest } from "@/components/calendar/rsvp/guestFaces"

/** Who can't go, in plain words: one guest by the name the list shows, more by how many. Pure. */
export function cantGoLine(guests: FaceGuest[]): string {
  return guests.length === 1 ? `${guests[0].name} can't go` : `${guests.length} people can't go`
}

/**
 * The organiser's offer of a better time once a guest has said no (gcal-16),
 * under the event's guests: who can't go, and Find a better time, the
 * assistant's one dialog, which proposes times and writes nothing until one
 * is picked. With the assistant off it only says who can't go.
 */
export function RescheduleOffer({ guests, onFind }: { guests: FaceGuest[]; onFind?: () => void }) {
  if (!guests.length) return null
  return (
    <div className="mt-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-2 rounded-lg bg-sunken px-3 py-2.5" data-reschedule-offer="">
      <p className="flex min-w-0 items-center gap-2 text-sm text-foreground">
        <CalendarClock className="size-4 shrink-0 text-ink-3" aria-hidden="true" />
        <span className="min-w-0">{cantGoLine(guests)}</span>
      </p>
      {onFind ? (
        <Button type="button" variant="secondary" size="sm" className="pointer-coarse:h-11" onClick={onFind}>
          Find a better time
        </Button>
      ) : null}
    </div>
  )
}
