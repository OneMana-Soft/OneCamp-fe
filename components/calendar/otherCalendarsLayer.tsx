"use client"

/**
 * Other calendars' reads (calendar A6), as a chunk of their own: the
 * calendar's first screen carries none of it. The layer draws nothing, and
 * hands the calendar what it read (useOtherCalendars) each time that changes;
 * OthersFailedRow says when that read failed.
 */

import { useEffect, useMemo } from "react"
import { LoadFailedRow } from "@/components/ui/load-failed-row"
import { useOtherCalendars } from "@/lib/calendar/otherCalendars"

export type OtherCalendarsState = ReturnType<typeof useOtherCalendars>

export default function OtherCalendarsLayer({
  from,
  to,
  own,
  onChange,
}: {
  from: Date
  to: Date
  /** The person's own events, as the calendar read them. */
  own?: { event_uuid: string }[]
  onChange: (o: OtherCalendarsState) => void
}) {
  // By what they hold: the same events read again are the same ids, so the calendar isn't told again.
  const ownKey = (own ?? []).map((e) => e.event_uuid).join(" ")
  const ownIds = useMemo(() => new Set(ownKey.split(" ").filter(Boolean)), [ownKey])
  const others = useOtherCalendars(from, to, ownIds)
  const { events, error, mine, calendars, people, hidden, hues, dress } = others
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
