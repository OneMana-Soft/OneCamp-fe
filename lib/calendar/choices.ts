import { useSyncExternalStore } from "react"
import type { Day } from "date-fns"
import { isCampHue, type CampHue } from "@/lib/campHue"
import { parseSpan, type CalendarSpan } from "@/lib/calendar/route"
import { WEEK_STARTS_ON } from "@/lib/utils/date/days"

/**
 * The calendar's choices on this device (calendars shown and their colours,
 * teammates laid over, the views' layout): one store, kept in storage and
 * shared with other tabs, for the calendar, its panel and a phone's options.
 */

/** A teammate laid over your calendar: their calendar's id and their name. */
export interface Overlay {
  id: string
  name: string
}

/** How the views are laid out (lib/calendar/viewRange), until A3a's Person Preferences hold it. */
export interface ViewChoices {
  /** The custom view's length. */
  span: CalendarSpan
  /** The hour's height: comfortable, compact, or the working day filling the screen. */
  density: "comfortable" | "compact" | "fit"
  weekends: boolean
  weekNumbers: boolean
  weekStartsOn: Day
}
const VIEW: ViewChoices = { span: "4d", density: "comfortable", weekends: true, weekNumbers: false, weekStartsOn: WEEK_STARTS_ON }

/** What someone chose about their calendars on this device. */
export interface CalendarChoices {
  hidden: string[]
  people: Overlay[]
  /** A colour of their own for a calendar, by its id. */
  hues: Record<string, CampHue>
  view: ViewChoices
}

const KEYS: Record<keyof CalendarChoices, string> = { hidden: "onecamp:calendars-hidden", people: "onecamp:calendar-people", hues: "onecamp:calendar-hues", view: "onecamp:calendar-view" }
const NONE: CalendarChoices = { hidden: [], people: [], hues: {}, view: VIEW }

const isOverlay = (x: unknown): x is Overlay => !!x && typeof (x as Overlay).id === "string" && typeof (x as Overlay).name === "string"

function stored(key: string): unknown {
  try {
    return JSON.parse(window.localStorage.getItem(key) || "null")
  } catch {
    return null
  }
}

/** The choices kept, read from storage once a page; anything unreadable there is left out. */
function read(): CalendarChoices {
  const hidden = stored(KEYS.hidden)
  const people = stored(KEYS.people)
  const hues = stored(KEYS.hues)
  const v = Object(stored(KEYS.view))
  const { density: d, weekStartsOn: w } = v
  return {
    hidden: Array.isArray(hidden) ? hidden.filter((x): x is string => typeof x === "string") : [],
    people: Array.isArray(people) ? people.filter(isOverlay) : [],
    hues: hues && typeof hues === "object" ? (Object.fromEntries(Object.entries(hues).filter(([, h]) => isCampHue(h))) as Record<string, CampHue>) : {},
    view: {
      span: parseSpan(v.span) ?? VIEW.span,
      density: d === "compact" || d === "fit" ? d : VIEW.density,
      weekends: v.weekends !== false,
      weekNumbers: v.weekNumbers === true,
      weekStartsOn: w === 0 || w === 6 ? w : VIEW.weekStartsOn,
    },
  }
}

let kept: CalendarChoices | null = null
const listeners = new Set<() => void>()
const choices = () => (kept ??= read())

/** Changes the choices, keeps them, and redraws whatever shows them. */
export function choose(change: (c: CalendarChoices) => Partial<CalendarChoices>) {
  const was = choices()
  const next = { ...was, ...change(was) }
  for (const k of Object.keys(KEYS) as (keyof CalendarChoices)[]) {
    if (next[k] === was[k]) continue
    try {
      window.localStorage.setItem(KEYS[k], JSON.stringify(next[k]))
    } catch {
      // Storage blocked: kept for this visit only.
    }
  }
  kept = next
  listeners.forEach((l) => l())
}

function subscribe(l: () => void) {
  listeners.add(l)
  // Another tab's choice is this one's too.
  const onStorage = (e: StorageEvent) => {
    if (e.key && Object.values(KEYS).includes(e.key)) {
      kept = null
      l()
    }
  }
  window.addEventListener("storage", onStorage)
  return () => {
    listeners.delete(l)
    window.removeEventListener("storage", onStorage)
  }
}

/** The choices, and a redraw when they change, wherever they change. */
export function useCalendarChoices(): CalendarChoices {
  return useSyncExternalStore(subscribe, choices, () => NONE)
}
