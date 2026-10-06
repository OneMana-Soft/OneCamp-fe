"use client"

// A public booking page: pick a day, pick a time, say who you are, booked.
// Times show in the visitor's zone (changeable); only free slots exist here,
// never the owner's events. No account needed.

import { use, useCallback, useEffect, useMemo, useState } from "react"
import { AlertCircle, ArrowLeft, CalendarCheck, Clock, Globe, Loader2 } from "@/lib/icons"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { cn } from "@/lib/utils/helpers/cn"
import { bookSlot, getBookingPage, type Booked, type PublicBookingPage } from "@/services/bookingService"
import {
  browserTZ,
  formatDay,
  formatRange,
  formatTime,
  googleCalendarUrl,
  groupByDay,
  icsFor,
  timeZones,
  type Slot,
} from "@/lib/calendar/availability"
import { MadeWithOneCamp } from "@/components/public/MadeWithOneCamp"
import { SpamTrap } from "@/components/common/SpamTrap"

const WINDOW_DAYS = 14

export default function BookingPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params)
  const [page, setPage] = useState<PublicBookingPage | null>(null)
  const [slots, setSlots] = useState<Slot[]>([])
  const [loadedUntil, setLoadedUntil] = useState<Date | null>(null)
  const [state, setState] = useState<"loading" | "ready" | "missing" | "error">("loading")
  const [loadingMore, setLoadingMore] = useState(false)
  const [tz, setTz] = useState("UTC")
  const [day, setDay] = useState<string | null>(null)
  const [slot, setSlot] = useState<Slot | null>(null)
  const [booked, setBooked] = useState<Booked | null>(null)

  useEffect(() => setTz(browserTZ()), [])

  const load = useCallback(
    async (from: Date) => {
      const to = new Date(from.getTime() + WINDOW_DAYS * 864e5)
      const res = await getBookingPage(slug, from, to)
      if (!res.ok) {
        setState(res.status === 404 ? "missing" : "error")
        return
      }
      setPage(res.data)
      setSlots((prev) => [...prev.filter((s) => new Date(s.start) < from), ...res.data.slots])
      setLoadedUntil(to)
      setState("ready")
    },
    [slug],
  )
  useEffect(() => {
    void load(new Date())
  }, [load])
  useEffect(() => {
    if (page) document.title = `${page.title} with ${page.owner_name}`
  }, [page])

  const days = useMemo(() => groupByDay(slots, tz), [slots, tz])
  const shownDay = days.find((d) => d.day === day) ?? days[0]
  const canLoadMore = !!page && !!loadedUntil && loadedUntil < new Date(page.bookable_until)

  if (state === "loading") return <Centered><Loader2 className="h-7 w-7 animate-spin text-primary" /></Centered>
  if (state === "missing" || state === "error" || !page) {
    return (
      <Centered>
        <AlertCircle className="h-8 w-8 text-muted-foreground" />
        <p className="text-base font-semibold">{state === "missing" ? "This booking page isn't available" : "This page didn't load"}</p>
        <p className="max-w-sm text-sm text-muted-foreground">
          {state === "missing" ? "The link may be wrong, or its owner has turned it off." : "Check your connection and reload the page."}
        </p>
      </Centered>
    )
  }
  if (booked) return <Confirmation booked={booked} tz={tz} />

  return (
    <main className="min-h-screen bg-muted/30 px-4 py-8 sm:py-14">
      <div className="mx-auto grid max-w-4xl overflow-hidden rounded-2xl border bg-background shadow-sm grid-cols-[minmax(0,1fr)] md:grid-cols-[17rem_minmax(0,1fr)]">
        <aside className="grid min-w-0 content-start gap-3 border-b p-6 md:border-b-0 md:border-r">
          <p className="text-sm text-muted-foreground">{page.owner_name}</p>
          <h1 className="text-2xl font-semibold tracking-tight text-balance">{page.title}</h1>
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Clock className="h-4 w-4" /> {page.duration_minutes} minutes
          </p>
          {page.description && <p className="whitespace-pre-line text-sm">{page.description}</p>}
          <div className="mt-2 grid gap-1.5">
            <Label htmlFor="tz" className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Globe className="h-3.5 w-3.5" /> Times shown in
            </Label>
            <Select value={tz} onValueChange={setTz}>
              <SelectTrigger id="tz" className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                {timeZones(tz).map((z) => (
                  <SelectItem key={z} value={z} className="text-xs">
                    {z.replace(/_/g, " ")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </aside>

        <section className="min-w-0 p-6">
          {slot ? (
            <GuestForm slug={slug} page={page} slot={slot} tz={tz} onBack={() => setSlot(null)} onBooked={setBooked} onTaken={() => {
              setSlot(null)
              setSlots([])
              void load(new Date())
            }} />
          ) : days.length === 0 ? (
            <div className="grid gap-3">
              <p className="text-sm text-muted-foreground">No free times in the next {WINDOW_DAYS} days.</p>
              {canLoadMore && (
                <Button variant="outline" className="justify-self-start" disabled={loadingMore} onClick={async () => {
                  setLoadingMore(true)
                  await load(loadedUntil!)
                  setLoadingMore(false)
                }}>
                  Look further ahead
                </Button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-[minmax(0,1fr)] gap-5">
              <div>
                <h2 className="mb-2 text-sm font-medium">Pick a day</h2>
                <div className="flex gap-2 overflow-x-auto pb-1" role="listbox" aria-label="Days with free times">
                  {days.map((d) => (
                    <button
                      key={d.day}
                      type="button"
                      role="option"
                      aria-selected={shownDay?.day === d.day}
                      onClick={() => setDay(d.day)}
                      className={cn(
                        "shrink-0 rounded-lg border px-3 py-2 text-left text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        shownDay?.day === d.day ? "border-primary bg-primary/10" : "hover:bg-accent",
                      )}
                    >
                      <span className="block font-medium">{formatDay(d.day)}</span>
                      <span className="block text-xs text-muted-foreground">{d.slots.length} {d.slots.length === 1 ? "time" : "times"}</span>
                    </button>
                  ))}
                  {canLoadMore && (
                    <button type="button" disabled={loadingMore} onClick={async () => {
                      setLoadingMore(true)
                      await load(loadedUntil!)
                      setLoadingMore(false)
                    }} className="shrink-0 rounded-lg border border-dashed px-3 py-2 text-sm text-muted-foreground hover:bg-accent">
                      {loadingMore ? "Loading…" : "Later dates"}
                    </button>
                  )}
                </div>
              </div>
              {shownDay && (
                <div>
                  <h2 className="mb-2 text-sm font-medium">Pick a time</h2>
                  <div className="grid grid-cols-[repeat(auto-fill,minmax(6.5rem,1fr))] gap-2">
                    {shownDay.slots.map((s) => (
                      <Button key={s.start} variant="outline" className="tabular-nums hover:border-primary" onClick={() => setSlot(s)}>
                        {formatTime(s.start, tz)}
                      </Button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </section>
      </div>
      <MadeWithOneCamp surface="booking" label="Scheduling by OneCamp" className="mt-6" />
    </main>
  )
}

function GuestForm({
  slug,
  page,
  slot,
  tz,
  onBack,
  onBooked,
  onTaken,
}: {
  slug: string
  page: PublicBookingPage
  slot: Slot
  tz: string
  onBack: () => void
  onBooked: (b: Booked) => void
  onTaken: () => void
}) {
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [note, setNote] = useState("")
  const [website, setWebsite] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError("")
    const res = await bookSlot(slug, { start: slot.start, name, email, note, tz, website })
    setBusy(false)
    if (res.ok) return onBooked(res.data)
    if (/taken/i.test(res.msg)) {
      setError(res.msg)
      setTimeout(onTaken, 1500)
      return
    }
    setError(res.msg)
  }

  return (
    <form onSubmit={submit} className="grid max-w-md gap-4">
      <Button type="button" variant="ghost" size="sm" className="-ml-2 justify-self-start gap-1.5" onClick={onBack}>
        <ArrowLeft className="h-4 w-4" /> Another time
      </Button>
      <p className="rounded-md bg-muted/60 p-3 text-sm">
        <span className="block font-medium">{formatRange(slot.start, slot.end, tz)}</span>
        <span className="text-muted-foreground">{page.title} with {page.owner_name}</span>
      </p>
      <div className="grid gap-1.5">
        <Label htmlFor="g-name">Your name</Label>
        <Input id="g-name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" maxLength={100} required />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="g-email">Email</Label>
        <Input id="g-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" maxLength={254} required />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="g-note">Anything to share beforehand? (optional)</Label>
        <Textarea id="g-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} rows={3} className="resize-none" />
      </div>
      <SpamTrap id="g-website" value={website} onChange={setWebsite} />
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <Button type="submit" disabled={busy} className="justify-self-start">
        {busy && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
        Book
      </Button>
    </form>
  )
}

function Confirmation({ booked, tz }: { booked: Booked; tz: string }) {
  const cancelUrl = typeof window === "undefined" ? "" : `${window.location.origin}/booking/${booked.cancel_token}`
  const title = `${booked.title} with ${booked.owner_name}`
  const ics = useMemo(() => {
    const file = icsFor({ uid: booked.cancel_token, title, start: booked.start, end: booked.end, description: `To cancel: ${cancelUrl}`, url: cancelUrl })
    return URL.createObjectURL(new Blob([file], { type: "text/calendar" }))
  }, [booked, title, cancelUrl])
  useEffect(() => () => URL.revokeObjectURL(ics), [ics])

  return (
    <Centered>
      <CalendarCheck className="h-10 w-10 text-primary" />
      <h1 className="text-2xl font-semibold tracking-tight">You&apos;re booked</h1>
      <p className="text-sm">
        <span className="block font-medium">{formatRange(booked.start, booked.end, tz)}</span>
        <span className="text-muted-foreground">{title}</span>
      </p>
      <div className="flex flex-wrap justify-center gap-2">
        <Button asChild variant="outline">
          <a href={ics} download="booking.ics">Add to calendar</a>
        </Button>
        <Button asChild variant="outline">
          <a href={googleCalendarUrl({ title, start: booked.start, end: booked.end, details: `To cancel: ${cancelUrl}` })} target="_blank" rel="noreferrer">
            Google Calendar
          </a>
        </Button>
      </div>
      <p className="max-w-sm text-xs text-muted-foreground">
        {booked.emailed ? "We've emailed you the details. " : "Keep this link if you might need to cancel: "}
        {!booked.emailed && (
          <a className="break-all underline" href={cancelUrl}>
            {cancelUrl}
          </a>
        )}
      </p>
    </Centered>
  )
}

function Centered({ children }: { children: React.ReactNode }) {
  return <main className="flex min-h-screen w-full flex-col items-center justify-center gap-3 bg-background px-4 text-center">{children}</main>
}
