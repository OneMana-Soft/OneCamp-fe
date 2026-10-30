"use client"

import { Hand } from "@/lib/icons"

/**
 * A raised hand and its place in the queue (calls CALLS-3a), on a tile and a
 * People row: the call's one hand mark, amber on the stage's dark, so the
 * person running the call sees who is next without reading names.
 */
export function HandBadge({ place, className }: { place: number; className?: string }) {
  return (
    <span
      data-hand-badge={place}
      className={
        "inline-flex h-6 shrink-0 items-center gap-1 rounded-full bg-[#F5B544] pl-1.5 pr-2 text-micro font-semibold tabular-nums leading-none text-[#1F1500] shadow-e1 [&_svg]:size-3.5 " +
        (className ?? "")
      }
    >
      <Hand aria-hidden />
      {place}
      <span className="sr-only">{place === 1 ? ", hand raised, next to speak" : `, hand raised, ${place} in line`}</span>
    </span>
  )
}
