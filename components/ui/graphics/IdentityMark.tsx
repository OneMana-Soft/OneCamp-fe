import type { CSSProperties, ReactNode } from "react"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { hueFor, type CampHue } from "@/lib/campHue"
import { getNameInitials } from "@/lib/utils/getNameInitials"
import { cn } from "@/lib/utils/helpers/cn"

import { HUE_CLASS, avatarHueClass } from "./hues"
import { Tile } from "./Tile"

export type IdentityMarkVariant = "dot" | "square" | "tile" | "avatar"

export interface IdentityMarkProps {
  /** What the mark stands for, hashed onto a hue: a uuid is best, any stable key works. */
  id?: string | null
  /** A colour the owner picked (a camp hue, a palette name or a hex). It wins over the id. */
  chosen?: string | null
  /** A hue outright, for a fixed category or the showcase. It wins over both. */
  hue?: CampHue
  variant?: IdentityMarkVariant
  /** In px. Defaults: dot 8, square 10, tile 32, avatar 32. */
  size?: number
  /** The name: the avatar's initials, and the tile's letter when it has no icon. */
  label?: string
  /** The tile's glyph, an icon element drawn in the strong cut. */
  icon?: ReactNode
  /** The avatar's photo. While it loads, or if it fails, the coloured initials show. */
  src?: string
  /** Gives the mark a name of its own, for one that stands alone (an avatar stack). */
  "aria-label"?: string
  className?: string
}

const DEFAULT_SIZE: Record<IdentityMarkVariant, number> = { dot: 8, square: 10, tile: 32, avatar: 32 }

/**
 * A thing's colour, as a mark beside its name (the playful layer, "Identity").
 * One hue per person, project, channel, team, doc or calendar, from
 * lib/campHue's hueFor, so the same thing is the same colour on every screen:
 *
 *   dot     a 6 to 8 px disc: a channel or calendar in a list
 *   square  a small rounded square: a project, beside its name
 *   tile    a tint tile holding an icon, or the name's first letter
 *   avatar  a person without a photo: tint, ink initials, a strong hairline
 *
 *   <IdentityMark id={project.project_uuid} variant="square" />
 *   <IdentityMark id={user.user_uuid} label={name} src={photo} variant="avatar" />
 *
 * Decorative unless given an aria-label: the name beside it already says what
 * it is, and colour never carries meaning alone.
 */
export function IdentityMark({
  id,
  chosen,
  hue,
  variant = "dot",
  size,
  label,
  icon,
  src,
  className,
  "aria-label": ariaLabel,
}: IdentityMarkProps) {
  const h = hue ?? hueFor(id, chosen)
  const px = size ?? DEFAULT_SIZE[variant]
  const a11y = ariaLabel ? { role: "img", "aria-label": ariaLabel } : { "aria-hidden": true as const }

  if (variant === "avatar") {
    const style: CSSProperties = { width: px, height: px }
    return (
      <Avatar {...a11y} style={style} className={cn("shrink-0", className)} data-hue={h}>
        {src ? <AvatarImage src={src} alt="" /> : null}
        <AvatarFallback
          className={cn(avatarHueClass(h), "font-medium leading-none")}
          style={{ fontSize: Math.max(9, Math.round(px * 0.38)) }}
        >
          {getNameInitials(label)}
        </AvatarFallback>
      </Avatar>
    )
  }

  if (variant === "tile") {
    const tileSize = px <= 24 ? "sm" : px <= 32 ? "md" : "lg"
    return (
      <Tile hue={h} size={tileSize} className={className} data-hue={h} {...a11y}>
        {icon ?? <span className="text-hue-ink text-xs font-semibold">{getNameInitials(label).slice(0, 1)}</span>}
      </Tile>
    )
  }

  // A dot and a square are drawn, not boxed: crisp at any size, and coloured
  // by fill-hue rather than a background.
  return (
    <svg
      {...a11y}
      width={px}
      height={px}
      viewBox="0 0 10 10"
      data-hue={h}
      className={cn(HUE_CLASS[h], "shrink-0 fill-hue", className)}
    >
      {variant === "square" ? <rect width="10" height="10" rx="2.5" /> : <circle cx="5" cy="5" r="5" />}
    </svg>
  )
}
