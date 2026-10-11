"use client"

// Booking pages, owner side (content.md K06): Calendly's links, self-hosted.
// A page of its own at /app/calendar/booking, reached from the calendars
// popover. The pages sit as rows in one card; editing one is a form beside a
// live preview of what the person booking will see.

import * as React from "react"
import Link from "next/link"
import { addDays, format, startOfDay } from "date-fns"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ArrowLeft, Check, ChevronLeft, Clock, Copy, ExternalLink, Globe, Link2, Plus, Trash2 } from "@/lib/icons"
import { cn } from "@/lib/utils/helpers/cn"
import { RESOURCE_ROW, ResourceListEmpty, ResourceListSkeleton } from "@/components/dialog/resourceListParts"
import { PaperCard, WorkspaceMark } from "@/components/guest/PublicFrame"
import { useFetch } from "@/hooks/useFetch"
import { usePost } from "@/hooks/usePost"
import { useToast } from "@/hooks/use-toast"
import { useConfirm } from "@/hooks/useConfirm"
import { GetEndpointUrl, PostEndpointUrl } from "@/services/endPoints"
import { bookingPageUrl } from "@/services/bookingService"
import { defaultHours, slugify, timeZones, type WorkingHours } from "@/lib/calendar/availability"

interface BookingPage {
  id?: string
  slug: string
  title: string
  description: string
  duration_minutes: number
  hours: WorkingHours
  buffer_minutes: number
  min_notice_minutes: number
  max_days_ahead: number
  active: boolean
}

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
/** The week as it reads here: Monday first. */
const WEEK = [1, 2, 3, 4, 5, 6, 0]
const DURATIONS = [15, 20, 30, 45, 60, 90]
const BUFFERS = [0, 5, 10, 15, 30]
const NOTICE: [number, string][] = [[0, "None"], [60, "1 hour"], [240, "4 hours"], [1440, "1 day"], [2880, "2 days"]]
const AHEAD = [7, 14, 30, 60, 90]

const blank = (): BookingPage => ({
  slug: "",
  title: "",
  description: "",
  duration_minutes: 30,
  hours: defaultHours(),
  buffer_minutes: 10,
  min_notice_minutes: 240,
  max_days_ahead: 30,
  active: true,
})

export function BookingSettings() {
  const { data, isLoading, mutate } = useFetch<{ data: BookingPage[] }>(GetEndpointUrl.GetBookingPages)
  const [editing, setEditing] = React.useState<BookingPage | null>(null)
  const pages = data?.data ?? []

  return (
    <div className="h-full overflow-y-auto bg-sheet" data-booking-settings="">
      <div className="mx-auto w-full max-w-[960px] px-4 pb-16 pt-6 sm:px-8">
        <div className="flex items-center gap-2 pb-1">
          {editing ? (
            <Button variant="ghost" size="icon-sm" aria-label="Back to booking pages" onClick={() => setEditing(null)}>
              <ChevronLeft />
            </Button>
          ) : (
            <Button variant="ghost" size="icon-sm" aria-label="Back to the calendar" asChild>
              <Link href="/app/calendar">
                <ArrowLeft />
              </Link>
            </Button>
          )}
          <h1 className="font-display text-title-2 font-semibold text-ink">{editing ? (editing.id ? editing.title || "Booking page" : "New booking page") : "Booking pages"}</h1>
        </div>
        <p className="pb-6 pl-9 text-ui text-ink-2">
          {editing ? "People outside your workspace pick a time you're free. It lands on your calendar." : "Share a link and let people book time with you, without the back-and-forth."}
        </p>
        {editing ? (
          <PageEditor
            page={editing}
            onCancel={() => setEditing(null)}
            onSaved={async () => {
              await mutate()
              setEditing(null)
            }}
          />
        ) : (
          <PageList pages={pages} loading={isLoading} onEdit={setEditing} onChanged={() => void mutate()} />
        )}
      </div>
    </div>
  )
}

