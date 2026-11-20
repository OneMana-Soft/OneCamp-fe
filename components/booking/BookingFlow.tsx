"use client"

// A public booking page (content.md K01 to K06): pick a day on the month,
// pick a time (it splits into "Next →"), say who you are, booked. Times show in
// the visitor's zone (changeable); only free slots exist here, never the
// owner's events. No account needed.

import { avatarSeed } from "@/lib/utils/getAvatarColor"
import * as React from "react"

import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { zoneLabel } from "@/lib/utils/zones"
import { IdentityMark } from "@/components/ui/graphics/IdentityMark"
import { SpamTrap } from "@/components/common/SpamTrap"
import { PaperCard, PublicFrame } from "@/components/guest/PublicFrame"
import { WorkspaceMark } from "@/components/guest/publicHeader"
import { PublicGoneLater as PublicGone } from "@/components/guest/publicGoneLater"
import { AlertCircle, ArrowLeft, CalendarDays, Clock } from "@/lib/icons"
import type { Slot } from "@/lib/calendar/availability"
import { browserTZ } from "@/lib/utils/timeZone"
import { cn } from "@/lib/utils/helpers/cn"
import { bookSlot, type Booked, type PublicBookingPage } from "@/services/bookingService"
import { retryingText } from "@/services/publicApi"
import { readsTwelveHour } from "@/lib/utils/date/clock"
import { bookLabel, shortDay, slotTime } from "@/components/booking/bookingTime"
import { DayAndTimes, TimeZoneButton, useSlotPicker } from "@/components/booking/slotPicker"
import { Confirmation } from "@/components/booking/bookingConfirmation"

/**
 * The card's width at each step: pick a day, pick a time, the form, booked.
 * Picking a time needs 1,000 px side by side; below 1,048 px of window (a
 * tablet, a small laptop) the times go under the month instead and the card
 * keeps the month's width. They went off the card's right edge, so an iPad
 * could pick a day and never see a time.
 */
export const STEP_WIDTH: Record<1 | 2 | 3 | 4, string> = {
  1: "sm:max-w-[740px]",
  2: "sm:max-w-[740px] min-[1048px]:max-w-[1000px]",
  3: "sm:max-w-[700px]",
  4: "sm:max-w-[560px]",
}



/** Whether the window is at least `px` wide, following it as it changes. */
function useMinWidth(px: number): boolean {
  const query = `(min-width: ${px}px)`
  const [on, setOn] = React.useState(() => typeof window !== "undefined" && !!window.matchMedia?.(query)?.matches)
  React.useEffect(() => {
    const mq = window.matchMedia?.(query)
    if (!mq) return
    const change = () => setOn(mq.matches)
    change()
    mq.addEventListener?.("change", change)
    return () => mq.removeEventListener?.("change", change)
  }, [query])
  return on
}

/** Under a foot bar, the room the pill (8px, 36px, 8px) and a two-line toast need. */
const FOOT_ROOM = 120

/**
 * A phone's foot bar on a page with no tab bar (V-1111): the bar is the
 * screen's foot, so the toasts and the offline pill stand on it (app/phone.css
 * C9), not on the tab bar's floor, which only /app's tab bar moves. While the
 * bar is drawn on a phone at the screen's foot (FOOT_ROOM: too little room
 * under it for the pill or a toast), its top is published as
 * --mobile-drawer-h and the floor points at it, as a doc's comment pages do
 * (V-1105); both go with the bar. Higher up, in the page's flow, the pill
 * keeps its place under the bar. A sticky bar moves as the page scrolls, so a
 * scroll re-reads it.
 * GuestBoardLink keeps the same publisher for its name form: each page's own
 * file, so no shared module reaches a route.
 */
function usePhoneFoot(ref: React.RefObject<HTMLElement | null>, on = true) {
  React.useLayoutEffect(() => {
    const bar = ref.current
    if (!bar || !on || !window.matchMedia?.("(max-width: 639px)").matches) return
    const root = document.documentElement
    let last = ""
    const publish = () => {
      const r = bar.getBoundingClientRect()
      const h = r.top > 0 && r.top < window.innerHeight && window.innerHeight - r.bottom < FOOT_ROOM ? `${Math.round(window.innerHeight - r.top)}px` : ""
      if (h === last) return
      last = h
      if (h) {
        root.style.setProperty("--mobile-drawer-h", h)
        root.style.setProperty("--phone-floor", "var(--mobile-drawer-h, env(safe-area-inset-bottom))")
      } else {
        root.style.removeProperty("--mobile-drawer-h")
        root.style.removeProperty("--phone-floor")
      }
    }
    publish()
    const watch = typeof ResizeObserver !== "undefined" ? new ResizeObserver(publish) : null
    watch?.observe(bar)
    window.addEventListener("resize", publish)
    window.addEventListener("scroll", publish, { capture: true, passive: true })
    return () => {
      watch?.disconnect()
      window.removeEventListener("resize", publish)
      window.removeEventListener("scroll", publish, { capture: true })
      root.style.removeProperty("--mobile-drawer-h")
      root.style.removeProperty("--phone-floor")
    }
  }, [ref, on])
}


