"use client"

// A booking page's free times, picked (content.md K03, K04): the month, a
// day's times, the zone. One picker for booking a time and for moving a
// booking to another from its link (gcal-7), so the two never drift.

import * as React from "react"

import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { ZonePicker } from "@/components/ui/zonePicker"
import { ArrowRight, ChevronLeft, ChevronRight } from "@/lib/icons"
import { dayKey, type Slot } from "@/lib/calendar/availability"
import { cn } from "@/lib/utils/helpers/cn"
import { getBookingPage, type PublicBookingPage } from "@/services/bookingService"
import { publicTrouble, retryDelayMs, retryingText, type PublicTrouble } from "@/services/publicApi"
import { formatFor, parts, slotTime } from "@/components/booking/bookingTime"

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
const DAY_MS = 864e5

/** The month a day key falls in: { y, m } with m from 0. */
const monthOf = (key: string) => ({ y: Number(key.slice(0, 4)), m: Number(key.slice(5, 7)) - 1 })
const monthKey = (y: number, m: number) => `${y}-${String(m + 1).padStart(2, "0")}`
const shiftMonth = (y: number, m: number, by: number) => {
  const d = new Date(Date.UTC(y, m + by, 1))
  return { y: d.getUTCFullYear(), m: d.getUTCMonth() }
}
const monthName = (y: number, m: number) => formatFor("en-GB", "UTC", { month: "long" }).format(new Date(Date.UTC(y, m, 1)))

/**
 * A booking page and its free times, month by month, with the day, the time
 * and the month picked on them. Too many requests from here (429), or no
 * answer: it says so and asks again when the server allows, never calling the
 * page gone (CAL-BUG-14).
 */
export function useSlotPicker(slug: string, tz: string) {
  const [page, setPage] = React.useState<PublicBookingPage | null>(null)
  const [state, setState] = React.useState<"loading" | "ready" | "missing" | "error">("loading")
  const [slotsByStart, setSlotsByStart] = React.useState<Map<string, Slot>>(new Map())
  const [loadedMonths, setLoadedMonths] = React.useState<Set<string>>(new Set())
  const [month, setMonth] = React.useState<{ y: number; m: number } | null>(null)
  const [monthDir, setMonthDir] = React.useState<1 | -1>(1)
  const [day, setDay] = React.useState<string | null>(null)
  const [split, setSplit] = React.useState<Slot | null>(null)
  const [taken, setTaken] = React.useState<string | null>(null)
  const [trouble, setTrouble] = React.useState<Exclude<PublicTrouble, "gone"> | null>(null)
  const [monthTrouble, setMonthTrouble] = React.useState<Exclude<PublicTrouble, "gone"> | null>(null)
  const [monthRetry, setMonthRetry] = React.useState(0)

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

  // A time someone took meanwhile: struck through, and the times asked again shortly.
  const markTaken = React.useCallback(
    (start: string) => {
      setTaken(start)
      setSplit(null)
      setTimeout(refresh, 1500)
    },
    [refresh],
  )

  return {
    page,
    state,
    trouble,
    byDay,
    shown,
    monthDir,
    todayKey,
    day,
    split,
    taken,
    setSplit,
    markTaken,
    refresh,
    loading: !loadedMonths.has(shownKey),
    note: monthTrouble ? retryingText[monthTrouble] : undefined,
    canPrev: shown.y * 12 + shown.m > thisMonth.y * 12 + thisMonth.m,
    canNext: shown.y * 12 + shown.m < lastMonth.y * 12 + lastMonth.m,
    goMonth: (by: 1 | -1) => {
      setMonthDir(by)
      setMonth(shiftMonth(shown.y, shown.m, by))
    },
    pickDay: (k: string) => {
      setDay(k)
      setSplit(null)
      setTaken(null)
    },
  }
}

