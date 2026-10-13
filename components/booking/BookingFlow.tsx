"use client"

// A public booking page (content.md K01 to K06): pick a day on the month,
// pick a time (it splits into "Next →"), say who you are, booked. Times show in
// the visitor's zone (changeable); only free slots exist here, never the
// owner's events. No account needed.

import * as React from "react"

import { Button } from "@/components/ui/button"
import { CommandList, type CommandListItem } from "@/components/ui/CommandList"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { IdentityMark } from "@/components/ui/graphics/IdentityMark"
import { SpamTrap } from "@/components/common/SpamTrap"
import { PaperCard, PublicFrame, WorkspaceMark } from "@/components/guest/PublicFrame"
import { PublicGone } from "@/components/guest/publicStates"
import { AlertCircle, ArrowLeft, ArrowRight, CalendarDays, Check, ChevronDown, ChevronLeft, ChevronRight, Clock, Globe, Loader2, Mail } from "@/lib/icons"
import { celebrate, prefersReducedMotion } from "@/lib/celebrate"
import { dayKey, googleCalendarUrl, icsFor, timeZones, type Slot } from "@/lib/calendar/availability"
import { browserTZ } from "@/lib/utils/timeZone"
import { cn } from "@/lib/utils/helpers/cn"
import { bookSlot, getBookingPage, type Booked, type PublicBookingPage } from "@/services/bookingService"
import { publicTrouble, retryDelayMs, retryingText, type PublicTrouble } from "@/services/publicApi"

/** The card's width at each step: pick a day, pick a time, the form, booked. */
export const STEP_WIDTH: Record<1 | 2 | 3 | 4, string> = {
  1: "sm:max-w-[740px]",
  2: "sm:max-w-[1000px]",
  3: "sm:max-w-[700px]",
  4: "sm:max-w-[560px]",
}

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
const DAY_MS = 864e5

// ----------------------------------------------------------------------------
// Words for a moment, in the visitor's zone.
// ----------------------------------------------------------------------------

/** "10:30" (24 h) or "10:30 AM", in a zone. */
export function slotTime(iso: string, tz: string, h24: boolean): string {
  return formatFor(h24 ? "en-GB" : "en-US", tz, { hour: "numeric", minute: "2-digit", hour12: !h24 }).format(new Date(iso))
}

/**
 * One formatter per locale, zone and options, kept for the page's life:
 * building one is the costly part, and the page made one for every slot,
 * label and render (CAL-BUG-20). A zone the browser doesn't know throws, as
 * before, and isn't kept.
 */
const formats = new Map<string, Intl.DateTimeFormat>()
function formatFor(locale: string, tz: string, opts: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = `${locale}|${tz}|${JSON.stringify(opts)}`
  let f = formats.get(key)
  if (!f) {
    f = new Intl.DateTimeFormat(locale, { timeZone: tz, ...opts })
    formats.set(key, f)
  }
  return f
}

function parts(iso: string, tz: string, opts: Intl.DateTimeFormatOptions) {
  const p = formatFor("en-GB", tz, opts).formatToParts(new Date(iso))
  return (t: Intl.DateTimeFormatPartTypes) => p.find((x) => x.type === t)?.value ?? ""
}

/** "Thu 15 Oct", the day in the button. */
export function shortDay(iso: string, tz: string): string {
  const p = parts(iso, tz, { weekday: "short", day: "numeric", month: "short" })
  return `${p("weekday")} ${p("day")} ${p("month")}`
}

/** "Thursday 15 October". */
export function longDay(iso: string, tz: string): string {
  const p = parts(iso, tz, { weekday: "long", day: "numeric", month: "long" })
  return `${p("weekday")} ${p("day")} ${p("month")}`
}

/** The button's words: "Book Thu 15 Oct, 10:30". */
export function bookLabel(slot: Slot, tz: string, h24: boolean): string {
  return `Book ${shortDay(slot.start, tz)}, ${slotTime(slot.start, tz, h24)}`
}

/**
 * A zone's name as Intl says it ("long", "shortOffset"), or "" when it can't,
 * through a kept formatter (CAL-BUG-20: the page built one per call).
 */
function zoneName(tz: string, style: "long" | "shortOffset"): string {
  try {
    return formatFor("en-US", tz, { timeZoneName: style }).formatToParts(new Date()).find((p) => p.type === "timeZoneName")?.value ?? ""
  } catch {
    return ""
  }
}

