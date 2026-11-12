import { typedWebURL } from "@/lib/links/webURL"

/**
 * Where an event's place opens (calendar head B, gcal-1a; Google's map link):
 * a place that is a web address (a call link, "meet.example.com/abc") opens
 * itself, and any other place (a room, an address) opens a search for its
 * words on Google Maps, whose search link is free and takes no key. Both open
 * in a new tab. No place, no link. A word with no dot ("Studio") is a place,
 * never a web address. Pure.
 */
export const MAPS_SEARCH = "https://www.google.com/maps/search/?api=1&query="

export interface PlaceLink {
  href: string
  /** It searches a map for the place, rather than opening a web address. */
  map: boolean
}

export function placeLink(place: string | null | undefined): PlaceLink | null {
  const text = (place ?? "").trim()
  if (!text) return null
  const url = /\s/.test(text) ? null : typedWebURL(text)
  if (url && /\.[a-z]{2,}$/i.test(url.hostname)) return { href: url.href, map: false }
  return { href: MAPS_SEARCH + encodeURIComponent(text), map: true }
}
