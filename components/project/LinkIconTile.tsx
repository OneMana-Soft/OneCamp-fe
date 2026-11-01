"use client"

import { useState } from "react"
import { Link2 } from "@/lib/icons"
import { cn } from "@/lib/utils/helpers/cn"

/** In a chip (the strip, the phone's chip) and on a card (the Links tool). */
const SIZE = {
  chip: { tile: "size-4 rounded-xs", mark: "size-3" },
  card: { tile: "size-9 rounded-[10px]", mark: "size-[18px]" },
} as const

/**
 * A project link's icon on its tile, the one its chips and cards draw
 * (basecamp-16). A site's icon sits on a light tile with the hairline, in dark
 * too: sites draw their marks for a light page, and GitHub's black one
 * vanished on a dark tile. No icon, or a picture that can't come, shows the
 * link glyph on the neutral tile. The picture is the API's own address, so
 * the reader's session goes with it.
 */
export function LinkIconTile({ src, size = "chip", className }: { src: string; size?: keyof typeof SIZE; className?: string }) {
  // The address whose picture failed: another link's comes fresh.
  const [failed, setFailed] = useState<string | null>(null)
  const picture = !!src && failed !== src
  const s = SIZE[size]
  return (
    <span
      data-link-tile={picture ? "picture" : "glyph"}
      className={cn("flex shrink-0 items-center justify-center ring-1 ring-line", s.tile, picture ? "bg-sunken dark:bg-white" : "bg-sunken text-ink-3", className)}
    >
      {picture ? (
        // eslint-disable-next-line @next/next/no-img-element -- a kept picture behind the API's redirect: no optimiser on this plan
        <img src={src} alt="" aria-hidden="true" decoding="async" className={cn("rounded-[3px] object-contain", s.mark)} onError={() => setFailed(src)} />
      ) : (
        <Link2 aria-hidden="true" className={s.mark} />
      )}
    </span>
  )
}
