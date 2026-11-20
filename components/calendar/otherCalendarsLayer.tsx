"use client"

/**
 * Other calendars' reads (calendar A6), as a chunk of their own: the
 * calendar's first screen carries none of it. The layer draws nothing, and
 * hands the calendar what it read (useOtherCalendars) each time that changes;
 * OthersFailedRow says when that read failed.
 */

import { useEffect, useMemo } from "react"
import { LoadFailedRow } from "@/components/ui/load-failed-row"
import { tellShownCount, useOtherCalendars } from "@/lib/calendar/otherCalendars"

export type OtherCalendarsState = ReturnType<typeof useOtherCalendars>

export default function OtherCalendarsLayer({
  from,
  to,
  own,
  onChange,
  weekCount,
}: {
  from: Date
  to: Date
  /** The person's own events, as the calendar read them. */
  own?: { event_uuid: string }[]
  onChange: (o: OtherCalendarsState) => void
  /** The calendar's count of the shown week's entries that pass. */
  weekCount?: (pass: (it: { event_calendar_id?: string }) => boolean) => number
}) {
  // By what they hold: the same events read again are the same ids, so the calendar isn't told again.
  const ownKey = (own ?? []).map((e) => e.event_uuid).join(" ")
  const ownIds = useMemo(() => new Set(ownKey.split(" ").filter(Boolean)), [ownKey])
  const others = useOtherCalendars(from, to, ownIds)
  const { events, error, mine, calendars, people, hidden, hues, dress, only, byId } = others
  // A project's, a channel's or a team's calendar opened from where it lives (gcal-14, ?calendar=): that
  // calendar alone (basecamp-05), the others a tick away in the panel. Once the list names it, so the
  // calendars the list brings are there to hide.
  useEffect(() => {
    const here = new URL(window.location.href)
    const cal = here.searchParams.get("calendar")
    if (!cal || !byId.has(cal)) return
    only(cal)
    here.searchParams.delete("calendar")
    window.history.replaceState(window.history.state, "", here.pathname + here.search)
  }, [only, byId])
  // Each calendar's count this week, for its row in the panel and in the phone's options (gcal-14).
  useEffect(() => tellShownCount(weekCount && { countOf: (id) => weekCount((i) => i.event_calendar_id === id), failed: !!error }), [weekCount, error])
  useEffect(() => () => tellShownCount(), [])
  useEffect(() => {
    onChange(others)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the calendar redraws when what it shows changes, not on every render here (others is new each time)
  }, [events, error, mine, calendars, people, hidden, hues, dress, onChange])
  return null
}

/**
 * The calendars beside yours couldn't be read (AUDIT-WEB F2): one row above
 * the grid, which stays yours and live. Their times are missing, not free.
 */
export function OthersFailedRow(props: { shown: boolean; retrying?: boolean; onRetry: () => void }) {
  return <LoadFailedRow {...props}>Couldn&apos;t load the calendars beside yours, so their busy times aren&apos;t shown.</LoadFailedRow>
}
