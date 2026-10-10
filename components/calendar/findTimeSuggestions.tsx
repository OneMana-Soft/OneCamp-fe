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

interface FindTimeResult {
  slots: Slot[]
  busy: Record<string, Slot[]>
}

export function FindTimeSuggestions({
  participants,
  durationMinutes,
  onPick,
}: {
  participants: string[]
  durationMinutes: number
  onPick: (start: Date, end: Date) => void
}) {
  const { makeRequest, isSubmitting } = usePost()
  const [slots, setSlots] = React.useState<Slot[] | null>(null)
  const tz = browserTZ()

  // A change of people or length makes old suggestions wrong.
  const key = `${participants.join(",")}|${durationMinutes}`
  React.useEffect(() => setSlots(null), [key])

  const find = async () => {
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
  }

  return (
    // A step of the form, not a box in it: it was a dashed card inside the
    // dialog's frame.
    <div className="grid gap-2" data-find-time="">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          {participants.length > 0 ? "Times everyone is free this week, 9 to 5 your time." : "Times you're free this week, 9 to 5."}
        </p>
        <Button type="button" variant="secondary" size="sm" className="h-7 gap-1.5" onClick={find} disabled={isSubmitting}>
          {isSubmitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
          Find a time
        </Button>
      </div>
      {slots && slots.length === 0 && <p className="text-sm text-muted-foreground">No shared free time this week. Try a shorter meeting.</p>}
      {slots && slots.length > 0 && (
        <div className="grid max-h-48 gap-2 overflow-y-auto">
          {groupByDay(slots, tz).map((d) => (
            // The day in a column of its own, so a second line of times starts
            // under the first time, not under the day's name.
            <div key={d.day} className="grid grid-cols-[5.5rem_minmax(0,1fr)] items-start gap-2">
              <span className="pt-1 text-xs font-medium tabular-nums">{formatDay(d.day)}</span>
              <div className="flex flex-wrap gap-1.5">
                {d.slots.map((s) => (
                  <button
                    key={s.start}
                    type="button"
                    onClick={() => onPick(new Date(s.start), new Date(s.end))}
                    className="extend-touch-target h-7 rounded-md border px-2.5 text-xs tabular-nums transition-colors hover:border-primary hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {formatTime(s.start, tz)}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
