"use client"

/**
 * The events in a stretch of the calendar (calendar programme, PROGRAM.md §4.2
 * #38; A1 builds it: occurrences for a range, cached by month, patched live).
 *
 * DAY 0. Today's read: /event/getEvents for the range, on the key and with the
 * options the calendar asks with today (calendarApp: the month grid around its
 * date, the last answer kept on screen while the next loads, a failure said
 * over the grid rather than in a toast), so the two share one request. Nothing
 * calls it yet; A7 moves the calendar onto it, and A1 replaces the read behind
 * it.
 */

import { useMemo } from 'react'
import { useFetch } from '@/hooks/useFetch'
import { OWN_ERRORS } from '@/lib/axiosInstance'
import { GetEndpointUrl } from '@/services/endPoints'
import type { CalendarEvent, CalendarRange, CalendarRangeState } from '@/lib/calendar/types'
import type { GetEventsResponse } from '@/types/calendar'

const KEEP = { keepPreviousData: true }
const NO_EVENTS: CalendarEvent[] = []

export function useCalendarRange(range: CalendarRange): CalendarRangeState {
  const key = `${GetEndpointUrl.GoogleCalendarEvents}?startDate=${range.start.toISOString()}&endDate=${range.end.toISOString()}`
  const { data, isError, mutate } = useFetch<GetEventsResponse>(key, undefined, KEEP, OWN_ERRORS)
  return useMemo(
    () => ({
      events: data?.data ?? NO_EVENTS,
      status: data ? 'ready' : isError ? 'error' : 'loading',
      retry: () => {
        void mutate()
      },
    }),
    [data, isError, mutate],
  )
}
