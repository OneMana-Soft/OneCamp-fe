import { CAMP_HUES, hash32, hueFor, type CampHue } from "@/lib/campHue"

/**
 * A board's hues for what draws several at once (its fallback notes): its own
 * hue (hueFor) first, then each two along the wheel, so three never repeat.
 * Beside lib/campHue rather than in it, which every page loads. Pure.
 */
export function huesFor(id: string, count: number): CampHue[] {
  const first = CAMP_HUES.indexOf(hueFor(id))
  return Array.from({ length: count }, (_, i) => CAMP_HUES[(first + i * 2) % CAMP_HUES.length])
}

/** The hash hueFor reads an id by (no case, no surrounding space), for what else varies with it: a tilt, an offset. */
export function idHash(id: string): number {
  return hash32(id.trim().toLowerCase())
}
