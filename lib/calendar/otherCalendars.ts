/**
 * Calendars beside your own one (calendar A6): those an import or the move
 * from Google made you, each project's you're on, calendars shared with
 * you, and teammates you lay over yours (busy unless they share more).
 * Which are shown, which teammates are laid over and a colour of your own
 * for any of them are kept on this device, in one memory for the page, so
 * the calendar and a phone's calendar options show and change the same
 * choices. Others' events are read for the month on screen; yours are
 * shown and coloured as their calendar is. Pure but for the reads and the
 * device's memory.
 */

import { useMemo } from "react"
import { useFetch } from "@/hooks/useFetch"
import { useCalendarList, type CalendarView } from "@/lib/calendar/calendarList"
import axiosInstance, { OWN_ERRORS } from "@/lib/axiosInstance"
import { projectHue } from "@/lib/projectHue"
import { isCampHue, type CampHue } from "@/lib/campHue"
import { listOf } from "@/lib/utils/listOf"
import type { CalendarEventInterface } from "@/types/calendar"
import { OWN_HUE, otherHue } from "@/components/calendar/calendarTones"

export type { CalendarView }

/** An event as the calendar's own API sends it, as much as is drawn here. */
interface OtherEvent {
  id: string
  calendar_id: string
  title: string
  notes?: string
  location?: string
  start: { at?: string; date?: string }
  end: { at?: string; date?: string }
  all_day: boolean
  hue?: string
  kind?: string
}

// The choices kept on this device: one store, which the calendar, its panel
// and a phone's calendar options read and change (lib/calendar/choices).
import { choose, useCalendarChoices, type CalendarChoices, type Overlay } from "@/lib/calendar/choices"
export { choose, useCalendarChoices }
export type { CalendarChoices, Overlay }

/**
 * Your own rows' ids among the choices: your calendar's events, Google's,
 * and the tasks assigned to you. The panel and a phone's calendar options
 * show and hide them as they do every other calendar.
 */
export const OWN_ROWS = ["onecamp", "google", "tasks"] as const

/** No events: one list, so a calendar with none isn't told of a new none on every read. */
const NO_EVENTS: CalendarEventInterface[] = []

/**
 * A calendar's colour, the one way the Calendars panel, the week and an
 * import's result draw it: the one you chose here, else your own calendar's
 * (sun), a project's own, or its own or one from its id that isn't sun. Pure.
 */
export function calendarHue(
  cal: Pick<CalendarView, "id"> & Partial<Pick<CalendarView, "hue" | "kind" | "mine" | "container_kind" | "container_id">>,
  hues: Record<string, CampHue>,
): CampHue {
  if (hues[cal.id]) return hues[cal.id]
  if (cal.kind === "personal" && cal.mine) return OWN_HUE
  if (cal.container_kind === "project" && cal.container_id) return projectHue(cal.container_id)
  return otherHue(cal.id, cal.hue)
}

/** An event of another calendar as the grid draws events: its own colour, else its calendar's. Pure. */
export function asGridEvent(e: OtherEvent, cal: CalendarView | undefined, hues: Record<string, CampHue> = {}): CalendarEventInterface {
  return {
    event_uuid: e.id,
    event_calendar_id: e.calendar_id,
    event_title: e.title,
    event_description: e.notes,
    event_location: e.location,
    event_start_time: e.start.at ?? `${e.start.date}T00:00:00Z`,
    event_end_time: e.end.at ?? `${e.end.date}T00:00:00Z`,
    event_all_day: e.all_day,
    event_start_date: e.start.date,
    event_end_date: e.end.date,
    event_hue: e.hue,
    calendar_hue: cal ? calendarHue(cal, hues) : undefined,
    calendar_name: cal?.name,
    event_is_focus: e.kind === "focus",
    event_is_away: e.kind === "out_of_office",
  }
}

/**
 * Your own events as their calendars show them: one on a calendar other
 * than your personal one (an import's, a project's) with that calendar,
 * shown or hidden and in its colour; one on yours (or one the calendar
 * doesn't place) as Personal says. Others' events, and Google's own,
 * pass as they are. Pure.
 */
export function dressOwn(
  list: CalendarEventInterface[],
  own: Set<string>,
  showPersonal: boolean,
  byId: Map<string, CalendarView>,
  c: Pick<CalendarChoices, "hidden" | "people" | "hues">,
): CalendarEventInterface[] {
  const out: CalendarEventInterface[] = []
  for (const e of list) {
    if (!own.has(e.event_uuid) || e.event_uuid.startsWith("gcal-")) {
      out.push(e)
      continue
    }
    const cal = e.event_calendar_id ? byId.get(e.event_calendar_id) : undefined
    if (!cal || cal.kind === "personal") {
      if (showPersonal) out.push(e)
    } else if (!c.hidden.includes(cal.id)) {
      out.push({ ...e, calendar_hue: calendarHue(cal, c.hues), calendar_name: cal.name })
    }
  }
  return out
}

