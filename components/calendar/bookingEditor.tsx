"use client"

// A booking page's editor (content.md K06): the form beside a live preview of
// what the person booking will see. A chunk of its own, fetched as the
// pointer or the focus reaches the list (bookingSettings.tsx): the page's
// first screen is the list, and the editor's fields, zones and preview come
// only when a page is opened.

import * as React from "react"
import { addDays, format, startOfDay } from "date-fns"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { DateField } from "@/components/ui/date-field"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Clock, Globe, X } from "@/lib/icons"
import { cn } from "@/lib/utils/helpers/cn"
import { PaperCard } from "@/components/guest/PublicFrame"
import { WorkspaceMark } from "@/components/guest/publicHeader"
import { usePost } from "@/hooks/usePost"
import { useToast } from "@/hooks/use-toast"
import { CalendarPost } from "@/services/endpoints/calendar"
import { bookingPageUrl } from "@/services/bookingService"
import { dayKey, defaultHours, slugify, type WorkingHours } from "@/lib/calendar/availability"
import { asBookingHours, weekProblem, type Dates, type Week } from "@/lib/calendar/workingHours"
import { MAX_DATES, datesGoneBy, datesProblem, goneBySentence, pageWeek, withPageWeek } from "@/lib/calendar/pageHours"
import { DayHours, WeekHoursEditor } from "@/components/calendar/workingHours/weekHoursEditor"
import { apiErrorMessage } from "@/lib/utils/apiError"
import { usePreferences } from "@/lib/preferences/usePreference"
import { zoneLabels, zoneRows } from "@/lib/utils/zones"
import { FitLabel } from "@/components/common/FitLabel"
import { clockTime } from "@/lib/utils/date/clock"
import type { BookingPage } from "@/components/calendar/bookingSettings"

/** The week as it reads here: Monday first. */
const WEEK = [1, 2, 3, 4, 5, 6, 0]
const DURATIONS = [15, 20, 30, 45, 60, 90]
/** A date opened without its weekday's ranges: nine to five. */
const defaultSpans = [{ start: "09:00", end: "17:00" }]
const BUFFERS = [0, 5, 10, 15, 30]
const NOTICE: [number, string][] = [[0, "None"], [60, "1 hour"], [240, "4 hours"], [1440, "1 day"], [2880, "2 days"]]
const AHEAD = [7, 14, 30, 60, 90]

/** "Thu 24 Dec", with its year when it isn't this one's. */
const dateName = (d: string) => format(new Date(`${d}T12:00:00`), d.slice(0, 4) === String(new Date().getFullYear()) ? "EEE d MMM" : "EEE d MMM yyyy")

/** Your working hours as a page's (its own week, ranges and all), or null without them. */
function fromMine(week: Week | null | undefined, tz: string | null | undefined): WorkingHours | null {
  const hours = asBookingHours(week, tz)
  return hours && week ? { ...hours, week } : null
}

/** A page as opened, its dates gone by (in its zone) taken off, and the sentence that says so. */
function opened(page: BookingPage): { page: BookingPage; tookOff: string | null } {
  const { dates, gone } = datesGoneBy(page.hours.dates, page.hours.tz)
  return { page: gone.length ? { ...page, hours: { ...page.hours, dates } } : page, tookOff: goneBySentence(gone) }
}

/** A new page: your working hours where kept, else nine to five. */
const blank = (mine?: BookingPage["hours"] | null): BookingPage => ({
  slug: "",
  title: "",
  description: "",
  duration_minutes: 30,
  hours: mine ?? defaultHours(),
  buffer_minutes: 10,
  min_notice_minutes: 240,
  max_days_ahead: 30,
  active: true,
})

