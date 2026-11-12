import { isHex } from "@/lib/color/hex"

/**
 * An event's own colour, "#rrggbb" (calendar head B, More colours), as the
 * one variable the hue-own class cuts its theme's solid, tint and ink from in
 * CSS (globals.css; lib/color/ownColour is the same rule in numbers). No maths
 * here, so the grid paints an own colour at once. Null for anything else.
 */
export function ownHueVars(hex: string | null | undefined): Record<string, string> | null {
  return isHex(hex) ? { "--own": hex.toLowerCase() } : null
}

/** An event's own colour as ownHueVars, where the calendar draws one: an event's (kindOf), never Google's, a task's or a block's. */
export function eventOwnHue(kind: string, item: { event_uuid: string; event_hue?: string }): Record<string, string> | null {
  return kind === "event" && !item.event_uuid.startsWith("gcal-") ? ownHueVars(item.event_hue) : null
}
