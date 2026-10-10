"use client"

// A guest's own booking, from the link they were given: see it, cancel it.

import { use, useEffect, useState } from "react"
import { AlertCircle, CalendarCheck, CalendarX, Loader2 } from "@/lib/icons"
import { Button } from "@/components/ui/button"
import { formatRange } from "@/lib/calendar/availability"
import { browserTZ } from "@/lib/utils/timeZone"
import { cancelBooking, getBooking, type BookingView } from "@/services/bookingService"
import { MadeWithOneCamp } from "@/components/public/MadeWithOneCamp"
import { Tile } from "@/components/ui/graphics/Tile"
import { Skeleton } from "@/components/ui/skeleton"

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

  // The page's own shape while it loads, not a spinner in the accent.
  if (state === "loading") {
    return (
      <Centered>
        <div role="status" aria-label="Loading your booking" className="flex flex-col items-center gap-3">
          <Skeleton className="h-10 w-10 rounded-lg" />
          <Skeleton className="h-7 w-64" />
          <Skeleton className="h-4 w-80 max-w-full" />
        </div>
      </Centered>
    )
  }
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
      {/* On a hue tile, as the app's icons sit: the accent is for the one
          action, and here that is Cancel. */}
      {booking.cancelled ? (
        <Tile hue="sky" size="lg" className="opacity-70"><CalendarX aria-hidden="true" /></Tile>
      ) : (
        <Tile hue="moss" size="lg"><CalendarCheck aria-hidden="true" /></Tile>
      )}
      <h1 className="text-2xl font-semibold tracking-tight">{booking.cancelled ? "Cancelled" : booking.title}</h1>
      {/* Who it is with, on a line of its own: the title often names them
          already, and "Intro call with Sam with Sam Rivera" read twice. */}
      <p className="text-sm text-muted-foreground">With {booking.owner_name}</p>
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
  return <main className="flex min-h-dvh w-full flex-col items-center justify-center gap-3 bg-background px-4 text-center">{children}</main>
}
