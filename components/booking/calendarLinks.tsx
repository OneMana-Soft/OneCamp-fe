"use client"

// A booked time's calendar links (gcal-7), on the booked page and on the
// booking's own page once it moves. Each page carries it, as a chunk of its
// own cut their shared chunk pool into new files.

import * as React from "react"

import { Button } from "@/components/ui/button"
import { googleCalendarUrl, icsFor } from "@/lib/calendar/availability"
import { randomUUID } from "@/lib/utils/randomUUID"

/**
 * A booked time's calendar file and Google Calendar link. The same event as
 * the email's invite (its UID is the booking's id), so a guest who adds both
 * gets one. Never the cancel link: it is the guest's credential, and a
 * calendar event travels far more freely than this page or the email (the
 * server's invite leaves it out too).
 */
export function CalendarLinks({ id, title, start, end }: { id?: string; title: string; start: string; end: string }) {
  const uid = React.useMemo(() => id || randomUUID(), [id])
  const ics = React.useMemo(
    () => URL.createObjectURL(new Blob([icsFor({ uid, title, start, end })], { type: "text/calendar" })),
    [uid, title, start, end],
  )
  React.useEffect(() => () => URL.revokeObjectURL(ics), [ics])
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      <Button asChild variant="secondary" size="sm">
        <a href={ics} download="booking.ics">Add to calendar (.ics)</a>
      </Button>
      <Button asChild variant="secondary" size="sm">
        <a href={googleCalendarUrl({ title, start, end })} target="_blank" rel="noreferrer">
          Google Calendar
        </a>
      </Button>
    </div>
  )
}