/** "India Standard Time (GMT+5:30)". */
export function zoneLabel(tz: string): string {
  const name = zoneName(tz, "long")
  const off = zoneName(tz, "shortOffset")
  return name ? `${name}${off ? ` (${off})` : ""}` : tz.replace(/_/g, " ")
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

/** The month a day key falls in: { y, m } with m from 0. */
const monthOf = (key: string) => ({ y: Number(key.slice(0, 4)), m: Number(key.slice(5, 7)) - 1 })
const monthKey = (y: number, m: number) => `${y}-${String(m + 1).padStart(2, "0")}`
const shiftMonth = (y: number, m: number, by: number) => {
  const d = new Date(Date.UTC(y, m + by, 1))
  return { y: d.getUTCFullYear(), m: d.getUTCMonth() }
}
const monthName = (y: number, m: number) => formatFor("en-GB", "UTC", { month: "long" }).format(new Date(Date.UTC(y, m, 1)))

// ----------------------------------------------------------------------------
// The flow.
// ----------------------------------------------------------------------------

export function BookingFlow({ slug }: { slug: string }) {
  const [page, setPage] = React.useState<PublicBookingPage | null>(null)
  const [state, setState] = React.useState<"loading" | "ready" | "missing" | "error">("loading")
  const [slotsByStart, setSlotsByStart] = React.useState<Map<string, Slot>>(new Map())
  const [loadedMonths, setLoadedMonths] = React.useState<Set<string>>(new Set())
  const [tz, setTz] = React.useState("UTC")
  const [h24, setH24] = React.useState(false)
  const [month, setMonth] = React.useState<{ y: number; m: number } | null>(null)
  const [monthDir, setMonthDir] = React.useState<1 | -1>(1)
  const [day, setDay] = React.useState<string | null>(null)
  const [split, setSplit] = React.useState<Slot | null>(null)
  const [slot, setSlot] = React.useState<Slot | null>(null)
  const [taken, setTaken] = React.useState<string | null>(null)
  const [booked, setBooked] = React.useState<Booked | null>(null)
  // Too many requests from here (429), or no answer: the page says so and
  // asks again when the server allows, never calling the page gone (CAL-BUG-14).
  const [trouble, setTrouble] = React.useState<Exclude<PublicTrouble, "gone"> | null>(null)
  const [monthTrouble, setMonthTrouble] = React.useState<Exclude<PublicTrouble, "gone"> | null>(null)
  const [monthRetry, setMonthRetry] = React.useState(0)
  // One time zone picker, where the layout puts it: the aside on a computer,
  // under the month on a phone. Both used to mount, one hidden (CAL-BUG-20).
  const wide = useMinWidth(640)

  React.useEffect(() => {
    const z = browserTZ()
    setTz(z)
    // 24-hour time where the visitor's locale reads it that way.
    try {
      setH24(!new Intl.DateTimeFormat(undefined, { hour: "numeric" }).resolvedOptions().hour12)
    } catch {
      /* 12 h then */
    }
  }, [])

  const merge = React.useCallback((slots: Slot[]) => {
    setSlotsByStart((prev) => {
      const next = new Map(prev)
      for (const s of slots) next.set(s.start, s)
      return next
    })
  }, [])

  // The first answer: the page, and its first fortnight. Asked again, later
  // each time and never before the server's Retry-After, while the server is
  // busy or out of reach.
  React.useEffect(() => {
    let live = true
    let failures = 0
    let timer: ReturnType<typeof setTimeout> | undefined
    const attempt = async () => {
      const now = new Date()
      const res = await getBookingPage(slug, now, new Date(now.getTime() + 14 * DAY_MS))
      if (!live) return
      if (!res.ok) {
        const t = publicTrouble(res.status)
        if (t === "gone") {
          setState(res.status === 404 ? "missing" : "error")
          return
        }
        setTrouble(t)
        timer = setTimeout(() => void attempt(), retryDelayMs(failures++, res.retryAfter))
        return
      }
      setTrouble(null)
      setPage(res.data)
      merge(res.data.slots)
      setState("ready")
    }
    void attempt()
    return () => {
      live = false
      clearTimeout(timer)
    }
  }, [slug, merge])

  React.useEffect(() => {
    if (page) document.title = `${page.title} with ${page.owner_name}`
  }, [page])

  const todayKey = dayKey(new Date(), tz)
  const thisMonth = monthOf(todayKey)
  const shown = month ?? thisMonth
  const lastMonth = page ? monthOf(dayKey(page.bookable_until, tz)) : thisMonth

  // Each visible month asks for its slots once, in two halves (the server
  // answers up to 31 days a call).
  const shownKey = monthKey(shown.y, shown.m)
  React.useEffect(() => {
    if (!page || loadedMonths.has(shownKey)) return
    let live = true
    let retryTimer: ReturnType<typeof setTimeout> | undefined
    void (async () => {
      const now = Date.now()
      const start = Math.max(now, Date.UTC(shown.y, shown.m, 1) - DAY_MS)
      const end = Math.min(Date.UTC(shown.y, shown.m + 1, 1) + DAY_MS, new Date(page.bookable_until).getTime())
      if (end <= start) {
        setLoadedMonths((s) => new Set(s).add(shownKey))
        return
      }
      const mid = start + Math.ceil((end - start) / 2)
      const answers = await Promise.all([
        getBookingPage(slug, new Date(start), new Date(mid)),
        getBookingPage(slug, new Date(mid), new Date(end)),
      ])
      if (!live) return
      for (const a of answers) if (a.ok) merge(a.data.slots)
      // A month whose answer didn't come isn't "no free times": it waits and asks again.
      const failed = answers.find((a) => !a.ok && publicTrouble(a.status) !== "gone")
      if (failed && !failed.ok) {
        setMonthTrouble(publicTrouble(failed.status) as Exclude<PublicTrouble, "gone">)
        retryTimer = setTimeout(() => setMonthRetry((n) => n + 1), retryDelayMs(monthRetry, failed.retryAfter))
        return
      }
      setMonthTrouble(null)
      setLoadedMonths((s) => new Set(s).add(shownKey))
    })()
    return () => {
      live = false
      clearTimeout(retryTimer)
    }
  }, [page, shownKey, shown.y, shown.m, slug, loadedMonths, merge, monthRetry])

  const byDay = React.useMemo(() => {
    const out = new Map<string, Slot[]>()
    const now = Date.now()
    for (const s of [...slotsByStart.values()].sort((a, b) => a.start.localeCompare(b.start))) {
      if (new Date(s.start).getTime() < now) continue
      const k = dayKey(s.start, tz)
      const list = out.get(k)
      if (list) list.push(s)
      else out.set(k, [s])
    }
    return out
  }, [slotsByStart, tz])

  const refresh = React.useCallback(() => {
    setSlotsByStart(new Map())
    setLoadedMonths(new Set())
  }, [])

  const goMonth = (by: 1 | -1) => {
    setMonthDir(by)
    setMonth(shiftMonth(shown.y, shown.m, by))
  }

  if (state === "missing") {
    return <PublicGone surface="booking" title="This booking page isn't available" detail="The link may be wrong, or its owner has turned it off." />
  }
  if (state === "error") {
    return <PublicGone surface="booking" title="This page didn't load" detail="Check your connection and reload the page." />
  }
  if (state === "loading" || !page) return <BookingSkeleton label={trouble ? retryingText[trouble] : undefined} />

  const step: 1 | 2 | 3 | 4 = booked ? 4 : slot ? 3 : day ? 2 : 1
  const daySlots = day ? byDay.get(day) ?? [] : []

  return (
    <PublicFrame
      surface="booking"
      header={false}
      mainClassName="sm:px-6 sm:pt-[72px]"
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
                  setTaken(s.start)
                  setSlot(null)
                  setSplit(null)
                  setTimeout(refresh, 1500)
                }}
              />
            ) : (
              <>
                <MonthGrid
                  y={shown.y}
                  m={shown.m}
                  dir={monthDir}
                  todayKey={todayKey}
                  byDay={byDay}
                  loading={!loadedMonths.has(shownKey)}
                  selected={day}
                  canPrev={shown.y * 12 + shown.m > thisMonth.y * 12 + thisMonth.m}
                  canNext={shown.y * 12 + shown.m < lastMonth.y * 12 + lastMonth.m}
                  onMonth={goMonth}
                  onPick={(k) => {
                    setDay(k)
                    setSplit(null)
                    setTaken(null)
                  }}
                  note={monthTrouble ? retryingText[monthTrouble] : undefined}
                />
                {/* On a phone the zone sits under the calendar. */}
                {!wide ? (
                  <div className="px-3 pb-2 sm:hidden">
                    <TimeZoneButton tz={tz} onTz={setTz} h24={h24} onH24={setH24} className="max-w-full" />
                  </div>
                ) : null}
                {day ? (
                  <SlotColumn
                    key={day}
                    dayKey={day}
                    slots={daySlots}
                    tz={tz}
                    h24={h24}
                    onH24={setH24}
                    split={split}
                    taken={taken}
                    onSplit={setSplit}
                    onNext={(s) => setSlot(s)}
                  />
                ) : null}
              </>
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
          <IdentityMark variant="avatar" size={40} id={page.owner_name} label={page.owner_name} className="max-sm:size-8!" />
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
        <div className="max-sm:hidden">
          <p className={cn("whitespace-pre-line text-ui text-ink-2 [text-wrap:pretty]", !more && "line-clamp-6")}>{page.description}</p>
          {!more && page.description.split("\n").length + page.description.length / 34 > 6 ? (
            <button type="button" onClick={() => setMore(true)} className="mt-1 text-ui-sm font-medium text-brand-text hover:underline">
              More
            </button>
          ) : null}
        </div>
      ) : null}
      {zonePicker ? <TimeZoneButton tz={tz} onTz={onTz} h24={h24} onH24={onH24} className="-ml-2 max-w-[calc(100%+8px)] self-start max-sm:hidden" /> : null}
    </aside>
  )
}

