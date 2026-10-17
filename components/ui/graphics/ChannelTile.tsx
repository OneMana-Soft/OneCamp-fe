"use client"

import { Hash, Lock } from "@/lib/icons"
import { placeHue } from "@/lib/placeHue"
import { cn } from "@/lib/utils/helpers/cn"

import { HUE_CLASS } from "./hues"
import { TILE_SIZES, type ProjectTileSize } from "./ProjectTile"

/**
 * A channel's tile (D13): its hue's tint holding the # (a lock for a private
 * channel) in the hue's strong cut, at the project tile's sizes and radii.
 * The hue is lib/placeHue's for a channel (its id's), the one every row that
 * lists the channel tints in.
 * It replaced the monochrome #, which left chat the least colourful area of
 * the app (PG1-14). A project is a saturated gradient with a white glyph; a
 * channel, a room people meet in, is the calmer tint, so the two never read
 * as one kind beside each other in the sidebar.
 *
 * Decorative: the channel's name is always beside it.
 */
export function ChannelTile({
  id,
  isPrivate,
  size = 16,
  className,
}: {
  /** The channel's uuid: its hue hashes from it. */
  id: string | null | undefined
  isPrivate?: boolean
  size?: ProjectTileSize
  className?: string
}) {
  const h = placeHue("channel", id) ?? "sky"
  const { radius, glyph } = TILE_SIZES[size]
  const Glyph = isPrivate ? Lock : Hash
  return (
    <span
      aria-hidden="true"
      data-channel-tile={size}
      data-hue={h}
      className={cn(HUE_CLASS[h], "inline-flex shrink-0 items-center justify-center bg-hue-tint", className)}
      // A hairline in the hue keeps the tile's shape on the frame, where the light tint all but matches it.
      style={{ width: size, height: size, borderRadius: radius, boxShadow: "inset 0 0 0 1px color-mix(in oklab, var(--hue) 22%, transparent)" }}
    >
      {/* The glyph takes the hue itself: a nav row colours the icons inside it (.nav-idle svg). */}
      <Glyph className="text-hue" style={{ width: glyph, height: glyph }} />
    </span>
  )
}
