"use client"

// Find a time: the first slots everyone in the event is free, inside working
// hours, from OneCamp and Google calendars. Only busy times are compared;
// nobody's event titles leave the server. Picking one fills in the event.

import * as React from "react"
import { Button } from "@/components/ui/button"
import { Loader2, Sparkles } from "@/lib/icons"
import { usePost } from "@/hooks/usePost"
import { PostEndpointUrl } from "@/services/endPoints"
import { defaultHours, formatDay, formatTime, groupByDay, type Slot } from "@/lib/calendar/availability"
import { browserTZ } from "@/lib/utils/timeZone"
import { cn } from "@/lib/utils/helpers/cn"

interface FindTimeResult {
  slots: Slot[]
  busy: Record<string, Slot[]>
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
  const [slots, setSlots] = React.useState<Slot[] | null>(null)
  const tz = browserTZ()

  const find = React.useCallback(async () => {
    const from = new Date()
    const to = new Date(from.getTime() + 7 * 24 * 3600 * 1000)
    const res = await makeRequest<object, FindTimeResult>({
      apiEndpoint: PostEndpointUrl.FindTime,
      payload: {
        participants,
        duration_minutes: Math.min(480, Math.max(15, durationMinutes)),
        from: from.toISOString(),
        to: to.toISOString(),
        hours: defaultHours(tz),
      },
      showErrorToast: true,
    })
    if (res) setSlots(res.slots)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the key below names what matters
  }, [participants.join(","), durationMinutes, tz])

  // A change of people or length makes old suggestions wrong; with guests, look again.
  const key = `${participants.join(",")}|${durationMinutes}`
  React.useEffect(() => {
    setSlots(null)
    if (participants.length === 0) return
    const t = setTimeout(() => void find(), 400)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  const chosen = selected?.getTime()

  return (
    <div className="grid gap-2" data-find-time="">
      <div className="flex h-8 items-center justify-between gap-2">
        <p className="text-meta text-ink-3">
          {participants.length > 0 ? "When everyone is free this week, 9 to 5 your time." : "When you're free this week, 9 to 5."}
        </p>
        <Button type="button" variant="ghost" size="xs" onClick={() => void find()} disabled={isSubmitting} aria-busy={isSubmitting || undefined}>
          {isSubmitting ? <Loader2 className="animate-spin" /> : <Sparkles />}
          Find a time
        </Button>
      </div>
      {slots && slots.length === 0 && <p className="text-ui-sm text-ink-2">No shared free time this week. Try a shorter meeting.</p>}
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
                  return (
                    <button
                      key={s.start}
                      type="button"
                      aria-pressed={on}
                      onClick={() => onPick(new Date(s.start), new Date(s.end))}
                      data-touch-target=""
                      className={cn(
                        "h-7 rounded-md px-2 text-meta font-medium tabular-nums outline-none transition-shadow focus-visible:ring-2 focus-visible:ring-brand",
                        on ? "bg-brand-muted text-brand-text ring-1 ring-inset ring-brand" : "bg-raised text-ink shadow-e1 hover:shadow-e2",
                      )}
                    >
                      {formatTime(s.start, tz)}
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
