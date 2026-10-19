import type { CampHue } from "@/lib/campHue"
import { CATEGORY_HUE, type StatusOption } from "@/lib/taskStatus"
import { HUE_CLASS } from "@/components/ui/graphics/hues"

/**
 * A board column's colour (the rivals review of 16 Oct 2026: Notion tints
 * each status column and heads it with a coloured pill, so the stage reads
 * from across the room). A column takes its status's hue: a custom status
 * its own, a built-in one its category's, the colour its glyph already draws
 * in. To do, backlog, cancelled and a person's column stay neutral.
 */
export function columnHue(status?: StatusOption): CampHue | null {
  if (!status?.category) return null
  const hue = status.custom ? status.hue : CATEGORY_HUE[status.category]
  return hue && hue !== "neutral" ? hue : null
}

/**
 * The column's well: half its hue's tint over the sunken surface, light, and
 * half the tint over the frame, dark. Measured: ink-3 holds 4.9:1 on it at
 * rest and 4.5:1 under a row's hover, and the status glyph 3:1. A drop paints
 * over it (app/interaction.css [data-drop], a background image).
 */
export function columnWash(hue: CampHue | null): string {
  return hue
    ? `${HUE_CLASS[hue]} bg-[color-mix(in_oklab,var(--hue-tint)_50%,var(--sunken))] dark:bg-[color-mix(in_oklab,var(--hue-tint)_50%,transparent)]`
    : "bg-sunken dark:bg-white/[.02]"
}

/** The header's lozenge: the glyph and the name on the hue's tint in its ink, or on a neutral fill. */
export function columnLozenge(hue: CampHue | null): string {
  return hue ? "bg-hue-tint text-hue-ink" : "bg-hover text-foreground"
}