/** A ghost button with the zone; a searchable list with the visitor's zone first and a 24-hour switch. */
function TimeZoneButton({ tz, onTz, h24, onH24, className }: { tz: string; onTz: (tz: string) => void; h24: boolean; onH24: (v: boolean) => void; className?: string }) {
  const [open, setOpen] = React.useState(false)
  const [query, setQuery] = React.useState("")
  // Built when the list first opens, never on load (CAL-BUG-20).
  const zones = React.useMemo(() => (open ? timeZones(browserTZ()) : []), [open])
  const items: CommandListItem[] = React.useMemo(() => {
    const q = query.trim().toLowerCase()
    return zones
      .filter((z) => !q || z.toLowerCase().replace(/_/g, " ").includes(q))
      .slice(0, 80)
      .map((z, i) => ({
        id: z,
        label: z.replace(/_/g, " "),
        group: i === 0 && !q ? "Your time zone" : q ? undefined : "All time zones",
        trailing: z === tz ? <Check className="size-3.5 text-ink-2" aria-hidden="true" /> : undefined,
      }))
  }, [zones, query, tz])
  const listRef = React.useRef<{ onKeyDown: (e: React.KeyboardEvent) => boolean } | null>(null)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className={cn("h-7 gap-1.5 px-2 text-ui-sm font-medium text-ink-2", className)} aria-label={`Time zone: ${zoneLabel(tz)}`}>
          <Globe className="size-3.5" aria-hidden="true" />
          <span className="truncate">{zoneLabel(tz)}</span>
          <ChevronDown className="size-3.5 shrink-0" aria-hidden="true" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 p-0" data-tz-list="">
        <div className="border-b border-line p-1.5">
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (listRef.current?.onKeyDown(e)) e.preventDefault()
            }}
            placeholder="Search time zones"
            aria-label="Search time zones"
            className="h-8 w-full rounded-md bg-transparent px-2 text-ui text-ink outline-none placeholder:text-ink-3"
          />
        </div>
        <CommandList
          ref={listRef as never}
          items={items}
          label="Time zones"
          query={query}
          maxHeight={280}
          className="rounded-none border-0 shadow-none"
          empty={<p className="px-3 py-2 text-ui-sm text-ink-3">No time zone matches.</p>}
          onSelect={(it) => {
            onTz(it.id)
            setOpen(false)
            setQuery("")
          }}
        />
        <label className="flex items-center justify-between border-t border-line px-3 py-2 text-ui-sm text-ink-2">
          Use 24-hour time
          <Switch checked={h24} onCheckedChange={onH24} aria-label="Use 24-hour time" />
        </label>
      </PopoverContent>
    </Popover>
  )
}

