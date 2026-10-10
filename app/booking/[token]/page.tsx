"use client"

// A guest's own booking, from the link they were given: see it, cancel it.

import { use, useEffect, useState } from "react"
import { AlertCircle, CalendarCheck, CalendarX, Loader2 } from "@/lib/icons"
import { Button } from "@/components/ui/button"
import { formatRange } from "@/lib/calendar/availability"
import { browserTZ } from "@/lib/utils/timeZone"
import { cancelBooking, getBooking, type BookingView } from "@/services/bookingService"
import { MadeWithOneCamp } from "@/components/public/MadeWithOneCamp"

export default function ManageBooking({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params)
  const [booking, setBooking] = useState<BookingView | null>(null)
  const [state, setState] = useState<"loading" | "ready" | "missing">("loading")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [tz, setTz] = useState("UTC")

  useEffect(() => setTz(browserTZ()), [])
  useEffect(() => {
    getBooking(token).then((res) => {
      if (res.ok) {
        setBooking(res.data)
        setState("ready")
      } else setState("missing")
    })
  }, [token])

  if (state === "loading") return <Centered><Loader2 className="h-7 w-7 animate-spin text-primary" /></Centered>
  if (state === "missing" || !booking) {
    return (
      <Centered>
        <AlertCircle className="h-8 w-8 text-muted-foreground" />
        <p className="text-base font-semibold">We couldn&apos;t find that booking</p>
        <p className="max-w-sm text-sm text-muted-foreground">Check the link in your confirmation.</p>
      </Centered>
    )
  }

  const past = new Date(booking.end) < new Date()
  return (
    <Centered>
      {booking.cancelled ? <CalendarX className="h-10 w-10 text-muted-foreground" /> : <CalendarCheck className="h-10 w-10 text-primary" />}
      <h1 className="text-2xl font-semibold tracking-tight">{booking.cancelled ? "Cancelled" : `${booking.title} with ${booking.owner_name}`}</h1>
      <p className="text-sm">
        <span className={booking.cancelled ? "line-through" : "font-medium"}>{formatRange(booking.start, booking.end, tz)}</span>
      </p>
      {booking.cancelled ? (
        <>
          <p className="max-w-sm text-sm text-muted-foreground">{booking.owner_name} has been told. Their calendar is clear again.</p>
          <Button asChild variant="outline">
            <a href={`/book/${booking.slug}`}>Book another time</a>
          </Button>
        </>
      ) : past ? (
        <p className="text-sm text-muted-foreground">This meeting has already happened.</p>
      ) : (
        <>
          {error && <p role="alert" className="text-sm text-danger-ink">{error}</p>}
          <Button
            variant="destructive"
            disabled={busy}
            onClick={async () => {
              setBusy(true)
              setError("")
              const res = await cancelBooking(token)
              setBusy(false)
              if (res.ok) setBooking(res.data)
              else setError(res.msg)
            }}
          >
            {busy && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            Cancel this booking
          </Button>
        </>
      )}
      <MadeWithOneCamp surface="booked" label="Scheduling by OneCamp" className="mt-6" />
    </Centered>
  )
}

function Centered({ children }: { children: React.ReactNode }) {
  return <main className="flex min-h-screen w-full flex-col items-center justify-center gap-3 bg-background px-4 text-center">{children}</main>
}