function PageList({ pages, loading, onEdit, onChanged }: { pages: BookingPage[]; loading: boolean; onEdit: (p: BookingPage) => void; onChanged: () => void }) {
  const { makeRequest, isSubmitting } = usePost()
  const { toast } = useToast()
  const confirm = useConfirm()
  const [copied, setCopied] = React.useState<string | null>(null)

  const copy = async (slug: string) => {
    try {
      await navigator.clipboard.writeText(bookingPageUrl(slug))
      setCopied(slug)
      setTimeout(() => setCopied(null), 1500)
    } catch {
      toast({ title: "Couldn't copy", description: bookingPageUrl(slug) })
    }
  }
  const remove = (p: BookingPage) =>
    confirm({
      title: `Delete the booking page “${p.title}”?`,
      description: "Its link stops working. Bookings already made stay on your calendar.",
      confirmText: "Delete booking page",
      destructive: true,
      onConfirm: async () => {
        const res = await makeRequest<{ id: string }, unknown>({ apiEndpoint: PostEndpointUrl.DeleteBookingPage, payload: { id: p.id! }, showErrorToast: true })
        if (res !== undefined) {
          toast({ title: `Deleted “${p.title}”`, description: "Bookings already made stay on your calendar." })
          onChanged()
        }
      },
    })

  return (
    <div className="grid gap-4">
      {/* One card; the pages are rows inside it, not cards of their own. */}
      <section className="rounded-[16px] bg-sheet p-2 shadow-e1 ring-1 ring-line" data-booking-list="">
        {loading ? (
          <ResourceListSkeleton label="Loading booking pages" rows={2} />
        ) : pages.length === 0 ? (
          <div className="py-6">
            <ResourceListEmpty icon={Link2} title="No booking pages yet" description="Make one for intro calls, office hours or interviews." />
          </div>
        ) : (
          <ul className="grid">
            {pages.map((p) => (
              <li key={p.id} className={RESOURCE_ROW}>
                <span aria-hidden="true" className={cn("flex size-8 shrink-0 items-center justify-center rounded-lg", p.active ? "bg-brand-muted text-brand-text" : "bg-sunken text-ink-3")}>
                  <Link2 className="size-4" />
                </span>
                <button type="button" onClick={() => onEdit(p)} className="min-w-0 flex-1 text-left outline-none focus-visible:underline">
                  <span className="block truncate text-ui font-medium text-ink">
                    {p.title}
                    {!p.active && <span className="ml-2 text-meta font-normal text-ink-3">Paused</span>}
                  </span>
                  <span className="block truncate text-meta text-ink-3">
                    {p.duration_minutes} min · /book/{p.slug}
                  </span>
                </button>
                <Button variant="ghost" size="icon-sm" aria-label={`Copy the link to ${p.title}`} onClick={() => copy(p.slug)}>
                  {copied === p.slug ? <Check /> : <Copy />}
                </Button>
                <Button variant="ghost" size="icon-sm" aria-label={`Open ${p.title}`} asChild>
                  <a href={bookingPageUrl(p.slug)} target="_blank" rel="noreferrer">
                    <ExternalLink />
                  </a>
                </Button>
                <Button variant="ghost" size="icon-sm" aria-label={`Delete ${p.title}`} disabled={isSubmitting} onClick={() => remove(p)}>
                  <Trash2 />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>
      <Button onClick={() => onEdit(blank())} className="justify-self-start">
        <Plus /> New booking page
      </Button>
    </div>
  )
}

function PageEditor({ page, onCancel, onSaved }: { page: BookingPage; onCancel: () => void; onSaved: () => void }) {
  const [p, setP] = React.useState<BookingPage>(page)
  const [slugTouched, setSlugTouched] = React.useState(!!page.id)
  const { makeRequest, isSubmitting } = usePost()
  const { toast } = useToast()
  const zones = React.useMemo(() => timeZones(page.hours.tz), [page.hours.tz])
  const set = <K extends keyof BookingPage>(k: K, v: BookingPage[K]) => setP((x) => ({ ...x, [k]: v }))
  const setHours = (h: Partial<WorkingHours>) => setP((x) => ({ ...x, hours: { ...x.hours, ...h } }))

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    const res = await makeRequest<BookingPage, BookingPage>({
      apiEndpoint: PostEndpointUrl.SaveBookingPage,
      payload: { ...p, slug: slugify(p.slug || p.title) },
      showErrorToast: true,
    })
    if (res) {
      toast({ title: page.id ? "Saved" : "Booking page ready", description: bookingPageUrl(res.slug) })
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
          <div className="flex h-8 items-center rounded-lg bg-raised pl-2.5 text-ui shadow-e1 focus-within:ring-1 focus-within:ring-brand/50">
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
          <div className="flex flex-wrap gap-1" role="group" aria-label="Days">
            {WEEK.map((i) => {
              const on = p.hours.days.includes(i)
              return (
                <button
                  key={i}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setHours({ days: on ? p.hours.days.filter((x) => x !== i) : [...p.hours.days, i].sort() })}
                  className={cn(
                    "h-8 w-12 rounded-md text-ui-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-brand",
                    on ? "bg-ink text-sheet" : "bg-raised text-ink-2 shadow-e1 hover:text-ink",
                  )}
                >
                  {DAYS[i]}
                </button>
              )
            })}
          </div>
          <div className="flex flex-wrap items-center gap-2 text-ui text-ink-2">
            <Input dense type="time" aria-label="From" value={p.hours.start} onChange={(e) => setHours({ start: e.target.value })} className="w-28" />
            <span>to</span>
            <Input dense type="time" aria-label="Until" value={p.hours.end} onChange={(e) => setHours({ end: e.target.value })} className="w-28" />
            <Select value={p.hours.tz} onValueChange={(tz) => setHours({ tz })}>
              <SelectTrigger dense className="min-w-0 flex-1" aria-label="Time zone">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                {zones.map((z) => (
                  <SelectItem key={z} value={z}>
                    {z.replace(/_/g, " ")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <p className="text-meta text-ink-3">Times you already have events, here or on Google Calendar, are never offered.</p>
        </fieldset>

        <label className="flex items-center justify-between gap-3 border-t border-line pt-4">
          <span className="grid gap-0.5">
            <span className="text-ui font-medium text-ink">Taking bookings</span>
            <span className="text-meta text-ink-3">Turn off to pause the link without deleting it.</span>
          </span>
          <Switch checked={p.active} onCheckedChange={(v) => set("active", v)} />
        </label>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" disabled={isSubmitting || p.hours.days.length === 0} aria-busy={isSubmitting || undefined}>
            {page.id ? "Save" : "Create page"}
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
    out.push(format(new Date(2000, 0, 1, Math.floor(m / 60), m % 60), "h:mm a"))
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
            <span className="flex items-center gap-1">
              <Clock className="size-3.5 text-ink-3" aria-hidden="true" />
              {page.duration_minutes} min
            </span>
            <span className="flex min-w-0 items-center gap-1 truncate">
              <Globe className="size-3.5 shrink-0 text-ink-3" aria-hidden="true" />
              {page.hours.tz.replace(/_/g, " ")}
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