// ----------------------------------------------------------------------------
// The flow.
// ----------------------------------------------------------------------------

export function BookingFlow({ slug }: { slug: string }) {
  const [tz, setTz] = React.useState("UTC")
  const [h24, setH24] = React.useState(false)
  const picker = useSlotPicker(slug, tz)
  const { page, state, trouble } = picker
  const [slot, setSlot] = React.useState<Slot | null>(null)
  const [booked, setBooked] = React.useState<Booked | null>(null)
  // One time zone picker, where the layout puts it: the aside on a computer,
  // under the month on a phone. Both used to mount, one hidden (CAL-BUG-20).
  const wide = useMinWidth(640)

  React.useEffect(() => {
    const z = browserTZ()
    setTz(z)
    // 24-hour time where the visitor's locale reads it that way.
    setH24(!readsTwelveHour())
  }, [])

  React.useEffect(() => {
    if (page) document.title = `${page.title} with ${page.owner_name}`
  }, [page])

  if (state === "missing") {
    return <PublicGone surface="booking" noun="booking page" detail="The link may be wrong, or its owner has turned it off." />
  }
  if (state === "error") {
    return <PublicGone surface="booking" noun="booking page" kind="failed" onRetry={() => window.location.reload()} />
  }
  if (state === "loading" || !page) return <BookingSkeleton label={trouble ? retryingText[trouble] : undefined} />

  const step: 1 | 2 | 3 | 4 = booked ? 4 : slot ? 3 : picker.day ? 2 : 1

  return (
    <PublicFrame
      surface="booking"
      header={false}
      // The credit sits under the card (content.md K01), not at the foot of
      // the window 300 px below it: the main area doesn't grow.
      mainClassName="flex-none sm:px-6 sm:pt-[72px]"
      footer={<span className="w-full text-center">Times in {zoneLabel(tz)}</span>}
    >
      <PaperCard
        data-booking-card=""
        data-step={step}
        className={cn(
          "overflow-hidden transition-[max-width] duration-[var(--content-width-step-duration)] ease-[var(--content-width-step-ease)] motion-reduce:transition-none",
          STEP_WIDTH[step],
        )}
      >
        {booked ? (
          <Confirmation booked={booked} tz={tz} h24={h24} />
        ) : (
          <div className="flex max-sm:flex-col">
            <HostAside page={page} tz={tz} onTz={setTz} h24={h24} onH24={setH24} slot={slot} zonePicker={wide} />
            {slot ? (
              <GuestForm
                key={slot.start}
                slug={slug}
                page={page}
                slot={slot}
                tz={tz}
                h24={h24}
                onBack={() => setSlot(null)}
                onBooked={setBooked}
                onTaken={(s) => {
                  setSlot(null)
                  picker.markTaken(s.start)
                }}
              />
            ) : (
              // On a phone the zone sits under the calendar.
              <DayAndTimes picker={picker} tz={tz} onTz={setTz} h24={h24} onH24={setH24} phoneZone={!wide} onNext={setSlot} />
            )}
          </div>
        )}
      </PaperCard>
    </PublicFrame>
  )
}

// ----------------------------------------------------------------------------
// K02. Who and what.
// ----------------------------------------------------------------------------

/** About how many lines a page's description takes beside the month: its breaks, and about 34 characters a line. Pure. */
function descriptionLines(text: string): number {
  return text.split("\n").length + text.length / 34
}

