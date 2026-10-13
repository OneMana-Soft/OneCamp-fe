"use client"

// A guest's own booking, from the link they were given (content.md K06,
// manage): the ticket in the public frame, and a way to cancel it.

import { use, useEffect, useState } from "react"
import { Loader2 } from "@/lib/icons"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { browserTZ } from "@/lib/utils/timeZone"
import { cn } from "@/lib/utils/helpers/cn"
import { cancelBooking, getBooking, type BookingView } from "@/services/bookingService"
import { publicTrouble, retryDelayMs, retryingText, type PublicTrouble } from "@/services/publicApi"
import { PaperCard, PublicFrame } from "@/components/guest/PublicFrame"
import { PublicGone } from "@/components/guest/publicStates"
import { BookingSpot, longDay, slotTime, zoneLabel } from "@/components/booking/BookingFlow"

export default function ManageBooking({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params)
  const [booking, setBooking] = useState<BookingView | null>(null)
  const [state, setState] = useState<"loading" | "ready" | "missing">("loading")
  // Too many requests from here, or no answer: said, and asked again later.
  // It used to read "We couldn't find that booking" (CAL-BUG-14).
  const [trouble, setTrouble] = useState<Exclude<PublicTrouble, "gone"> | null>(null)
  const [asking, setAsking] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [tz, setTz] = useState("UTC")
  // The guest cancelled it here, just now: the answer says whether the owner was told.
  const [cancelledHere, setCancelledHere] = useState(false)

  useEffect(() => setTz(browserTZ()), [])
  useEffect(() => {
    let live = true
    let failures = 0
    let timer: ReturnType<typeof setTimeout> | undefined
    const attempt = async () => {
      const res = await getBooking(token)
      if (!live) return
      if (res.ok) {
        setTrouble(null)
        setBooking(res.data)
        setState("ready")
        return
      }
      const t = publicTrouble(res.status)
      if (t === "gone") {
        setState("missing")
        return
      }
      setTrouble(t)
      timer = setTimeout(() => void attempt(), retryDelayMs(failures++, res.retryAfter))
    }
    void attempt()
    return () => {
      live = false
      clearTimeout(timer)
    }
  }, [token])

  if (state === "missing") {
    return <PublicGone surface="booked" title="We couldn't find that booking" detail="Check the link in your confirmation." />
  }

  const cancel = async () => {
    setBusy(true)
    setError("")
    const res = await cancelBooking(token)
    setBusy(false)
    if (res.ok) {
      setBooking(res.data)
      setCancelledHere(true)
      setAsking(false)
    } else setError(res.msg || "Couldn't cancel. Try again.")
  }

  const past = !!booking && new Date(booking.end) < new Date()
  const first = (booking?.owner_name || "").split(/\s+/)[0]
  const owner = first || "They"
  // A page deleted or switched off takes no bookings: no way back to it.
  const pageLive = booking?.page_live !== false
  // What happened, as far as this page knows (CAL-BUG-5): the owner is said
  // to have been told only when the server says they were.
  const cancelledLine = !booking?.cancelled
    ? ""
    : booking.cancelled_by_host
      ? `${owner} cancelled this meeting.`
      : cancelledHere
        ? booking.owner_told
          ? `${owner} has been told. Their calendar is clear again.`
          : `${first ? `${first}'s` : "Their"} calendar is clear again.`
        : "This meeting is cancelled."
  return (
    <PublicFrame surface="booked" header={false} mainClassName="px-4 pt-6 sm:pt-[72px]">
      <PaperCard className="max-w-[560px] rounded-[16px] px-5 pb-8 pt-8 shadow-e1 sm:px-9" data-manage-booking="">
        {state === "loading" || !booking ? (
          <div role="status" aria-label="Loading your booking" className="flex flex-col items-center gap-3">
            {trouble ? (
              <p className="text-ui-sm text-ink-2" data-booking-retrying="">
                {retryingText[trouble]}
              </p>
            ) : null}
            <Skeleton className="size-20 rounded-[24px]" />
            <Skeleton className="h-6 w-56" />
            <Skeleton className="h-28 w-full rounded-xl" />
          </div>
        ) : (
          <div className="flex flex-col items-center text-center">
            {!booking.cancelled && !past ? <BookingSpot /> : null}
            <h1 className="mt-4 text-title-2 text-ink">{booking.title}</h1>
            {/* Who it is with, on a line of its own: the title often names them
                already, and "Intro call with Sam with Sam Rivera" read twice. */}
            <p className="mt-0.5 text-ui text-ink-2">With {booking.owner_name}</p>
            <div className={cn("mt-5 w-full rounded-xl bg-sunken p-4 text-left", booking.cancelled && "opacity-55")} data-ticket="">
              <div className="flex items-center gap-2">
                <p className={cn("text-heading font-semibold text-ink", booking.cancelled && "line-through")}>{longDay(booking.start, tz)}</p>
                {booking.cancelled ? <span className="rounded-[5px] bg-press px-1.5 text-micro font-medium leading-[18px] text-ink-2">Cancelled</span> : null}
              </div>
              <p className={cn("mt-0.5 text-ui text-ink-2 tabular-nums", booking.cancelled && "line-through")}>
                {slotTime(booking.start, tz, false)} – {slotTime(booking.end, tz, false)} · {zoneLabel(tz)}
              </p>
            </div>

            {booking.cancelled ? (
              <>
                <p className="mt-4 max-w-sm text-ui-sm text-ink-2" data-cancelled-line="">{cancelledLine}</p>
                {pageLive && booking.slug ? (
                  <Button asChild size="sm" className="mt-4">
                    <a href={`/book/${booking.slug}`}>Book another time</a>
                  </Button>
                ) : null}
              </>
            ) : past ? (
              <>
                <p className="mt-4 text-ui-sm text-ink-2">This meeting has happened.</p>
                {pageLive && booking.slug ? (
                  <Button asChild size="sm" variant="secondary" className="mt-4">
                    <a href={`/book/${booking.slug}`}>Book again</a>
                  </Button>
                ) : null}
              </>
            ) : asking ? (
              <div className="content-rise mt-5 w-full rounded-xl bg-raised p-4 text-left shadow-e1">
                <p className="text-ui font-medium text-ink">Cancel this meeting?</p>
                <p className="mt-0.5 text-ui-sm text-ink-2">It comes off {first ? `${first}'s` : "their"} calendar, and the time is free again.</p>
                {error ? <p role="alert" className="mt-2 text-meta text-danger-ink">{error}</p> : null}
                <div className="mt-3 flex justify-end gap-2">
                  <Button variant="ghost" size="sm" onClick={() => setAsking(false)} disabled={busy}>
                    Keep it
                  </Button>
                  <Button variant="destructive" size="sm" onClick={() => void cancel()} disabled={busy} className="relative">
                    <span className={cn(busy && "invisible")}>Cancel booking</span>
                    {busy ? <Loader2 className="absolute size-3.5 animate-spin" aria-label="Cancelling" /> : null}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="mt-5 flex flex-wrap justify-center gap-2">
                <Button variant="ghost" size="sm" className="text-danger-ink hover:text-danger-ink" onClick={() => setAsking(true)}>
                  Cancel booking
                </Button>
              </div>
            )}
          </div>
        )}
      </PaperCard>
    </PublicFrame>
  )
}
