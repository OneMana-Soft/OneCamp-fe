import type { CalendarEventInterface } from "@/types/calendar"
import { roomDoorPath } from "@/lib/calls/roomDoor"

const CALL = /meet|zoom|teams|whereby|call|livekit|jitsi/i

/** The first link in the notes that goes to a call, &amp; read as &: never just any link. Home's too. Pure. */
export function callLinkOf(notes?: string | null): string | undefined {
  if (!notes) return undefined
  for (const m of notes.matchAll(/https?:\/\/[^\s<>"')]+/g)) {
    const url = m[0].replace(/&amp;/g, "&").replace(/[.,;:!?]+$/, "")
    if (CALL.test(url)) return url
  }
  return undefined
}

/** The call link in an event's notes, or null: what a copy of it leaves out. Pure. */
export function joinLinkOf(event: Pick<CalendarEventInterface, "event_description">): string | null {
  return callLinkOf(event.event_description) ?? null
}

/** An event's call as its card, page, agenda and reminder offer it: where to join and what to share. */
export interface EventCallLinks {
  join: string
  share: string
  /** Its own call (calendar B11): joined here in the app, in the same tab. */
  own: boolean
}

/**
 * An event's call: its own (calendar B11), which a member joins in the app as
 * themselves and anyone else at its address, at origin; else the link in its
 * notes, both ways. Null for none. Pure.
 */
export function eventCallOf(event: Pick<CalendarEventInterface, "event_description" | "event_call">, origin: string): EventCallLinks | null {
  const own = event.event_call
  if (own?.slug) return { join: roomDoorPath(own.slug), share: origin + own.address, own: true }
  const link = joinLinkOf(event)
  return link ? { join: link, share: link, own: false } : null
}

/**
 * What an event offers about its own call (calendar B11) to someone who may
 * change it: take its call off, or add one; nothing on Google's copy, and no
 * new call once it has ended or while its notes carry a call link. Pure.
 */
export function eventCallChoice(
  event: Pick<CalendarEventInterface, "event_description" | "event_call">,
  { mayChange, google, ended }: { mayChange: boolean; google: boolean; ended: boolean },
): "add" | "remove" | null {
  if (!mayChange || google) return null
  if (event.event_call) return "remove"
  return ended || joinLinkOf(event) ? null : "add"
}

/** Join's weight: primary from ten minutes before until the end, quiet before, none once ended. Pure. */
export function joinOffer(link: string | null | undefined, start: Date, end: Date, now: Date): "primary" | "secondary" | null {
  if (!link || now >= end) return null
  return start.getTime() - now.getTime() <= 10 * 60_000 ? "primary" : "secondary"
}
