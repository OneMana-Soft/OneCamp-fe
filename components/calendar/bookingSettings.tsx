"use client"

// Booking pages, owner side (content.md K06): Calendly's links, self-hosted.
// A page of its own at /app/calendar/booking, reached from the calendars
// popover. The pages sit as rows in one card; editing one is a form beside a
// live preview of what the person booking will see, a chunk of its own
// (bookingEditor.tsx) fetched as the pointer or the focus reaches the list.

import * as React from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { ArrowLeft, Check, ChevronLeft, Copy, ExternalLink, Link2, Plus, Trash2 } from "@/lib/icons"
import { cn } from "@/lib/utils/helpers/cn"
import { RESOURCE_ROW, ResourceListEmpty, ResourceListSkeleton } from "@/components/dialog/resourceListParts"
import { lazyView } from "@/lib/lazy/lazyView"
import { useFetch } from "@/hooks/useFetch"
import { usePost } from "@/hooks/usePost"
import { useToast } from "@/hooks/use-toast"
import { useConfirm } from "@/hooks/useConfirm"
import { CalendarGet, CalendarPost } from "@/services/endpoints/calendar"
import { bookingPageUrl } from "@/services/bookingService"
import type { WorkingHours } from "@/lib/calendar/availability"

export interface BookingPage {
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
  /** Its bookings still to come (the server's count; absent from an older one). */
  upcoming_bookings?: number
}

/**
 * What deleting a page is said to do (CAL-BUG-3): its link stops working, and
 * how many upcoming bookings it has. It used to promise "Bookings already made
 * stay on your calendar" while deleting them, and every guest's link with them.
 */
export function deletePageWords(upcoming: number | undefined): string {
  if (upcoming === undefined) return "Its link stops working. Bookings already made stay on your calendar."
  if (upcoming === 0) return "Its link stops working. It has no upcoming bookings."
  // Only what holds everywhere: some servers keep a page with bookings to come
  // (they answer 409, "Switch it off instead"), so what happens to them is
  // the answer's to say, in the dialog or the toast after.
  return `Its link stops working. It has ${upcoming} upcoming ${upcoming === 1 ? "booking" : "bookings"}.`
}

const Editor = lazyView(() => import("@/components/calendar/bookingEditor"))
/** Starts loading the editor, so it's in by the press. */
const warmEditor = () => void Editor.prefetch()

/** What is open: the list (null), a page, or a new one. */
type Editing = BookingPage | "new" | null

export function BookingSettings() {
  const { data, isLoading, mutate } = useFetch<{ data: BookingPage[] }>(CalendarGet.GetBookingPages)
  const [editing, setEditing] = React.useState<Editing>(null)
  const pages = data?.data ?? []

  return (
    <div className="h-full overflow-y-auto bg-sheet" data-booking-settings="">
      <div className="mx-auto w-full max-w-[960px] px-4 pb-16 pt-6 sm:px-8">
        {/* One left edge for the title, its line, the card and New booking page
            (PTC-52): on a computer the back arrow sits in the gutter. */}
        <div className="flex items-center gap-2 pb-1 sm:-ml-9" data-booking-header="">
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
          <h1 className="font-display text-title-2 font-semibold text-ink">{editing ? (editing === "new" ? "New booking page" : editing.title || "Booking page") : "Booking pages"}</h1>
        </div>
        <p className="pb-6 pl-9 text-ui text-ink-2 sm:pl-0">
          {editing ? "People outside your workspace pick a time you're free. It lands on your calendar." : "Share a link and let people book time with you, without the back-and-forth."}
        </p>
        {editing ? (
          <Editor.View
            fallback={<Skeleton aria-busy="true" aria-label="Opening the editor" className="h-[540px] rounded-[16px]" />}
            render={(m) => (
              <m.BookingEditor
                page={editing === "new" ? null : editing}
                onCancel={() => setEditing(null)}
                onSaved={async () => {
                  await mutate()
                  setEditing(null)
                }}
              />
            )}
          />
        ) : (
          <PageList pages={pages} loading={isLoading} onEdit={setEditing} onChanged={() => void mutate()} />
        )}
      </div>
    </div>
  )
}

function PageList({ pages, loading, onEdit, onChanged }: { pages: BookingPage[]; loading: boolean; onEdit: (p: BookingPage | "new") => void; onChanged: () => void }) {
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
      toast({ title: "Couldn't copy", description: bookingPageUrl(slug), tone: "error" })
    }
  }
  const remove = (p: BookingPage) =>
    confirm({
      title: `Delete the booking page “${p.title}”?`,
      description: deletePageWords(p.upcoming_bookings),
      confirmText: "Delete booking page",
      destructive: true,
      // A refusal (a server that keeps pages with bookings to come) is said in
      // the dialog, in the server's words, and the page stays.
      onConfirm: async () => {
        const res = await makeRequest<{ id: string }, { upcoming_bookings?: number }>({ apiEndpoint: CalendarPost.DeleteBookingPage, payload: { id: p.id! }, quiet: true })
        const left = typeof res?.upcoming_bookings === "number" ? res.upcoming_bookings : p.upcoming_bookings
        toast({
          title: `Deleted “${p.title}”`,
          description: left ? `${left} upcoming ${left === 1 ? "booking stays" : "bookings stay"} on your calendar.` : "Its link no longer works.",
        })
        onChanged()
      },
    })

  return (
    <div className="grid gap-4" onPointerEnter={warmEditor} onFocus={warmEditor}>
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
              <li key={p.id} className={RESOURCE_ROW} data-touch-group="">
                <span aria-hidden="true" className={cn("flex size-8 shrink-0 items-center justify-center rounded-lg", p.active ? "bg-brand-muted text-brand-text" : "bg-sunken text-ink-3")}>
                  <Link2 className="size-4" />
                </span>
                <button type="button" onClick={() => onEdit(p)} className="min-w-0 flex-1 rounded-sm text-left">
                  <span className="block truncate text-ui font-medium text-ink">
                    {p.title}
                    {!p.active && <span className="ml-2 text-meta font-normal text-ink-3">Paused</span>}
                  </span>
                  <span className="block truncate text-meta text-ink-3">
                    {p.duration_minutes} min · /book/{p.slug}
                    {p.upcoming_bookings ? ` · ${p.upcoming_bookings} upcoming` : ""}
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
      <Button onClick={() => onEdit("new")} className="justify-self-start">
        <Plus /> New booking page
      </Button>
    </div>
  )
}