// ----------------------------------------------------------------------------
// K03. The month.
// ----------------------------------------------------------------------------

function MonthGrid({
  y,
  m,
  dir,
  todayKey,
  byDay,
  loading,
  selected,
  canPrev,
  canNext,
  onMonth,
  onPick,
  note,
}: {
  y: number
  m: number
  dir: 1 | -1
  todayKey: string
  byDay: Map<string, Slot[]>
  loading: boolean
  selected: string | null
  canPrev: boolean
  canNext: boolean
  onMonth: (by: 1 | -1) => void
  onPick: (key: string) => void
  /** Why the month's times are still coming (busy, out of reach). */
  note?: string
}) {
  const lead = (new Date(Date.UTC(y, m, 1)).getUTCDay() + 6) % 7
  const count = new Date(Date.UTC(y, m + 1, 0)).getUTCDate()
  const keys = Array.from({ length: count }, (_, i) => `${monthKey(y, m)}-${String(i + 1).padStart(2, "0")}`)
  const available = keys.filter((k) => byDay.has(k))
  const gridRef = React.useRef<HTMLDivElement>(null)
  const [focusKey, setFocusKey] = React.useState<string | null>(null)
  const roving = (selected && available.includes(selected) ? selected : null) ?? focusKey ?? available[0] ?? null

  const focus = (k: string) => {
    setFocusKey(k)
    requestAnimationFrame(() => gridRef.current?.querySelector<HTMLElement>(`[data-day="${k}"]`)?.focus())
  }
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "PageUp" && canPrev) {
      e.preventDefault()
      onMonth(-1)
      return
    }
    if (e.key === "PageDown" && canNext) {
      e.preventDefault()
      onMonth(1)
      return
    }
    const step = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: 7, ArrowUp: -7 }[e.key]
    if (!step || !roving) return
    e.preventDefault()
    // Only open days take focus: walk in the arrow's direction to the next one.
    const at = keys.indexOf(roving)
    for (let i = at + step; i >= 0 && i < keys.length; i += step) {
      if (byDay.has(keys[i])) return focus(keys[i])
    }
    if (Math.abs(step) === 7) {
      const ahead = step > 0 ? available.find((k) => k > roving) : [...available].reverse().find((k) => k < roving)
      if (ahead) focus(ahead)
    }
  }

  return (
    <section className="min-w-0 px-5 pb-5 pt-2 sm:w-[480px] sm:shrink-0 sm:px-6 sm:pb-7 sm:pt-7" aria-label="Pick a day">
      <div className="flex items-center justify-between">
        <h2 className="text-heading font-semibold text-ink tabular-nums" aria-live="polite">
          {monthName(y, m)} {y}
        </h2>
        <div className="flex items-center gap-0.5">
          <Button variant="ghost" size="icon" className="size-7" onClick={() => onMonth(-1)} disabled={!canPrev} aria-label="Previous month">
            <ChevronLeft className="size-4" />
          </Button>
          <Button variant="ghost" size="icon" className="size-7" onClick={() => onMonth(1)} disabled={!canNext} aria-label="Next month">
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-7 gap-1" aria-hidden="true">
        {WEEKDAYS.map((d) => (
          <span key={d} className="text-center text-micro font-medium text-ink-3">
            {d}
          </span>
        ))}
      </div>
      <div className="relative mt-2">
        <div
          key={`${y}-${m}`}
          ref={gridRef}
          role="grid"
          aria-label={`${monthName(y, m)} ${y}`}
          onKeyDown={onKeyDown}
          className={cn("grid grid-cols-7 gap-1", dir > 0 ? "content-period-next" : "content-period-prev")}
        >
          {Array.from({ length: lead }).map((_, i) => (
            <span key={`lead-${i}`} aria-hidden="true" />
          ))}
          {keys.map((k) => {
            const slots = byDay.get(k)
            const open = !!slots && !loading
            const isToday = k === todayKey
            const isSel = k === selected
            const filling = open && slots!.length < 4
            return (
              <button
                key={k}
                type="button"
                data-day={k}
                data-available={open || undefined}
                aria-disabled={!open || undefined}
                aria-pressed={isSel || undefined}
                aria-current={isToday ? "date" : undefined}
                aria-label={`${formatFor("en-GB", "UTC", { weekday: "long", day: "numeric", month: "long" }).format(new Date(k + "T12:00:00Z"))}${open ? `, ${slots!.length} ${slots!.length === 1 ? "time" : "times"}` : ", no times"}`}
                tabIndex={open && k === roving ? 0 : -1}
                onClick={() => open && onPick(k)}
                className={cn(
                  "relative flex aspect-square min-h-10 w-full items-center justify-center rounded-[10px] text-heading tabular-nums outline-none",
                  "focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-sheet",
                  loading && "animate-pulse bg-press",
                  !loading && !open && "cursor-default font-normal text-ink-4",
                  open && !isSel && "bg-sunken font-semibold text-ink ring-1 ring-inset ring-line transition-shadow hover:ring-[1.5px] hover:ring-brand",
                  isSel && "content-pop-in bg-brand font-semibold text-brand-foreground shadow-e1",
                )}
              >
                {Number(k.slice(8))}
                {(isToday || filling) && !loading ? (
                  <span
                    aria-hidden="true"
                    className={cn(
                      "absolute bottom-[7px] left-1/2 size-[5px] -translate-x-1/2 rounded-[2.5px]",
                      isSel ? "bg-brand-foreground" : filling ? "bg-[var(--camp-sun-a2)]" : "bg-ink-3",
                    )}
                  />
                ) : null}
              </button>
            )
          })}
        </div>
        {note ? (
          <p role="status" className="mt-3 text-meta text-ink-3" data-month-note="">
            {note}
          </p>
        ) : null}
        {!loading && available.length === 0 ? (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="content-pop-in pointer-events-auto inline-flex items-center gap-2 rounded-[18px] bg-raised py-1.5 pl-3.5 pr-1.5 text-ui-sm text-ink-2 shadow-e1">
              No free times in {monthName(y, m)}
              {canNext ? (
                <Button variant="ghost" size="sm" className="h-7 gap-1 px-2 text-ink" onClick={() => onMonth(1)}>
                  Next month <ArrowRight className="size-3.5" aria-hidden="true" />
                </Button>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
    </section>
  )
}

// ----------------------------------------------------------------------------
// K04. The times, with the confirm split.
// ----------------------------------------------------------------------------

function partOfDay(iso: string, tz: string): "Morning" | "Afternoon" | "Evening" {
  const h = Number(formatFor("en-GB", tz, { hour: "numeric", hour12: false }).format(new Date(iso)))
  return h < 12 ? "Morning" : h < 17 ? "Afternoon" : "Evening"
}

function SlotColumn({
  dayKey: key,
  slots,
  tz,
  h24,
  onH24,
  split,
  taken,
  onSplit,
  onNext,
}: {
  dayKey: string
  slots: Slot[]
  tz: string
  h24: boolean
  onH24: (v: boolean) => void
  split: Slot | null
  taken: string | null
  onSplit: (s: Slot | null) => void
  onNext: (s: Slot) => void
}) {
  const at = new Date(key + "T12:00:00Z")
  const weekday = formatFor("en-GB", "UTC", { weekday: "long" }).format(at)
  const monthWord = formatFor("en-GB", "UTC", { month: "long" }).format(at)
  const grouped = slots.length > 8
  let lastGroup = ""
  const takenSlot = taken ? slots.find((s) => s.start === taken) : undefined
  return (
    <section className="content-slide-in flex min-w-0 flex-col border-line px-5 pb-6 pt-2 sm:w-[260px] sm:shrink-0 sm:border-l sm:px-5 sm:pb-7 sm:pt-7" aria-label="Pick a time" data-slot-column="">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-heading font-semibold text-ink">
          {weekday} {Number(key.slice(8))} <span className="text-ui-sm font-normal text-ink-3">{monthWord}</span>
        </h2>
        <div role="radiogroup" aria-label="Clock" className="inline-flex h-6 shrink-0 items-center rounded-md bg-sunken p-0.5 text-micro font-medium">
          {(["12h", "24h"] as const).map((v) => {
            const on = (v === "24h") === h24
            return (
              <button
                key={v}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => onH24(v === "24h")}
                className={cn("h-5 rounded-[5px] px-1.5 tabular-nums transition-colors", on ? "bg-raised text-ink shadow-e1" : "text-ink-3 hover:text-ink")}
              >
                {v}
              </button>
            )
          })}
        </div>
      </div>
      {takenSlot ? (
        <p role="alert" className="mt-3 text-meta text-danger-ink">
          Someone just booked {slotTime(takenSlot.start, tz, h24)}. Pick another time.
        </p>
      ) : null}
      <div className="relative mt-4 min-h-0 flex-1">
        <div className="max-h-[380px] overflow-y-auto pb-6 pt-1 [mask-image:linear-gradient(to_bottom,transparent,black_12px,black_calc(100%-24px),transparent)] max-sm:max-h-none max-sm:[mask-image:none]">
          <ul className="grid gap-2 max-sm:grid-cols-3">
            {slots.map((s, i) => {
              const group = grouped ? partOfDay(s.start, tz) : ""
              const header = group && group !== lastGroup
              lastGroup = group || lastGroup
              const isSplit = split?.start === s.start
              const isTaken = taken === s.start
              const time = slotTime(s.start, tz, h24)
              return (
                <React.Fragment key={s.start}>
                  {header ? <li className="pt-1 text-micro font-medium text-ink-3 max-sm:col-span-3">{group}</li> : null}
                  <li
                    className={cn("content-rise flex h-10 gap-1.5 max-sm:h-11", isSplit && "max-sm:col-span-3")}
                    style={{ animationDelay: `${Math.min(i * 12, 150)}ms` }}
                    data-slot={s.start}
                  >
                    {isSplit ? (
                      <>
                        <button
                          type="button"
                          onClick={() => onSplit(null)}
                          className="flex h-full basis-[45%] items-center justify-center rounded-lg bg-press text-ui font-medium text-ink-2 tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-brand"
                          aria-label={`${time}, chosen`}
                        >
                          {time}
                        </button>
                        <Button
                          autoFocus
                          className="content-pop-in h-full basis-[55%] gap-1 [animation-delay:80ms]"
                          onClick={() => onNext(s)}
                          data-slot-next=""
                        >
                          Next <ArrowRight className="size-3.5" aria-hidden="true" />
                        </Button>
                      </>
                    ) : (
                      <button
                        type="button"
                        disabled={isTaken}
                        onClick={() => onSplit(s)}
                        className={cn(
                          "h-full w-full rounded-lg bg-raised text-ui font-medium text-ink tabular-nums shadow-e1 outline-none transition-shadow hover:ring-[1.5px] hover:ring-brand focus-visible:ring-2 focus-visible:ring-brand",
                          isTaken && "pointer-events-none line-through opacity-45",
                        )}
                      >
                        {time}
                      </button>
                    )}
                  </li>
                </React.Fragment>
              )
            })}
          </ul>
        </div>
      </div>
    </section>
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
    // A refusal in the server's words: a bad field, or too many bookings from here.
    if ((res.status === 400 || res.status === 429) && res.msg) {
      setFailed(res.msg)
      return
    }
    setFailed("Couldn't book. Your details are kept.")
  }

  const field = "h-9 w-full rounded-lg bg-raised px-3 text-ui text-ink shadow-e1 outline-none placeholder:text-ink-3 focus-visible:ring-1 focus-visible:ring-brand/50 aria-[invalid=true]:ring-1 aria-[invalid=true]:ring-destructive max-sm:h-11 max-sm:text-base"
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
      <div className="flex flex-col gap-2 max-sm:sticky max-sm:bottom-0 max-sm:z-10 max-sm:-mx-5 max-sm:bg-sheet max-sm:px-5 max-sm:pb-[max(12px,env(safe-area-inset-bottom))] max-sm:pt-3 max-sm:shadow-e2">
        <Button type="submit" disabled={busy} className="relative h-10 w-full max-sm:h-12" data-book-button="">
          <span className={cn(busy && "invisible")}>{bookLabel(slot, tz, h24)}</span>
          {busy ? <Loader2 className="absolute size-4 animate-spin" aria-label="Booking" /> : null}
        </Button>
        <p className="text-center text-meta text-ink-3 max-sm:hidden">By booking you agree to receive emails about this meeting.</p>
      </div>
    </form>
  )
}

// ----------------------------------------------------------------------------
// K06. Booked.
// ----------------------------------------------------------------------------

function Confirmation({ booked, tz, h24 }: { booked: Booked; tz: string; h24: boolean }) {
  const cancelUrl = typeof window === "undefined" ? "" : `${window.location.origin}/booking/${booked.cancel_token}`
  const title = `${booked.title} with ${booked.owner_name}`
  const first = (booked.owner_name || "").split(/\s+/)[0]
  // The same event as the invite in the email (its UID is the booking's id),
  // so a guest who adds both gets one. Never the cancel token: that cancels
  // the booking, and a UID travels wherever the event goes.
  const uid = React.useMemo(() => booked.booking_id || globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`, [booked])
  const ics = React.useMemo(() => {
    // No cancel link in it: the link is the guest's credential, and a calendar
    // event is forwarded and shared far more freely than this page or the
    // email, which both show it (the server's invite leaves it out too).
    const file = icsFor({ uid, title, start: booked.start, end: booked.end })
    return URL.createObjectURL(new Blob([file], { type: "text/calendar" }))
  }, [booked, uid, title])
  React.useEffect(() => () => URL.revokeObjectURL(ics), [ics])

  // The area's one public celebration: someone outside the workspace just did
  // the thing. Once, from the check, never under reduced motion.
  const check = React.useRef<SVGGElement>(null)
  const fired = React.useRef(false)
  React.useEffect(() => {
    if (fired.current || prefersReducedMotion()) return
    fired.current = true
    const t = setTimeout(() => celebrate(check.current), 420)
    return () => clearTimeout(t)
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
          <p className="mt-3 inline-flex items-center gap-2 text-ui-sm text-ink-2" data-emailed="">
            <Mail className="size-3.5 text-ink-3" aria-hidden="true" /> We&apos;ve emailed you the invite
          </p>
        ) : null}
        <div className="mt-3 flex flex-wrap gap-2">
          <Button asChild variant="secondary" size="sm">
            <a href={ics} download="booking.ics">Add to calendar (.ics)</a>
          </Button>
          <Button asChild variant="secondary" size="sm">
            <a href={googleCalendarUrl({ title, start: booked.start, end: booked.end, })} target="_blank" rel="noreferrer">
              Google Calendar
            </a>
          </Button>
        </div>
      </div>
      {/* The link only cancels: there is no changing a booking yet. It shows
          whether or not the email went out (CAL-BUG-15). */}
      <p className="mt-4 max-w-sm text-meta text-ink-3" data-cancel-link="">
        {booked.emailed ? "To cancel, use the link in your email, or this one: " : "Keep this link to cancel: "}
        <a className="break-all text-ink-2 underline underline-offset-2" href={cancelUrl}>
          {cancelUrl}
        </a>
      </p>
    </div>
  )
}

/**
 * The confirmation's spot (96 px): a calendar sheet that rises, a moss check
 * that springs onto it, the host's and the visitor's dots sliding along a
 * dashed orbit, and a brand spark. Static under reduced motion (the global
 * rule stills the animations).
 */
export function BookingSpot({ checkRef, owner }: { checkRef?: React.Ref<SVGGElement>; owner?: string }) {
  return (
    <svg viewBox="0 0 96 96" width={96} height={96} aria-hidden="true" data-booking-spot="" className="max-sm:size-20 overflow-visible">
      <circle cx="48" cy="48" r="40" fill="none" stroke="var(--line-2)" strokeDasharray="2 4" />
      <circle cx="48" cy="48" r="30" fill="var(--camp-moss-tint)" />
      <g className="content-slide-in" style={{ animationDelay: "120ms", animationDuration: "400ms" }}>
        <circle cx="8" cy="48" r="5" fill={`var(--camp-${owner ? "sky" : "dusk"}-a2)`} />
        <circle cx="80" cy="25" r="5" fill="var(--camp-berry-a2)" />
      </g>
      <g className="content-rise" style={{ animationDuration: "320ms" }}>
        <rect x="30" y="28" width="36" height="38" rx="6" fill="var(--raised)" style={{ filter: "drop-shadow(0 2px 4px rgb(16 18 26 / .12))" }} />
        <rect x="30" y="28" width="36" height="9" rx="3" fill="var(--camp-sky-a2)" />
        <rect x="36" y="43" width="18" height="3" rx="1.5" fill="var(--line-2)" />
        <rect x="36" y="50" width="12" height="3" rx="1.5" fill="var(--line-2)" />
      </g>
      <g ref={checkRef} className="content-pop-in" style={{ animationDelay: "200ms", transformOrigin: "62px 62px", transformBox: "view-box" }}>
        <circle cx="62" cy="62" r="9" fill="var(--camp-moss-a2)" stroke="var(--sheet)" strokeWidth="2" />
        <path d="M58 62.2l2.8 2.8 5.2-5.4" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </g>
      <path className="content-pop-in" style={{ animationDelay: "320ms", transformOrigin: "74px 15px", transformBox: "view-box" }} d="M74 10Q74.6 14.4 79 15Q74.6 15.6 74 20Q73.4 15.6 69 15Q73.4 14.4 74 10Z" fill="var(--brand)" />
    </svg>
  )
}

// ----------------------------------------------------------------------------
// While it loads.
// ----------------------------------------------------------------------------

function BookingSkeleton({ label }: { label?: string }) {
  return (
    <PublicFrame surface="booking" header={false} mainClassName="sm:px-6 sm:pt-[72px]">
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
