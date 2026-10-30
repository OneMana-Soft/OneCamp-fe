/**
 * Calendars read from an address (calendar B8): public holidays, a team's
 * calendar in another tool, a secret link someone was given. The server
 * reads the address once before it adds the calendar (one that isn't a
 * calendar says why, and nothing is made), then every 15 minutes, or now.
 * Its events show with yours and change only where it is published. The
 * address is never given back: only its host.
 */

import { useEffect, useMemo, useRef } from "react"
import { useFetch } from "@/hooks/useFetch"
import axiosInstance, { OWN_ERRORS } from "@/lib/axiosInstance"
import { relativeTime } from "@/lib/utils/relativeTime"

export interface Subscription {
  calendar_id: string
  name: string
  /** Where it is read from, the address's host alone. */
  host: string
  /** When it was last read, or tried; error, why it couldn't be. */
  read_at?: string
  error?: string
  /** Its first read is still bringing its events in. */
  reading?: boolean
  /** How many events its file holds, when it has just been added. */
  events?: number
}

export const subscriptionsUrl = "/calendar/subscriptions"

const NONE: Subscription[] = []

/**
 * The person's subscribed calendars, by calendar, and how each was last
 * read: asked for only while they have one (on). While one's first read is
 * still bringing events in, they are asked for again every two seconds;
 * when it is done, onRead (the calendar reads the events that came).
 */
export function useSubscriptions(on: boolean, onRead?: () => void) {
  const first = useRef<boolean | null>(null)
  const res = useFetch<{ data?: Subscription[] }>(on ? subscriptionsUrl : "", undefined, { refreshInterval: (latest?: { data?: Subscription[] }) => (latest?.data?.some((s: Subscription) => s.reading) ? 2000 : 0) }, OWN_ERRORS)
  const list = Array.isArray(res.data?.data) ? res.data.data : NONE
  const reading = list.some((s) => s.reading)
  useEffect(() => {
    if (first.current && !reading) onRead?.()
    first.current = reading
  }, [reading, onRead])
  const byCalendar = useMemo(() => new Map(list.map((s) => [s.calendar_id, s])), [list])
  return { list, byCalendar, refresh: () => void res.mutate() }
}

/** What a subscribed calendar's menu says of it: "Bringing its events in", "Read from calendar.example · 5m ago", or why it couldn't be. Pure. */
export function subscriptionWords(s: Subscription | undefined, now: number = Date.now()): string {
  if (!s) return ""
  if (s.error) return s.error
  if (s.reading) return "Bringing its events in"
  const when = s.read_at ? relativeTime(s.read_at, now) : ""
  return [`Read from ${s.host}`, when].filter(Boolean).join(" · ")
}

/** Adds a calendar read from an address, named and coloured, or says why not. */
export async function subscribe(address: string, name = "", hue = ""): Promise<Subscription> {
  const res = await axiosInstance.post(subscriptionsUrl, { address, name, hue }, OWN_ERRORS)
  return res.data.data as Subscription
}

/** Reads a subscribed calendar now (at most once a minute) and says how it stands. */
export async function refreshSubscription(calendarId: string): Promise<Subscription> {
  const res = await axiosInstance.post(`${subscriptionsUrl}/${encodeURIComponent(calendarId)}/refresh`, {}, OWN_ERRORS)
  return res.data.data as Subscription
}

/** Removes a subscribed calendar and everything on it. */
export async function unsubscribe(calendarId: string): Promise<void> {
  await axiosInstance.delete(`${subscriptionsUrl}/${encodeURIComponent(calendarId)}`, OWN_ERRORS)
}

/** An address as someone might paste it: https, http or webcal, with a host. Pure. */
export function looksLikeAddress(raw: string): boolean {
  const s = raw.trim()
  if (!/^(https?|webcal):\/\//i.test(s)) return false
  try {
    return !!new URL(s.replace(/^webcal:/i, "https:")).hostname
  } catch {
    return false
  }
}

const holidays = (id: string) => `https://calendar.google.com/calendar/ical/${id}%23holiday%40group.v.calendar.google.com/public/basic.ics`

/**
 * Public holidays by country: the calendars Google publishes, read by their
 * addresses like any other (each names itself "Holidays in …"). India first,
 * then the rest by name.
 */
export const HOLIDAY_CALENDARS: { country: string; address: string }[] = [
  { country: "India", address: holidays("en.indian") },
  ...(
    [
      ["Australia", "en.australian"],
      ["Bangladesh", "en.bd"],
      ["Brazil", "en.brazilian"],
      ["Canada", "en.canadian"],
      ["China", "en.china"],
      ["France", "en.french"],
      ["Germany", "en.german"],
      ["Hong Kong", "en.hong_kong"],
      ["Indonesia", "en.indonesian"],
      ["Ireland", "en.irish"],
      ["Italy", "en.italian"],
      ["Japan", "en.japanese"],
      ["Malaysia", "en.malaysia"],
      ["Mexico", "en.mexican"],
      ["Netherlands", "en.dutch"],
      ["New Zealand", "en.new_zealand"],
      ["Pakistan", "en.pk"],
      ["Philippines", "en.philippines"],
      ["Saudi Arabia", "en.saudiarabian"],
      ["Singapore", "en.singapore"],
      ["South Africa", "en.sa"],
      ["South Korea", "en.south_korea"],
      ["Spain", "en.spain"],
      ["Sri Lanka", "en.lk"],
      ["United Arab Emirates", "en.ae"],
      ["United Kingdom", "en.uk"],
      ["United States", "en.usa"],
    ] as const
  ).map(([country, id]) => ({ country, address: holidays(id) })),
]
