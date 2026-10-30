"use client"

// Find a time: the times everyone in the event is free, each person in their
// own working hours and zone (calendar A3), from OneCamp and Google calendars;
// with too few, the times most can meet, each saying who can't and why. Only
// busy times are compared; nobody's event titles leave the server. Picking
// one fills in the event.

import * as React from "react"
import { Button } from "@/components/ui/button"
import { AlertTriangle, EyeOff, Sparkles } from "@/lib/icons"
import { usePost } from "@/hooks/usePost"
import { CalendarPost } from "@/services/endpoints/calendar"
import { defaultHours, formatDay, formatTime, groupByDay, type Slot } from "@/lib/calendar/availability"
import { browserTZ } from "@/lib/utils/timeZone"
import { cn } from "@/lib/utils/helpers/cn"

/** A time the server offers, who is free then, and why it's offered, in words. */
interface Suggestion extends Slot {
  free: string[]
  away?: string[]
  reason: string
}
interface Ranked {
  suggestions: Suggestion[]
  /** Whose Google calendar the server couldn't read: the times count only what it could, so they may clash there. */
  unread?: string[]
  /** Whose busy times the workspace keeps to themselves: the times don't count them at all. */
  private?: string[]
}

/** The people whose busy times aren't in the times, in the calendar's words (F2): missing, never free. */
const unreadWords = (n: number) =>
  `Couldn't load ${n === 1 ? "one person's Google calendar" : `${n} people's Google calendars`}, so their busy times aren't shown.`

const PRIVATE_WORDS = "Your workspace keeps when people are busy private, so these times count only yours."

/**
 * A line under the strip about whose times it doesn't count: a warning in the
 * strip's own ink, an explanation in the quieter ink of the line it explains.
 */
function SlotsNote({ icon: Icon, tone, ink, children }: { icon: typeof AlertTriangle; tone: string; ink: string; children: React.ReactNode }) {
  return (
    <p role="status" className={cn("flex items-start gap-1.5 text-ui-sm", ink)}>
      <Icon className={cn("mt-0.5 size-3.5 shrink-0", tone)} aria-hidden="true" />
      {children}
    </p>
  )
}

/** What the strip's times are: everyone's, or only yours when the workspace keeps the others' busy times private. */
function slotsLine(guests: number, kept: number): string {
  if (guests === 0 || kept > 0) return "When you're free this week, in your working hours."
  return "When everyone is free this week, in each person's working hours."
}

/**
 * The free times as a strip (content.md C15): each day a small column, its
 * times as chips beside the dialog's When rows. It looks again on its own
 * when the guests or the length change, and the chosen time is ringed.
 */
export function FindTimeSuggestions({
  participants,
  durationMinutes,
  onPick,
  selected,
}: {
  participants: string[]
  durationMinutes: number
  onPick: (start: Date, end: Date) => void
  /** The event's start as it stands, so the chip it matches is ringed. */
  selected?: Date
}) {
  const { makeRequest, isSubmitting } = usePost()
  const [slots, setSlots] = React.useState<Suggestion[] | null>(null)
  const [unread, setUnread] = React.useState(0)
  const [kept, setKept] = React.useState(0)
  const tz = browserTZ()

  const find = React.useCallback(async () => {
    const from = new Date()
    const to = new Date(from.getTime() + 7 * 24 * 3600 * 1000)
    const res = await makeRequest<object, Ranked>({
      apiEndpoint: CalendarPost.SuggestTimes,
      payload: {
        participants,
        duration_minutes: Math.min(480, Math.max(15, durationMinutes)),
        from: from.toISOString(),
        to: to.toISOString(),
        hours: defaultHours(tz),
      },
      showErrorToast: true,
    })
    if (res) {
      setSlots(res.suggestions)
      setUnread(res.unread?.length ?? 0)
      setKept(res.private?.length ?? 0)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the key below names what matters
  }, [participants.join(","), durationMinutes, tz])

  // A change of people or length makes old suggestions wrong; with guests, look again.
  const key = `${participants.join(",")}|${durationMinutes}`
  React.useEffect(() => {
    setSlots(null)
    setUnread(0)
    setKept(0)
    if (participants.length === 0) return
    const t = setTimeout(() => void find(), 400)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  const chosen = selected?.getTime()

  return (
    <div className="grid gap-2" data-find-time="">
      <div className="flex h-8 items-center justify-between gap-2">
        <p className="text-meta text-ink-3">{slotsLine(participants.length, kept)}</p>
        <Button type="button" variant="ghost" size="xs" onClick={() => void find()} busy={isSubmitting}>
          <Sparkles />
          Find a time
        </Button>
      </div>
      {slots && kept > 0 && (
        <SlotsNote icon={EyeOff} tone="text-ink-3" ink="text-ink-3">
          {PRIVATE_WORDS}
        </SlotsNote>
      )}
      {slots && unread > 0 && (
        <SlotsNote icon={AlertTriangle} tone="text-camp-sun" ink="text-ink-2">
          {unreadWords(unread)}
        </SlotsNote>
      )}
      {slots && slots.length === 0 && <p className="text-ui-sm text-ink-2">No shared free time this week. Try a shorter meeting.</p>}
      {slots && slots.length > 0 && slots.every((s) => s.away?.length) && (
        <p className="text-meta text-ink-3">Nobody&apos;s free together this week. These times suit most of them.</p>
      )}
      {slots && slots.length > 0 && (
        // The strip scrolls sideways: an edge with more past it fades, so a
        // cut chip reads as "more this way" rather than as broken, and it
        // rests on a whole day (data-edge-fade, every strip's one behaviour).
        <div className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-1" data-find-time-strip="" data-edge-fade="">
          {groupByDay(slots, tz).map((d) => (
            <div key={d.day} className="flex shrink-0 flex-col gap-1">
              <span className="text-micro font-medium tabular-nums text-ink-3">{formatDay(d.day)}</span>
              <div className="flex gap-1">
                {d.slots.slice(0, 4).map((s) => {
                  const on = chosen === new Date(s.start).getTime()
                  const most = !!s.away?.length
                  return (
                    <button
                      key={s.start}
                      type="button"
                      aria-pressed={on}
                      aria-label={`${formatTime(s.start, tz)}, ${s.reason}`}
                      title={s.reason}
                      data-partial={most || undefined}
                      onClick={() => onPick(new Date(s.start), new Date(s.end))}
                      data-touch-target=""
                      className={cn(
                        "h-7 rounded-md px-2 text-meta font-medium tabular-nums outline-none transition-shadow focus-visible:ring-2 focus-visible:ring-brand",
                        on ? "bg-brand-muted text-brand-text ring-1 ring-inset ring-brand" : most ? "bg-transparent text-ink-2 ring-1 ring-inset ring-line-2 hover:bg-hover" : "bg-raised text-ink shadow-e1 hover:shadow-e2",
                      )}
                    >
                      {formatTime(s.start, tz)}
                      {most ? <span className="ml-1 text-meta font-normal text-ink-3">{s.free.length} of {s.free.length + (s.away?.length ?? 0)}</span> : null}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
