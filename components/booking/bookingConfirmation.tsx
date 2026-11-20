"use client"

// A public booking page's booked end (content.md K06): the check, the ticket,
// the calendar links and the link that changes or cancels it. It comes with
// the booking flow (gcal-7): a chunk of its own cut the booking pages' shared
// chunk pool into new files. Only the burst loads on its own.
// It is handed what was booked, and reads and writes nothing itself.

import * as React from "react"

import { BookingSpot, longDay, slotTime } from "@/components/booking/bookingTime"
import { CalendarLinks } from "@/components/booking/calendarLinks"
import { Mail } from "@/lib/icons"
import { zoneLabel } from "@/lib/utils/zones"
import type { Booked } from "@/services/bookingService"

export function Confirmation({ booked, tz, h24 }: { booked: Booked; tz: string; h24: boolean }) {
  const cancelUrl = typeof window === "undefined" ? "" : `${window.location.origin}/booking/${booked.cancel_token}`
  const first = (booked.owner_name || "").split(/\s+/)[0]

  // The area's one public celebration: someone outside the workspace just did
  // the thing. Once, from the check, never under reduced motion.
  const check = React.useRef<SVGGElement>(null)
  const fired = React.useRef(false)
  React.useEffect(() => {
    if (fired.current) return
    fired.current = true
    let live = true
    // The burst's code comes when it is wanted: the page's rare happy end
    // doesn't ride with every outsider's first screen.
    const t = setTimeout(() => {
      void import("@/lib/celebrate").then(({ celebrate, prefersReducedMotion }) => {
        if (live && !prefersReducedMotion()) celebrate(check.current)
      })
    }, 420)
    return () => {
      live = false
      clearTimeout(t)
    }
  }, [])

  return (
    <div className="flex flex-col items-center px-5 pb-8 pt-8 text-center sm:px-9 sm:pb-9 sm:pt-10" data-booked="">
      <BookingSpot checkRef={check} owner={booked.owner_name} />
      <h1 className="mt-4 text-title-2 text-ink">You&apos;re booked{first ? ` with ${first}` : ""}</h1>
      <div className="mt-5 w-full rounded-xl bg-sunken p-4 text-left" data-ticket="">
        <p className="text-heading font-semibold text-ink">{longDay(booked.start, tz)}</p>
        <p className="mt-0.5 text-ui text-ink-2 tabular-nums">
          {slotTime(booked.start, tz, h24)} – {slotTime(booked.end, tz, h24)} · {zoneLabel(tz)}
        </p>
        {booked.emailed ? (
          <>
            <p className="mt-3 inline-flex items-center gap-2 text-ui-sm text-ink-2" data-emailed="">
              <Mail className="size-3.5 text-ink-3" aria-hidden="true" /> We&apos;ve emailed you the invite
            </p>
            {/* The server emails a reminder a day and an hour before (gcal-7), only where it emails at all. */}
            <p className="mt-0.5 text-ui-sm text-ink-2" data-reminders="">
              We&apos;ll remind you a day and an hour before.
            </p>
          </>
        ) : null}
        <CalendarLinks id={booked.booking_id} title={`${booked.title} with ${booked.owner_name}`} start={booked.start} end={booked.end} />
      </div>
      {/* The link moves or cancels it (gcal-7). It shows whether or not the
          email went out (CAL-BUG-15). */}
      <p className="mt-4 max-w-sm text-meta text-ink-3" data-cancel-link="">
        {booked.emailed ? "To change or cancel, use the link in your email, or this one: " : "Keep this link to change or cancel: "}
        <a className="break-all text-ink-2 underline underline-offset-2" href={cancelUrl}>
          {cancelUrl}
        </a>
      </p>
    </div>
  )
}