/** The id of a member's own calendar, to lay over yours (made the first time it is asked for). */
export async function teammateCalendar(userUUID: string): Promise<string> {
  const res = await axiosInstance.get(`/calendar/people/${encodeURIComponent(userUUID)}/calendar`, OWN_ERRORS)
  return res.data.data.id as string
}

/**
 * The calendars beside the person's own, as their rows list them: theirs
 * an import made (mine), others' (calendars) and teammates laid over
 * (people), which are shown and in what colour, and the choices about
 * them. The Calendars panel and a phone's calendar options both list them.
 */
export function useCalendarRows() {
  const list = useCalendarList()
  const c = useCalendarChoices()
  const { hidden, hues } = c
  const mine = useMemo(() => list.filter((v) => v.mine && v.kind !== "personal"), [list])
  const calendars = useMemo(() => list.filter((v) => !v.mine), [list])
  // A teammate whose calendar is shared with you is listed once, as shared.
  const people = useMemo(() => c.people.filter((p) => !calendars.some((v) => v.id === p.id)), [c.people, calendars])
  // Every calendar named here; a teammate's in a colour of its own.
  const byId = useMemo(
    () => new Map<string, CalendarView>([...list.map((v) => [v.id, v] as const), ...people.map((p) => [p.id, { id: p.id, name: p.name, kind: "person", access: "view" as const }] as const)]),
    [list, people],
  )
  return {
    choices: c,
    byId,
    mine,
    calendars,
    people,
    hidden,
    hues,
    hueOf: (v: CalendarView) => calendarHue(v, hues),
    toggle: (id: string) => choose((k) => ({ hidden: k.hidden.includes(id) ? k.hidden.filter((h) => h !== id) : [...k.hidden, id] })),
    /** Shows these calendars again (an import's, when Show them is pressed). */
    show: (ids: string[]) => choose((k) => ({ hidden: k.hidden.filter((h) => !ids.includes(h)) })),
    /** Shows only this calendar (one of yours too): every other, your own rows included, is hidden. */
    only: (id?: string) => choose(() => ({ hidden: [...OWN_ROWS, ...[...mine, ...calendars, ...people].map((v) => v.id)].filter((v) => v !== id) })),
    /** A colour of your own for a calendar on this device, or ("") its own again. */
    recolour: (id: string, hue: CampHue | "") =>
      choose((k) => {
        const next = { ...k.hues }
        if (hue) next[id] = hue
        else delete next[id]
        return { hues: next }
      }),
    // At most twenty teammates at once (PROGRAM.md A6's risk).
    addPerson: (o: Overlay) => choose((k) => (k.people.some((p) => p.id === o.id) ? {} : { people: [...k.people, o].slice(-20) })),
    removePerson: (calendarId: string) => choose((k) => ({ people: k.people.filter((p) => p.id !== calendarId) })),
  }
}

/**
 * The calendars beside the person's own (useCalendarRows), the events of
 * others' between from and to, without the person's own (already on the
 * grid), and dress, which shows the person's own as their calendars are.
 * A read that failed is its error, never no events: a teammate whose
 * calendar couldn't be read isn't free (AUDIT-WEB F2).
 */
export function useOtherCalendars(from: Date, to: Date, ownIds: Set<string>) {
  const rows = useCalendarRows()
  const { calendars, people, hidden, hues, byId, choices } = rows
  const shown = useMemo(() => [...calendars.map((v) => v.id), ...people.map((p) => p.id)].filter((id) => !hidden.includes(id)), [calendars, people, hidden])
  const query = shown.length ? `/calendar/calendars/events?ids=${shown.join(",")}&from=${from.toISOString()}&to=${to.toISOString()}` : ""
  const evs = useFetch<{ data?: OtherEvent[] }>(query, undefined, { keepPreviousData: true }, OWN_ERRORS)
  const events = useMemo(() => {
    const out = listOf<OtherEvent>(evs.data?.data).filter((e) => !ownIds.has(e.id)).map((e) => asGridEvent(e, byId.get(e.calendar_id), hues))
    return out.length ? out : NO_EVENTS
  }, [evs.data, ownIds, byId, hues])
  const dress = useMemo(() => (own: CalendarEventInterface[], showPersonal: boolean) => dressOwn(own, ownIds, showPersonal, byId, choices), [ownIds, byId, choices])
  return { ...rows, events, dress, ownIds, error: evs.isError, refresh: () => evs.mutate() }
}
