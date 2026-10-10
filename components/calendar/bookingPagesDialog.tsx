"use client"

// Booking pages, owner side: Calendly's links, self-hosted. Make a page with a
// meeting length and the hours people may book, share its link, and bookings
// land on this calendar (and on Google's when connected).

import * as React from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Check, Copy, ExternalLink, Loader2, Plus, Trash2 } from "@/lib/icons"
import { cn } from "@/lib/utils/helpers/cn"
import { useFetch } from "@/hooks/useFetch"
import { usePost } from "@/hooks/usePost"
import { useToast } from "@/hooks/use-toast"
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

export function BookingPagesDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { data, isLoading, mutate } = useFetch<{ data: BookingPage[] }>(open ? GetEndpointUrl.GetBookingPages : "")
  const [editing, setEditing] = React.useState<BookingPage | null>(null)
  const pages = data?.data ?? []

  React.useEffect(() => {
    if (!open) setEditing(null)
  }, [open])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? (editing.id ? "Edit booking page" : "New booking page") : "Booking pages"}</DialogTitle>
          <DialogDescription>
            {editing
              ? "People outside your workspace pick a time you're free. It lands on your calendar."
              : "Share a link and let people book time with you, without the back-and-forth."}
          </DialogDescription>
        </DialogHeader>
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
      </DialogContent>
    </Dialog>
  )
}

function PageList({
  pages,
  loading,
  onEdit,
  onChanged,
}: {
  pages: BookingPage[]
  loading: boolean
  onEdit: (p: BookingPage) => void
  onChanged: () => void
}) {
  const { makeRequest, isSubmitting } = usePost()
  const { toast } = useToast()
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
  const remove = async (p: BookingPage) => {
    const res = await makeRequest<{ id: string }, unknown>({
      apiEndpoint: PostEndpointUrl.DeleteBookingPage,
      payload: { id: p.id! },
      showErrorToast: true,
    })
    if (res !== undefined) {
      toast({ title: `Deleted “${p.title}”`, description: "Bookings already made stay on your calendar." })
      onChanged()
    }
  }

  return (
    <div className="grid gap-3">
      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : pages.length === 0 ? (
        <p className="rounded-md bg-muted/50 p-3 text-sm text-muted-foreground">
          No booking pages yet. Make one for intro calls, office hours or interviews.
        </p>
      ) : (
        <ul className="grid gap-2">
          {pages.map((p) => (
            <li key={p.id} className="flex items-center gap-2 rounded-md border p-3">
              <button type="button" onClick={() => onEdit(p)} className="min-w-0 flex-1 text-left focus-visible:outline-none focus-visible:underline">
                <span className="block truncate text-sm font-medium">
                  {p.title}
                  {!p.active && <span className="ml-2 text-xs font-normal text-muted-foreground">Off</span>}
                </span>
                <span className="block truncate text-xs text-muted-foreground">
                  {p.duration_minutes} min · /book/{p.slug}
                </span>
              </button>
              <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={`Copy the link to ${p.title}`} onClick={() => copy(p.slug)}>
                {copied === p.slug ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={`Open ${p.title}`} asChild>
                <a href={bookingPageUrl(p.slug)} target="_blank" rel="noreferrer">
                  <ExternalLink className="h-4 w-4" />
                </a>
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground" aria-label={`Delete ${p.title}`} disabled={isSubmitting} onClick={() => remove(p)}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </li>
          ))}
        </ul>
      )}
      <Button onClick={() => onEdit(blank())} className="justify-self-start gap-1.5">
        <Plus className="h-4 w-4" /> New booking page
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
    <form onSubmit={save} className="grid gap-4">
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
        <div className="flex items-center rounded-md border bg-muted/40 pl-3 text-sm focus-within:ring-2 focus-within:ring-ring">
          <span className="shrink-0 text-muted-foreground">/book/</span>
          <input
            id="bp-slug"
            value={p.slug}
            maxLength={40}
            onChange={(e) => {
              setSlugTouched(true)
              set("slug", e.target.value.toLowerCase())
            }}
            onBlur={() => set("slug", slugify(p.slug))}
            className="h-9 min-w-0 flex-1 bg-transparent pr-3 outline-none"
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
        <legend className="mb-1 text-sm font-medium">Available</legend>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Days">
          {DAYS.map((d, i) => {
            const on = p.hours.days.includes(i)
            return (
              <button
                key={d}
                type="button"
                aria-pressed={on}
                onClick={() => setHours({ days: on ? p.hours.days.filter((x) => x !== i) : [...p.hours.days, i].sort() })}
                className={cn(
                  "h-8 rounded-full border px-3 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  on ? "border-primary bg-primary text-primary-foreground" : "hover:bg-accent",
                )}
              >
                {d}
              </button>
            )
          })}
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Input dense type="time" aria-label="From" value={p.hours.start} onChange={(e) => setHours({ start: e.target.value })} className="h-8 w-28" />
          <span>to</span>
          <Input dense type="time" aria-label="Until" value={p.hours.end} onChange={(e) => setHours({ end: e.target.value })} className="h-8 w-28" />
          <Select value={p.hours.tz} onValueChange={(tz) => setHours({ tz })}>
            <SelectTrigger className="h-8 min-w-0 flex-1" aria-label="Time zone">
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
        <p className="text-xs text-muted-foreground">Times you already have events, here or on Google Calendar, are never offered.</p>
      </fieldset>

      <label className="flex items-center justify-between gap-3 rounded-md border p-3 text-sm">
        <span>
          Taking bookings
          <span className="block text-xs text-muted-foreground">Turn off to pause the link without deleting it.</span>
        </span>
        <Switch checked={p.active} onCheckedChange={(v) => set("active", v)} />
      </label>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onCancel}>
          Back
        </Button>
        <Button type="submit" disabled={isSubmitting || p.hours.days.length === 0}>
          {isSubmitting && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
          {page.id ? "Save" : "Create page"}
        </Button>
      </div>
    </form>
  )
}

function Choice({ label, value, options, onChange }: { label: string; value: number; options: [number, string][]; onChange: (v: number) => void }) {
  const id = React.useId()
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id} className="text-xs">
        {label}
      </Label>
      <Select value={String(value)} onValueChange={(v) => onChange(Number(v))}>
        <SelectTrigger id={id} className="h-9">
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