/** A page's editor: the page opened, or (null) a new one from your working hours. */
export function BookingEditor({ page, onCancel, onSaved }: { page: BookingPage | null; onCancel: () => void; onSaved: () => void }) {
  const prefs = usePreferences()
  const [first] = React.useState(() => opened(page ?? blank(fromMine(prefs?.["calendar.working_hours"] as Week | null, prefs?.zone as string | null))))
  const [p, setP] = React.useState<BookingPage>(first.page)
  // What came off the page's dates as gone by, said once to its owner; a refused save's words.
  const [tookOff, setTookOff] = React.useState(first.tookOff)
  const [refused, setRefused] = React.useState<string | null>(null)
  // The list is built on first open (CAL-BUG-20).
  const [zonesOpen, setZonesOpen] = React.useState(false)
  const zones = React.useMemo(() => (zonesOpen ? zoneRows() : []), [zonesOpen])
  const [slugTouched, setSlugTouched] = React.useState(!!page?.id)
  const { makeRequest, isSubmitting } = usePost()
  const { toast } = useToast()
  const set = <K extends keyof BookingPage>(k: K, v: BookingPage[K]) => setP((x) => ({ ...x, [k]: v }))
  const setHours = (h: Partial<WorkingHours>) => setP((x) => ({ ...x, hours: { ...x.hours, ...h } }))
  const week = pageWeek(p.hours)
  const setWeek = (next: Week) => setP((x) => ({ ...x, hours: withPageWeek(x.hours, next) }))
  const dates: Dates = p.hours.dates ?? {}
  const setDates = (next: Dates) => setHours({ dates: next })
  const problem = weekProblem(week) ?? datesProblem(p.hours.dates)

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    // A date that went by while the page was open comes off before the save: the server refuses one.
    const now = opened(p)
    if (now.tookOff) {
      setP(now.page)
      setTookOff(now.tookOff)
    }
    setRefused(null)
    let res: BookingPage | undefined
    try {
      res = await makeRequest<BookingPage, BookingPage>({
        apiEndpoint: CalendarPost.SaveBookingPage,
        // The count is the server's to say, never sent back.
        payload: { ...now.page, upcoming_bookings: undefined, slug: slugify(now.page.slug || now.page.title) },
        quiet: true,
      })
    } catch (err) {
      // The edits stay; the server's reason shows as written.
      setRefused(apiErrorMessage(err, "Couldn't save the page. Your changes are still here; try again."))
      return
    }
    if (res) {
      toast({ title: page?.id ? "Saved" : "Booking page ready", description: bookingPageUrl(res.slug) })
      onSaved()
    }
  }

  return (
    <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_360px]">
      <form onSubmit={save} className="grid gap-5 rounded-[16px] bg-sheet p-5 shadow-e1 ring-1 ring-line">
        <div className="grid gap-1.5">
          <Label htmlFor="bp-title">Title</Label>
          <Input
            id="bp-title"
            value={p.title}
            maxLength={80}
            placeholder="Intro call"
            onChange={(e) => {
              set("title", e.target.value)
              if (!slugTouched) set("slug", slugify(e.target.value))
            }}
            required
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="bp-slug">Link</Label>
          <div className="flex h-8 items-center rounded-lg bg-raised pl-2.5 text-ui shadow-e1 focus-within:focus-halo">
            <span className="shrink-0 text-ink-3">/book/</span>
            <input
              id="bp-slug"
              value={p.slug}
              maxLength={40}
              onChange={(e) => {
                setSlugTouched(true)
                set("slug", e.target.value.toLowerCase())
              }}
              onBlur={() => set("slug", slugify(p.slug))}
              className="h-8 min-w-0 flex-1 bg-transparent pr-2.5 text-ink outline-none"
              required
            />
          </div>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="bp-desc">What it&apos;s for (optional)</Label>
          <Textarea id="bp-desc" value={p.description} maxLength={1000} rows={2} className="resize-none" onChange={(e) => set("description", e.target.value)} />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Choice label="Length" value={p.duration_minutes} options={DURATIONS.map((d) => [d, `${d} min`])} onChange={(v) => set("duration_minutes", v)} />
          <Choice label="Gap between meetings" value={p.buffer_minutes} options={BUFFERS.map((d) => [d, d ? `${d} min` : "None"])} onChange={(v) => set("buffer_minutes", v)} />
          <Choice label="Minimum notice" value={p.min_notice_minutes} options={NOTICE} onChange={(v) => set("min_notice_minutes", v)} />
          <Choice label="Bookable ahead" value={p.max_days_ahead} options={AHEAD.map((d) => [d, `${d} days`])} onChange={(v) => set("max_days_ahead", v)} />
        </div>

        <fieldset className="grid gap-2">
          <legend className="mb-1.5 text-ui-sm font-medium text-ink">Available</legend>
          <div className="grid gap-1" data-hours-week="">
            <WeekHoursEditor week={week} order={WEEK} onWeek={setWeek} switchLabel={(day) => `Open on ${day}s`} />
          </div>
          {problem ? (
            <p role="alert" className="text-meta text-danger-ink">
              {problem}
            </p>
          ) : null}
          <div className="flex flex-wrap items-center gap-2 text-ui text-ink-2">
            <Select value={p.hours.tz} onValueChange={(tz) => setHours({ tz })} onOpenChange={setZonesOpen}>
              <SelectTrigger dense className="min-w-0 basis-full" aria-label="Time zone">
                <FitLabel options={zoneLabels(p.hours.tz)} />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                {zones.map((z) => (
                  <SelectItem key={z.z} value={z.z}>
                    {z.label} ({z.off})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <p className="text-meta text-ink-3">Times you already have events, here or on Google Calendar, are never offered.</p>
        </fieldset>

        <fieldset className="grid gap-2" data-hours-dates="">
          <legend className="mb-1.5 text-ui-sm font-medium text-ink">Dates of its own</legend>
          {tookOff ? <p className="text-meta text-ink-2">{tookOff}</p> : null}
          {Object.keys(dates).length ? (
            <div className="grid gap-1">
              {Object.keys(dates)
                .sort()
                .map((d) => (
                  <DayHours
                    key={d}
                    hours={dates}
                    k={d}
                    name={dateName(d)}
                    switchLabel={`Open on ${dateName(d)}`}
                    offWord="Day off"
                    onToggle={(on) => setDates({ ...dates, [d]: on ? (week[String(new Date(`${d}T12:00:00`).getDay())] ?? defaultSpans).map((s) => ({ ...s })) : [] })}
                    onChange={setDates}
                    data-hours-date={d}
                    after={
                      <Button type="button" size="icon-sm" variant="ghost" className="max-sm:size-11 pointer-coarse:size-11" aria-label={`Remove ${dateName(d)}`} title="Remove date" onClick={() => setDates(Object.fromEntries(Object.entries(dates).filter(([k]) => k !== d)))}>
                        <X />
                      </Button>
                    }
                  />
                ))}
            </div>
          ) : (
            <p className="text-meta text-ink-3">No dates of its own: every week runs as above.</p>
          )}
          {Object.keys(dates).length < MAX_DATES ? (
            <span className="w-48 max-w-full">
              <DateField value="" aria-label="Add a date" placeholder="Add a date" min={dayKey(new Date(), p.hours.tz)} onChange={(d) => d && !dates[d] && setDates({ ...dates, [d]: [] })} />
            </span>
          ) : null}
          <p className="text-meta text-ink-3">A date takes the place of its weekday: a day off, or other hours.</p>
        </fieldset>

        <label className="flex items-center justify-between gap-3 border-t border-line pt-4">
          <span className="grid gap-0.5">
            <span className="text-ui font-medium text-ink">Taking bookings</span>
            <span className="text-meta text-ink-3">Turn off to pause the link without deleting it.</span>
          </span>
          <Switch checked={p.active} onCheckedChange={(v) => set("active", v)} />
        </label>

        {refused ? (
          <p role="alert" className="text-meta text-danger-ink">
            {refused}
          </p>
        ) : null}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" disabled={!!problem} busy={isSubmitting}>
            {page?.id ? "Save" : "Create page"}
          </Button>
        </div>
      </form>
      <BookingPreview page={p} />
    </div>
  )
}

/** The first times a day offers, from the hours, the length and the gap. Pure. */
export function sampleTimes(hours: WorkingHours, minutes: number, gap: number, count = 4): string[] {
  const toMin = (t: string) => {
    const [h, m] = t.split(":").map(Number)
    return h * 60 + (m || 0)
  }
  const out: string[] = []
  for (let m = toMin(hours.start); m + minutes <= toMin(hours.end) && out.length < count; m += minutes + gap) {
    out.push(clockTime(new Date(2000, 0, 1, Math.floor(m / 60), m % 60)))
  }
  return out
}

/**
 * What someone booking sees, as you change it: the public page's paper card,
 * beside the form.
 */
function BookingPreview({ page }: { page: BookingPage }) {
  const today = startOfDay(new Date())
  const days = Array.from({ length: 7 }, (_, i) => addDays(today, i + 1))
  const firstOpen = days.find((d) => page.hours.days.includes(d.getDay()))
  const times = sampleTimes(page.hours, page.duration_minutes, page.buffer_minutes)
  return (
    <aside className="grid gap-2 lg:sticky lg:top-6" aria-label="Preview" data-booking-preview="">
      <p className="px-1 text-meta font-medium text-ink-3">Preview</p>
      <div className="rounded-[16px] bg-sunken p-4">
        <PaperCard elevation="e2" className={cn("rounded-[16px] p-5 shadow-e2", !page.active && "opacity-60")}>
          <div className="flex items-center gap-2 pb-4">
            <WorkspaceMark size={16} />
            <span className="truncate text-meta font-medium text-ink-3">/book/{page.slug || slugify(page.title) || "your-link"}</span>
          </div>
          <h2 className="font-display text-title-3 font-semibold text-ink">{page.title || "Intro call"}</h2>
          <p className="mt-1 flex items-center gap-3 text-ui-sm text-ink-2">
            <span className="flex shrink-0 items-center gap-1 whitespace-nowrap">
              <Clock className="size-3.5 text-ink-3" aria-hidden="true" />
              {page.duration_minutes} min
            </span>
            <span className="flex min-w-0 flex-1 items-center gap-1">
              <Globe className="size-3.5 shrink-0 text-ink-3" aria-hidden="true" />
              <FitLabel options={zoneLabels(page.hours.tz)} />
            </span>
          </p>
          {page.description ? <p className="mt-2 line-clamp-3 text-ui-sm text-ink-2">{page.description}</p> : null}
          <div className="mt-4 grid grid-cols-7 gap-1">
            {days.map((d) => {
              const open = page.hours.days.includes(d.getDay())
              const chosen = !!firstOpen && d.getTime() === firstOpen.getTime()
              return (
                <span
                  key={d.toISOString()}
                  className={cn("flex h-11 flex-col items-center justify-center rounded-lg text-micro tabular-nums", chosen ? "bg-ink text-sheet" : open ? "bg-raised text-ink shadow-e1" : "text-ink-4")}
                >
                  <span className="font-medium opacity-70">{format(d, "EEEEE")}</span>
                  <span className="text-ui-sm font-semibold">{format(d, "d")}</span>
                </span>
              )
            })}
          </div>
          <div className="mt-3 grid grid-cols-2 gap-1.5">
            {times.length > 0 ? (
              times.map((t) => (
                <span key={t} className="flex h-8 items-center justify-center rounded-lg text-ui-sm font-medium tabular-nums text-brand-text ring-1 ring-inset ring-brand/40">
                  {t}
                </span>
              ))
            ) : (
              <span className="col-span-2 text-ui-sm text-ink-3">No times fit these hours.</span>
            )}
          </div>
          {!page.active ? <p className="mt-3 text-meta text-ink-3">Paused: the link says it isn&apos;t taking bookings.</p> : null}
        </PaperCard>
      </div>
    </aside>
  )
}

function Choice({ label, value, options, onChange }: { label: string; value: number; options: [number, string][]; onChange: (v: number) => void }) {
  const id = React.useId()
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Select value={String(value)} onValueChange={(v) => onChange(Number(v))}>
        <SelectTrigger id={id}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map(([v, l]) => (
            <SelectItem key={v} value={String(v)}>
              {l}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
