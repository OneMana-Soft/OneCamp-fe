"use client"

/**
 * An event changed, told live (calendar head A, gcal-5): the backend's
 * MESSAGE_CALENDAR_LIVE carries its id and window alone ({event_id, from,
 * to}), to who may read it. hooks/useMqttMessageHandler raises it as a window
 * event; it loads with every page, so it writes the name itself, without this
 * import, and a test holds the two equal. An open calendar reads again what
 * the change touches: a list over a range it overlaps, or the event itself.
 */
import { useEffect } from "react"
import { appMutate, cachedData } from "@/lib/swrMutate"
import { showsEvent } from "@/lib/calendar/eventCache"
import { seriesIdOf } from "@/lib/calendar/instanceId"

export const CALENDAR_LIVE_EVENT = "onecamp:calendar-live"

/** What a live message says changed. */
export interface CalendarLive {
  event_id: string
  from: number
  to: number
}

/** A live message's data, or null when it isn't one. Pure. */
export function calendarLiveOf(data: unknown): CalendarLive | null {
  const d = data as { event_id?: unknown; from?: unknown; to?: unknown } | null
  if (!d || typeof d.event_id !== "string" || !d.event_id) return null
  const from = Date.parse(String(d.from ?? "")), to = Date.parse(String(d.to ?? ""))
  return { event_id: d.event_id, from: Number.isNaN(from) ? -Infinity : from, to: Number.isNaN(to) ? Infinity : to }
}

// A list's range: its two ends, by the names the lists of events use.
const ENDS = [["startDate", "endDate"], ["from", "to"]]

/**
 * Whether a live change reads a cached answer again: the event itself (as
 * showsEvent says), a list over a range its window meets, or a list whose
 * cached answer holds the event, so a moved event leaves its old place too. Pure.
 */
export function showsLive(key: unknown, c: CalendarLive, cached?: (key: string) => unknown): boolean {
  if (!showsEvent(key, null)) return showsEvent(key, c.event_id)
  const q = new URLSearchParams(String(key).split("?")[1] ?? "")
  const [from, to] = (ENDS.find(([f]) => q.has(f)) ?? []).map((n) => Date.parse(q.get(n) ?? ""))
  if (!(c.to < from || c.from > to)) return true
  const listed = (cached?.(String(key)) as { data?: unknown } | undefined)?.data
  return Array.isArray(listed) && listed.some((e: { event_uuid?: unknown; id?: unknown }) => [e?.event_uuid, e?.id].some((x) => typeof x === "string" && seriesIdOf(x) === c.event_id))
}

/**
 * While mounted, reads again what live changes touch, once for a burst (the
 * messages of the next waitMs go with the first).
 */
export function useCalendarLive(waitMs = 300) {
  useEffect(() => {
    let waiting: CalendarLive[] = []
    let timer: ReturnType<typeof setTimeout> | undefined
    const heard = (e: Event) => {
      const c = calendarLiveOf((e as CustomEvent).detail)
      if (!c) return
      waiting.push(c)
      timer ??= setTimeout(() => {
        const these = waiting
        waiting = []
        timer = undefined
        void appMutate((key) => these.some((c) => showsLive(key, c, cachedData)))
      }, waitMs)
    }
    window.addEventListener(CALENDAR_LIVE_EVENT, heard)
    return () => {
      window.removeEventListener(CALENDAR_LIVE_EVENT, heard)
      if (timer) clearTimeout(timer)
    }
  }, [waitMs])
}