function HostAside({
  page,
  tz,
  onTz,
  h24,
  onH24,
  slot,
  zonePicker,
}: {
  page: PublicBookingPage
  tz: string
  onTz: (tz: string) => void
  h24: boolean
  onH24: (v: boolean) => void
  slot: Slot | null
  /** Whether the time zone picker is here (a computer) rather than under the month. */
  zonePicker: boolean
}) {
  const [more, setMore] = React.useState(false)
  return (
    <aside className="flex shrink-0 flex-col gap-3 border-line px-5 pb-4 pt-6 sm:w-[260px] sm:border-r sm:px-6 sm:pb-7 sm:pt-7" data-host-aside="">
      <div className="flex items-center gap-3 sm:flex-col sm:items-start sm:gap-2">
        <span className="relative inline-flex shrink-0">
          <IdentityMark variant="avatar" size={40} id={avatarSeed(page.owner_name)} label={page.owner_name} className="max-sm:size-8!" />
          <WorkspaceMark size={16} className="absolute -bottom-1 -right-2 ring-2 ring-sheet" />
        </span>
        <div className="min-w-0">
          <p className="text-ui font-medium text-ink-2">{page.owner_name}</p>
          <h1 className="text-title-2 text-ink [text-wrap:balance] sm:mt-1">{page.title}</h1>
        </div>
      </div>
      <div className="flex flex-col gap-1.5 text-ui-sm text-ink-2 max-sm:flex-row max-sm:gap-3">
        <span className="inline-flex items-center gap-2 tabular-nums">
          <Clock className="size-4 text-ink-3" aria-hidden="true" /> {page.duration_minutes} min
        </span>
        {slot ? (
          <span className="content-rise inline-flex items-center gap-2 font-medium text-ink tabular-nums" data-chosen-time="">
            <CalendarDays className="size-4 text-ink-3" aria-hidden="true" />
            {shortDay(slot.start, tz)} · {slotTime(slot.start, tz, h24)} – {slotTime(slot.end, tz, h24)}
          </span>
        ) : null}
      </div>
      {page.description ? (
        // On a phone too (PTC-10): three lines there, six beside the month, then More.
        <div>
          <p className={cn("whitespace-pre-line text-ui text-ink-2 [text-wrap:pretty]", !more && "line-clamp-3 sm:line-clamp-6")}>{page.description}</p>
          {!more && descriptionLines(page.description) > 3 ? (
            <button
              type="button"
              onClick={() => setMore(true)}
              data-touch-target=""
              className={cn("mt-1 text-ui-sm font-medium text-brand-text hover:underline", descriptionLines(page.description) <= 6 && "sm:hidden")}
            >
              More
            </button>
          ) : null}
        </div>
      ) : null}
      {zonePicker ? <TimeZoneButton tz={tz} onTz={onTz} h24={h24} onH24={onH24} className="-ml-2 max-w-[calc(100%+8px)] self-start max-sm:hidden" /> : null}
    </aside>
  )
}



