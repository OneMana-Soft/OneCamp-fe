"use client"

// A guest moves their booking from its link (gcal-7): the page's own free
// times on the booking page's picker, in the guest's zone, then the move. It
// comes with the booking's own page, which shows the answer.

import * as React from "react"
import { Button } from "@/components/ui/button"

import { Skeleton } from "@/components/ui/skeleton"
import type { Slot } from "@/lib/calendar/availability"
import { readsTwelveHour } from "@/lib/utils/date/clock"
import { rescheduleBooking, type BookingView } from "@/services/bookingService"
import { publicTrouble, retryingText } from "@/services/publicApi"
import { DayAndTimes, TimeZoneButton, useSlotPicker } from "@/components/booking/slotPicker"

export { CalendarLinks } from "@/components/booking/calendarLinks"

/** What a move that got no answer (offline, 5xx) says; the booking keeps its time. */
export const MOVE_FAILED = "Couldn't move it. Check your connection and try again."

export function MovePicker({
  token,
  slug,
  tz,
  onTz,
  onMoved,
  onStopped,
  onClose,
}: {
  token: string
  slug: string
  tz: string
  onTz: (tz: string) => void
  /** The server moved it: its answer, the booking at its new time. */
  onMoved: (view: BookingView) => void
  /** No more moves for now (429): the server's own words. The page closes the picker. */
  onStopped: (msg: string) => void
  /** The guest keeps their time: the page closes the picker and offers Change time and Cancel booking again. */
  onClose: () => void
}) {
  const picker = useSlotPicker(slug, tz)
  const [h24, setH24] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState("")
  const sending = React.useRef(false)
  const ref = React.useRef<HTMLElement>(null)

  React.useEffect(() => {
    setH24(!readsTwelveHour())
    // On a phone the month opens under the ticket, below the fold.
    ref.current?.scrollIntoView?.({ block: "nearest" })
  }, [])

  const move = async (s: Slot) => {
    if (sending.current) return
    sending.current = true
    setBusy(true)
    setError("")
    const res = await rescheduleBooking(token, s.start)
    sending.current = false
    setBusy(false)
    if (res.ok) return onMoved(res.data)
    if (res.status === 429) return onStopped(res.msg)
    if (publicTrouble(res.status) === "unreachable") return setError(MOVE_FAILED)
    // Refused (taken meanwhile, no longer free): the server's why, and the times asked again.
    setError(res.msg)
    picker.setSplit(null)
    picker.refresh()
  }

  return (
    <section ref={ref} aria-label="Change time" aria-busy={busy} className="mt-5 self-stretch border-t border-line pt-4 text-left max-sm:-mx-5 sm:-mx-9" data-move-picker="">
      <div className="flex flex-wrap items-center justify-between gap-2 px-5 sm:px-6">
        <div className="flex w-full items-center justify-between gap-2">
          <h2 className="text-heading font-semibold text-ink">Pick a new time</h2>
          <Button variant="ghost" size="sm" className="max-sm:h-11" onClick={onClose} disabled={busy}>
            Keep this time
          </Button>
        </div>
        <TimeZoneButton tz={tz} onTz={onTz} h24={h24} onH24={setH24} className="max-w-full" />
      </div>
      {error ? (
        <p role="alert" className="mx-5 mt-2 text-meta text-danger-ink sm:mx-6">
          {error}
        </p>
      ) : null}
      {busy ? (
        <p role="status" className="mx-5 mt-2 text-meta text-ink-2 sm:mx-6">
          Moving it…
        </p>
      ) : null}
      {picker.state === "ready" ? (
        <DayAndTimes picker={picker} tz={tz} onTz={onTz} h24={h24} onH24={setH24} onNext={(s) => void move(s)} next="Move here" />
      ) : picker.state === "loading" ? (
        <div role="status" aria-label="Loading the times" className="px-5 pb-6 pt-4 sm:px-6">
          {picker.trouble ? <p className="mb-2 text-ui-sm text-ink-2">{retryingText[picker.trouble]}</p> : null}
          <Skeleton className="h-64 w-full rounded-xl" />
        </div>
      ) : (
        <p className="px-5 pb-6 pt-4 text-ui-sm text-ink-2 sm:px-6">This page isn&apos;t taking bookings now.</p>
      )}
    </section>
  )
}