/** The month, the zone under it on a phone (`phoneZone`), and the picked day's times; `next` names the chosen time's button. */
export function DayAndTimes({
  picker: p,
  tz,
  onTz,
  h24,
  onH24,
  phoneZone,
  onNext,
  next = "Next",
}: {
  picker: ReturnType<typeof useSlotPicker>
  tz: string
  onTz: (tz: string) => void
  h24: boolean
  onH24: (v: boolean) => void
  phoneZone?: boolean
  onNext: (s: Slot) => void
  next?: string
}) {
  return (
    <div className="flex min-w-0 flex-1 flex-col min-[1048px]:flex-row" data-day-and-times="">
      <MonthGrid
        y={p.shown.y}
        m={p.shown.m}
        dir={p.monthDir}
        todayKey={p.todayKey}
        byDay={p.byDay}
        loading={p.loading}
        selected={p.day}
        canPrev={p.canPrev}
        canNext={p.canNext}
        onMonth={p.goMonth}
        onPick={p.pickDay}
        note={p.note}
      />
      {phoneZone ? (
        <div className="px-3 pb-2 sm:hidden">
          <TimeZoneButton tz={tz} onTz={onTz} h24={h24} onH24={onH24} className="max-w-full" />
        </div>
      ) : null}
      {p.day ? (
        <SlotColumn
          key={p.day}
          dayKey={p.day}
          slots={p.byDay.get(p.day) ?? []}
          tz={tz}
          h24={h24}
          onH24={onH24}
          split={p.split}
          taken={p.taken}
          onSplit={p.setSplit}
          onNext={onNext}
          next={next}
        />
      ) : null}
    </div>
  )
}

/** The zone, from the shared picker (components/ui/zonePicker), with a 24-hour switch under its list. */
export function TimeZoneButton({ tz, onTz, h24, onH24, className }: { tz: string; onTz: (tz: string) => void; h24: boolean; onH24: (v: boolean) => void; className?: string }) {
  return (
    <ZonePicker
      tz={tz}
      onTz={onTz}
      className={className}
      footer={
        <label className="flex items-center justify-between border-t border-line px-3 py-2 text-ui-sm text-ink-2">
          Use 24-hour time
          <Switch checked={h24} onCheckedChange={onH24} aria-label="Use 24-hour time" />
        </label>
      }
    />
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
  // A day with fewer than four times left wears a sun dot, which says so under the month (PTC-51).
  const fewLeft = !loading && available.some((k) => byDay.get(k)!.length < 4)
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
    <section className="min-w-0 px-5 pb-5 pt-2 sm:px-6 sm:pb-7 sm:pt-7 min-[1048px]:w-[480px] min-[1048px]:shrink-0" aria-label="Pick a day">
      <div className="flex items-center justify-between">
        <h2 className="text-heading font-semibold text-ink tabular-nums" aria-live="polite">
          {monthName(y, m)} {y}
        </h2>
        {/* A touch group (app/phone.css F3b): under a finger the arrows stand
            apart, or a tap on Previous's edge went to Next. */}
        <div className="flex items-center gap-0.5" data-touch-group="">
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
        {fewLeft ? (
          <p className="mt-2 flex items-center gap-1.5 text-meta text-ink-3" data-few-left="">
            <span aria-hidden="true" className="size-[5px] rounded-[2.5px] bg-[var(--camp-sun-a2)]" />
            Only a few times left
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
  const h = Number(parts(iso, tz, { hour: "numeric", hourCycle: "h23" })("hour"))
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
  next,
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
  next: string
}) {
  const at = new Date(key + "T12:00:00Z")
  const weekday = formatFor("en-GB", "UTC", { weekday: "long" }).format(at)
  const monthWord = formatFor("en-GB", "UTC", { month: "long" }).format(at)
  const grouped = slots.length > 8
  let lastGroup = ""
  const takenSlot = taken ? slots.find((s) => s.start === taken) : undefined
  return (
    <section className="content-slide-in flex min-w-0 flex-col border-line px-5 pb-6 pt-2 sm:max-[1048px]:border-t sm:px-6 sm:pb-7 sm:pt-6 min-[1048px]:w-[260px] min-[1048px]:shrink-0 min-[1048px]:border-l min-[1048px]:px-5 min-[1048px]:pt-7" aria-label="Pick a time" data-slot-column="">
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
                data-touch-target=""
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
        <div className="max-h-[380px] overflow-y-auto pb-6 pt-1 [mask-image:linear-gradient(to_bottom,transparent,black_12px,black_calc(100%-24px),transparent)] max-[1047px]:max-h-none max-[1047px]:[mask-image:none]">
          <ul className="grid gap-2 max-[1047px]:grid-cols-3">
            {slots.map((s, i) => {
              const group = grouped ? partOfDay(s.start, tz) : ""
              const header = group && group !== lastGroup
              lastGroup = group || lastGroup
              const isSplit = split?.start === s.start
              const isTaken = taken === s.start
              const time = slotTime(s.start, tz, h24)
              return (
                <React.Fragment key={s.start}>
                  {header ? <li className="pt-1 text-micro font-medium text-ink-3 max-[1047px]:col-span-3">{group}</li> : null}
                  <li
                    className={cn("content-rise flex h-10 gap-1.5 max-sm:h-11", isSplit && "max-[1047px]:col-span-3")}
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
                          {next} <ArrowRight className="size-3.5" aria-hidden="true" />
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