// ----------------------------------------------------------------------------
// K05. Who is booking.
// ----------------------------------------------------------------------------

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function GuestForm({
  slug,
  page,
  slot,
  tz,
  h24,
  onBack,
  onBooked,
  onTaken,
}: {
  slug: string
  page: PublicBookingPage
  slot: Slot
  tz: string
  h24: boolean
  onBack: () => void
  onBooked: (b: Booked) => void
  onTaken: (s: Slot) => void
}) {
  // The Book bar is a phone's foot (max-sm:sticky below): the toasts and the pill stand above it.
  const foot = React.useRef<HTMLDivElement>(null)
  usePhoneFoot(foot, !useMinWidth(640))
  const [name, setName] = React.useState("")
  const [email, setEmail] = React.useState("")
  const [note, setNote] = React.useState("")
  const [website, setWebsite] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  const [errors, setErrors] = React.useState<{ name?: string; email?: string }>({})
  const [failed, setFailed] = React.useState("")
  const first = (page.owner_name || "").split(/\s+/)[0] || "they"

  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault()
    const errs: typeof errors = {}
    if (!name.trim()) errs.name = "Add your name."
    if (!EMAIL.test(email.trim())) errs.email = email.trim() ? "That email doesn't look right." : "Add your email."
    setErrors(errs)
    if (errs.name || errs.email) return
    setBusy(true)
    setFailed("")
    const res = await bookSlot(slug, { start: slot.start, name: name.trim(), email: email.trim(), note, tz, website })
    setBusy(false)
    if (res.ok) return onBooked(res.data)
    if (res.status === 409 || /taken/i.test(res.msg)) return onTaken(slot)
    // A refusal in the server's words: a bad field, or too many bookings from
    // here; and a retry in them too: a calendar it couldn't check (503).
    if ((res.status === 400 || res.status === 429 || res.status === 503) && res.msg) {
      setFailed(res.status === 503 ? `${res.msg} Your details are kept.` : res.msg)
      return
    }
    setFailed("Couldn't book. Your details are kept.")
  }

  const field = "h-9 w-full rounded-lg bg-raised px-3 text-ui text-ink shadow-e1 outline-none placeholder:text-ink-3 focus-visible:focus-halo aria-[invalid=true]:ring-1 aria-[invalid=true]:ring-destructive max-sm:h-11 max-sm:text-base"
  return (
    <form onSubmit={submit} noValidate className="content-slide-in flex min-w-0 flex-col gap-4 px-5 pb-0 pt-2 sm:w-[440px] sm:shrink-0 sm:px-7 sm:pb-7 sm:pt-6" data-guest-form="">
      <Button type="button" variant="ghost" size="sm" className="-ml-2 h-7 gap-1 self-start px-2" onClick={onBack}>
        <ArrowLeft className="size-3.5" aria-hidden="true" /> Back
      </Button>
      <h2 className="text-title-3 text-ink">Your details</h2>
      <div className="grid gap-1.5" style={{ animationDelay: "0ms" }}>
        <label htmlFor="g-name" className="text-ui-sm font-medium text-ink-2">Name</label>
        <input id="g-name" className={field} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" maxLength={100} aria-invalid={!!errors.name} aria-describedby={errors.name ? "g-name-err" : undefined} />
        {errors.name ? <p id="g-name-err" role="alert" className="text-meta text-danger-ink">{errors.name}</p> : null}
      </div>
      <div className="grid gap-1.5">
        <label htmlFor="g-email" className="text-ui-sm font-medium text-ink-2">Email</label>
        <input id="g-email" type="email" className={field} value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" maxLength={254} aria-invalid={!!errors.email} aria-describedby={errors.email ? "g-email-err" : "g-email-hint"} />
        {errors.email ? (
          <p id="g-email-err" role="alert" className="text-meta text-danger-ink">{errors.email}</p>
        ) : (
          <p id="g-email-hint" className="text-meta text-ink-3">For the invite, and a link to cancel.</p>
        )}
      </div>
      <div className="grid gap-1.5">
        <label htmlFor="g-note" className="text-ui-sm font-medium text-ink-2">
          Anything {first} should know? <span className="font-normal text-ink-3">(optional)</span>
        </label>
        <textarea id="g-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} className={cn(field, "h-[88px] resize-none py-2 max-sm:h-[88px]")} />
      </div>
      <SpamTrap id="g-website" value={website} onChange={setWebsite} />
      {failed ? (
        <div role="alert" className="flex items-center gap-2 rounded-lg bg-sunken px-3 py-2.5 text-ui-sm text-ink">
          <AlertCircle className="size-3.5 shrink-0 text-danger-ink" aria-hidden="true" />
          <span className="min-w-0 flex-1">{failed}</span>
          <Button type="button" variant="ghost" size="sm" className="h-7 px-2" onClick={() => void submit()}>
            Try again
          </Button>
        </div>
      ) : null}
      <div ref={foot} className="flex flex-col gap-2 max-sm:sticky max-sm:bottom-0 max-sm:z-10 max-sm:-mx-5 max-sm:bg-sheet max-sm:px-5 max-sm:pb-[max(12px,env(safe-area-inset-bottom))] max-sm:pt-3 max-sm:shadow-e2">
        <Button type="submit" busy={busy} className="h-10 w-full max-sm:h-12" data-book-button="">
          {bookLabel(slot, tz, h24)}
        </Button>
        <p className="text-center text-meta text-ink-3">By booking you agree to receive emails about this meeting.</p>
      </div>
    </form>
  )
}

// ----------------------------------------------------------------------------
// K06. Booked.
// ----------------------------------------------------------------------------

// ----------------------------------------------------------------------------
// While it loads.
// ----------------------------------------------------------------------------

function BookingSkeleton({ label }: { label?: string }) {
  return (
    <PublicFrame surface="booking" header={false} mainClassName="flex-none sm:px-6 sm:pt-[72px]">
      {/* Why it is still loading, when the server is busy or out of reach. */}
      {label ? (
        <p role="status" className={cn("mb-3 w-full px-5 text-center text-ui-sm text-ink-2 sm:px-0", STEP_WIDTH[1])} data-booking-retrying="">
          {label}
        </p>
      ) : null}
      <PaperCard className={cn("overflow-hidden", STEP_WIDTH[1])} role="status" aria-label="Loading booking page">
        <div aria-hidden="true" className="flex max-sm:flex-col">
          <div className="flex flex-col gap-3 border-line p-6 sm:w-[260px] sm:border-r sm:p-7">
            <Skeleton variant="circle" className="size-10" />
            <Skeleton className="h-3.5 w-24" />
            <Skeleton className="h-6 w-44" />
            <Skeleton className="h-3.5 w-20" />
          </div>
          <div className="flex-1 p-6 sm:p-7">
            <Skeleton className="h-4 w-32" />
            <div className="mt-6 grid grid-cols-7 gap-1">
              {Array.from({ length: 35 }).map((_, i) => (
                <div key={i} className="aspect-square min-h-10 animate-pulse rounded-[10px] bg-press" />
              ))}
            </div>
          </div>
        </div>
      </PaperCard>
    </PublicFrame>
  )
}
