import type { CalendarEventInterface } from "@/types/calendar"

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

/** An event's call link, or null. Pure. */
export function joinLinkOf(event: Pick<CalendarEventInterface, "event_description">): string | null {
  return callLinkOf(event.event_description) ?? null
}

/** Join's weight: primary from ten minutes before until the end, quiet before, none once ended. Pure. */
export function joinOffer(link: string | null | undefined, start: Date, end: Date, now: Date): "primary" | "secondary" | null {
  if (!link || now >= end) return null
  return start.getTime() - now.getTime() <= 10 * 60_000 ? "primary" : "secondary"
}
