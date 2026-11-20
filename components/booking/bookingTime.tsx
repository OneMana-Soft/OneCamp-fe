// Words for a booked moment in the visitor's zone, and the booking's spot:
// what the booking page and a guest's own booking (/booking/<token>) both
// show, without the booking page's flow.

import type { Ref } from "react"

import type { Slot } from "@/lib/calendar/availability"

import { clockTime, dateTimeFormat } from "@/lib/utils/date/clock"

// ----------------------------------------------------------------------------
// Words for a moment, in the visitor's zone.
// ----------------------------------------------------------------------------

/** "10:30" (24 h) or "10:30 AM", in a zone: the visitor's own choice of clock (the 24-hour switch). */
export function slotTime(iso: string, tz: string, h24: boolean): string {
  return clockTime(iso, { timeZone: tz, hour12: !h24 })
}

/** A kept formatter in a zone (the app's one cache, lib/utils/date/clock): CAL-BUG-20. */
export const formatFor = (locale: string, tz: string, opts: Intl.DateTimeFormatOptions) => dateTimeFormat(locale, { timeZone: tz, ...opts })

export function parts(iso: string, tz: string, opts: Intl.DateTimeFormatOptions) {
  const p = formatFor("en-GB", tz, opts).formatToParts(new Date(iso))
  return (t: Intl.DateTimeFormatPartTypes) => p.find((x) => x.type === t)?.value ?? ""
}

/** "Thu 15 Oct", the day in the button. */
export function shortDay(iso: string, tz: string): string {
  const p = parts(iso, tz, { weekday: "short", day: "numeric", month: "short" })
  return `${p("weekday")} ${p("day")} ${p("month")}`
}

/** "Thursday 15 October". */
export function longDay(iso: string, tz: string): string {
  const p = parts(iso, tz, { weekday: "long", day: "numeric", month: "long" })
  return `${p("weekday")} ${p("day")} ${p("month")}`
}

/** The button's words: "Book Thu 15 Oct, 10:30". */
export function bookLabel(slot: Slot, tz: string, h24: boolean): string {
  return `Book ${shortDay(slot.start, tz)}, ${slotTime(slot.start, tz, h24)}`
}

// Zones as people know them live in lib/utils/zones (the Event Form picks from
// them too); the booking pages read them from here as well.
export { zoneLabel, zoneLabels } from "@/lib/utils/zones"

/**
 * The confirmation's spot (96 px): a calendar sheet that rises, a moss check
 * that springs onto it, the host's and the visitor's dots sliding along a
 * dashed orbit, and a brand spark. Static under reduced motion (the global
 * rule stills the animations).
 */
export function BookingSpot({ checkRef, owner }: { checkRef?: Ref<SVGGElement>; owner?: string }) {
  return (
    <svg viewBox="0 0 96 96" width={96} height={96} aria-hidden="true" data-booking-spot="" className="max-sm:size-20 overflow-visible">
      <circle cx="48" cy="48" r="40" fill="none" stroke="var(--line-2)" strokeDasharray="2 4" />
      <circle cx="48" cy="48" r="30" fill="var(--camp-moss-tint)" />
      <g className="content-slide-in" style={{ animationDelay: "120ms", animationDuration: "400ms" }}>
        <circle cx="8" cy="48" r="5" fill={`var(--camp-${owner ? "sky" : "dusk"}-a2)`} />
        <circle cx="80" cy="25" r="5" fill="var(--camp-berry-a2)" />
      </g>
      <g className="content-rise" style={{ animationDuration: "320ms" }}>
        <rect x="30" y="28" width="36" height="38" rx="6" fill="var(--raised)" style={{ filter: "drop-shadow(0 2px 4px rgb(16 18 26 / .12))" }} />
        <rect x="30" y="28" width="36" height="9" rx="3" fill="var(--camp-sky-a2)" />
        <rect x="36" y="43" width="18" height="3" rx="1.5" fill="var(--line-2)" />
        <rect x="36" y="50" width="12" height="3" rx="1.5" fill="var(--line-2)" />
      </g>
      <g ref={checkRef} className="content-pop-in" style={{ animationDelay: "200ms", transformOrigin: "62px 62px", transformBox: "view-box" }}>
        <circle cx="62" cy="62" r="9" fill="var(--camp-moss-a2)" stroke="var(--sheet)" strokeWidth="2" />
        <path d="M58 62.2l2.8 2.8 5.2-5.4" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </g>
      <path className="content-pop-in" style={{ animationDelay: "320ms", transformOrigin: "74px 15px", transformBox: "view-box" }} d="M74 10Q74.6 14.4 79 15Q74.6 15.6 74 20Q73.4 15.6 69 15Q73.4 14.4 74 10Z" fill="var(--brand)" />
    </svg>
  )
}
