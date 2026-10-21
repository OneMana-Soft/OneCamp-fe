import type { CampHue } from "@/lib/campHue"

export type MarkHue = CampHue | "agent" | "ink"

/**
 * The class that makes a hue current (the hue-* utilities in globals.css): a
 * camp hue, the agents' indigo, or ink for what names no area (lib/areas).
 * Inside it, bg-hue-tint, text-hue-ink, fill-hue and stroke-hue draw in it.
 *
 * Literal strings: Tailwind can't see a class built as `hue-${name}`, which
 * would silently draw nothing.
 */
export const HUE_CLASS: Record<MarkHue, string> = {
  sky: "hue-sky",
  moss: "hue-moss",
  sun: "hue-sun",
  dusk: "hue-dusk",
  berry: "hue-berry",
  lake: "hue-lake",
  agent: "hue-agent",
  ink: "hue-ink",
}

/** A face without a photo (design v3, §3.9): white initials on the hue's avatar disc (globals.css avatar-person; paletteContrast.test.ts). */
export function avatarHueClass(hue: CampHue): string {
  return `${HUE_CLASS[hue]} avatar-person text-white`
}

/** Joins class names, skipping empty ones: the motif files' cn, as in the storefront (no tailwind-merge). */
export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ")
}
