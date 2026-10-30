"use client"

/**
 * Today's events, for Home's agenda (H12), its summary's "Next" (H4) and the
 * greeting's orbit (H3). One request, shared by all three through SWR, and the
 * same one the calendar makes for its range. It refreshes on the minute.
 */
import { useEffect, useMemo, useState } from "react"

import { useFetch } from "@/hooks/useFetch"
import { GetEndpointUrl } from "@/services/endPoints"
import type { CalendarEventInterface, GetEventsResponse } from "@/types/calendar"
import { classifyEvent, isAllDay, todayRange } from "@/components/home/homeTime"
import { placeAllByDates } from "@/lib/calendar/allDay"

/** The current time, ticking each minute on the minute. */
export function useMinute(): Date {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    let interval: number | undefined
    const first = window.setTimeout(() => {
      setNow(new Date())
      interval = window.setInterval(() => setNow(new Date()), 60_000)
    }, 60_000 - (Date.now() % 60_000))
    return () => {
      window.clearTimeout(first)
      if (interval) window.clearInterval(interval)
    }
  }, [])
  return now
}

export function useTodayEvents() {
  const now = useMinute()
  const [day] = useState(() => todayRange(new Date()))
  const res = useFetch<GetEventsResponse>(
    `${GetEndpointUrl.GoogleCalendarEvents}?startDate=${day.start.toISOString()}&endDate=${day.end.toISOString()}`,
    undefined,
    { refreshInterval: 60_000 },
  )
  const events = useMemo<CalendarEventInterface[]>(
    () =>
      // A Google all-day event by its dates (CAL-BUG-2): read as instants it
      // sat on two days, and from 17:30 to 17:30 in India.
      placeAllByDates(Array.isArray(res.data?.data) ? res.data.data : [])
        .filter((e) => !e.isTask && !e.event_is_away)
        .filter((e) => Date.parse(e.event_end_time) > day.start.getTime() && Date.parse(e.event_start_time) < day.end.getTime())
        .sort((a, b) => Date.parse(a.event_start_time) - Date.parse(b.event_start_time)),
    [res.data, day],
  )
  // The next meeting: an all-day event is on all day, never "next at 00:00".
  const next = useMemo(() => events.find((e) => !isAllDay(e, now) && classifyEvent(e, now) !== "past"), [events, now])
  // A calendar the server does not answer for at all (a 404 on an install
  // without it) hides the section; a passing failure says so in the card.
  const status = (res.isError as { response?: { status?: number } } | undefined)?.response?.status
  const unavailable = status === 404 || status === 501
  return {
    events,
    next,
    now,
    loading: res.isLoading && !res.data,
    error: Boolean(res.isError) && !unavailable,
    unavailable,
    retry: () => void res.mutate(),
    /** The calendar's copy of today's events (the same request): an answer shows in it at once. */
    mutate: res.mutate,
  }
}
