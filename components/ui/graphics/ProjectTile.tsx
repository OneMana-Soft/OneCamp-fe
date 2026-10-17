"use client"

import type { CSSProperties } from "react"

import { Box, Flag, Globe, Heart, Layers, Rocket, Target, Zap } from "@/lib/icons"
import { useProjectHue } from "@/lib/projectHue"
import { cn } from "@/lib/utils/helpers/cn"

import { HUE_CLASS } from "./hues"

/**
 * The glyphs a project's tile can hold (work.md W07), in the order the hash
 * indexes them, so reordering this list changes every project's glyph.
 */
export const PROJECT_GLYPHS = { rocket: Rocket, layers: Layers, target: Target, flag: Flag, box: Box, heart: Heart, zap: Zap, globe: Globe } as const
export type ProjectGlyph = keyof typeof PROJECT_GLYPHS
const GLYPH_ORDER = Object.keys(PROJECT_GLYPHS) as ProjectGlyph[]

/** A project's glyph: the one it chose, else one hashed from its id (a different hash from its hue's). */
export function projectGlyphFor(id: string | null | undefined, chosen?: string | null): ProjectGlyph {
  if (chosen && chosen in PROJECT_GLYPHS) return chosen as ProjectGlyph
  const key = (id ?? "").trim().toLowerCase()
  let h = 5381
  for (let i = 0; i < key.length; i++) h = (Math.imul(h, 33) ^ key.charCodeAt(i)) >>> 0
  return GLYPH_ORDER[h % GLYPH_ORDER.length]
}

/** The sizes, with their radius and glyph (work.md W07; 14 sits in a 12px meta line, 24 is a search row's lead, 32 Home's project card). */
export const TILE_SIZES = {
  14: { radius: 4, glyph: 9 },
  16: { radius: 5, glyph: 10 },
  20: { radius: 6, glyph: 12 },
  24: { radius: 7, glyph: 14 },
  28: { radius: 8, glyph: 16 },
  32: { radius: 9, glyph: 16 },
  36: { radius: 10, glyph: 18 },
} as const
export type ProjectTileSize = keyof typeof TILE_SIZES

/**
 * A project's tile (design v3, work.md W07): a gradient from its hue's a1 to
 * a2 at 140 degrees holding a white glyph, with a soft inner highlight. The
 * one way a project is drawn (owner's decision, 12 Oct 2026): the sidebar,
 * the header, the overview, Home, the client view, search, the palette, link
 * cards, filters and task chips all draw this, so the same project is the
 * same tile on every screen (app/projectTile.test.ts). Its hue is the
 * project's own (lib/projectHue): keyed on its id, apart from the reader's
 * other projects. An archived project is grey.
 *
 * Decorative unless labelled: its name is always beside it.
 */
export function ProjectTile({
  id,
  chosen,
  glyph,
  size = 16,
  archived,
  label,
  className,
}: {
  /** The project's uuid: its hue and glyph hash from it. */
  id: string | null | undefined
  /** A colour its admins picked; it wins over the hash. */
  chosen?: string | null
  glyph?: string | null
  size?: ProjectTileSize
  archived?: boolean
  label?: string
  className?: string
}) {
  const h = useProjectHue(id, chosen)
  const { radius, glyph: g } = TILE_SIZES[size]
  const Glyph = PROJECT_GLYPHS[projectGlyphFor(id, glyph)]
  const style: CSSProperties = {
    width: size,
    height: size,
    borderRadius: radius,
    backgroundImage: archived
      ? "linear-gradient(140deg, var(--ink-3), var(--ink-2))"
      : "linear-gradient(140deg, var(--hue-a1), var(--hue-a2))",
    boxShadow: "inset 0 1px 0 rgb(255 255 255 / .25), inset 0 0 0 1px rgb(0 0 0 / .06)",
  }
  const a11y = label ? { role: "img", "aria-label": label } : { "aria-hidden": true as const }
  return (
    <span
      {...a11y}
      data-project-tile={size}
      data-hue={archived ? "archived" : h}
      className={cn(HUE_CLASS[h], "inline-flex shrink-0 items-center justify-center text-white", className)}
      style={style}
    >
      <Glyph style={{ width: g, height: g }} />
    </span>
  )
}
