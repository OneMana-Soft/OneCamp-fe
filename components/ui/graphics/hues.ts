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
 * A face without a photo (design v3, §3.9): a saturated disc in the hue's
 * avatar cut, a1 to a2 at 140 degrees, with white initials and a soft inner
 * ring (avatar-person in globals.css). White is 4.5:1 or more at the middle
 * of every hue's disc (paletteContrast.test.ts). It replaced the pastel tint
 * with ink initials, which gave every person the visual weight of an empty
 * state.
 */
export function avatarHueClass(hue: CampHue): string {
  return `${HUE_CLASS[hue]} avatar-person text-white`
}

/**
 * Joins class names, skipping the empty ones. The motif files use this rather
 * than cn so they are the same file in the storefront, which carries no
 * tailwind-merge; nothing they join ever conflicts.
 */
export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ")
}
