import type { CampHue } from "@/lib/campHue"

/**
 * The class that makes a camp hue the current one (the hue-* utilities in
 * app/globals.css), by name. Inside it, bg-hue-tint, text-hue-ink, fill-hue
 * and stroke-hue draw in that hue, so a component picks its hue with one
 * class and its parts never name it.
 *
 * Literal strings, so the stylesheet keeps every one of them: a class built
 * as `hue-${name}` is invisible to Tailwind and would silently draw nothing.
 */
export const HUE_CLASS: Record<CampHue, string> = {
  sky: "hue-sky",
  moss: "hue-moss",
  sun: "hue-sun",
  dusk: "hue-dusk",
  berry: "hue-berry",
  lake: "hue-lake",
}

/**
 * A face without a photo: the hue's tint behind its ink initials, inside a
 * hairline of its strong cut. One harmonised set of six rather than a random
 * pastel per person; ink on its tint is 5.9:1 or more in light and 10.4:1 or
 * more in dark (paletteContrast.test.ts).
 */
export function avatarHueClass(hue: CampHue): string {
  return `${HUE_CLASS[hue]} bg-hue-tint text-hue-ink ring-1 ring-inset ring-hue/40`
}

/**
 * Joins class names, skipping the empty ones. The motif files use this rather
 * than cn so they are the same file in the storefront, which carries no
 * tailwind-merge; nothing they join ever conflicts.
 */
export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ")
}
