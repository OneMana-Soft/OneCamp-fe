"use client"

import { Link2, MapPin } from "@/lib/icons"
import { placeLink } from "@/lib/place/mapLink"
import { cn } from "@/lib/utils/helpers/cn"

/**
 * An event's place (calendar head B, gcal-1a; Google's map link), one line
 * wherever an event is read: its pop card, the agenda and its own page. A
 * room or an address opens a map search for it, a web address opens itself
 * (lib/place/mapLink), in a new tab with no opener; its icon says which, a
 * pin or a link. `row` sits in a card's 16 px icon column; `meta` is the
 * agenda's small line. A click never opens the row it sits in.
 */
export function PlaceLine({ place, size = "row", className }: { place?: string | null; size?: "row" | "meta"; className?: string }) {
  const link = placeLink(place)
  if (!link || !place) return null
  const text = place.trim()
  const Icon = link.map ? MapPin : Link2
  return (
    <a
      href={link.href}
      target="_blank"
      rel="noopener noreferrer"
      data-place-line={link.map ? "map" : "link"}
      aria-label={`${text}${link.map ? ", on a map" : ""} (opens in a new tab)`}
      title={text}
      onClick={(e) => e.stopPropagation()}
      className={cn(
        "group/place inline-flex min-w-0 max-w-full items-center rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-brand",
        size === "row" ? "gap-2.5 text-ui-sm text-ink" : "gap-1 text-meta text-ink-3",
        className,
      )}
    >
      <Icon className={cn("shrink-0", size === "row" ? "size-4 text-ink-3" : "size-3")} aria-hidden="true" />
      <span className="min-w-0 truncate underline-offset-2 group-hover/place:underline">{text}</span>
    </a>
  )
}
