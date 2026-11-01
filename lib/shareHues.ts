import { CAMP_HUES, type CampHue } from "@/lib/campHue"

/**
 * The six hues shared out among things in an order, the earliest first: each
 * keeps its own hue unless one before it has it, then takes the least used hue
 * after its own. So one never changes colour when another arrives after it,
 * and past six the hues repeat as evenly as they can. Pure.
 *
 * It is the rule the owner set for projects (12 Oct 2026; lib/projectHue keeps
 * its own copy in the shared core) and the one a call shares its people's
 * colours by (V-190, components/livekit/callHues). A key seen again keeps its
 * first hue.
 */
export function shareHues(own: Iterable<readonly [key: string, hue: CampHue]>): Map<string, CampHue> {
  const used = new Map<CampHue, number>(CAMP_HUES.map((h) => [h, 0]))
  const out = new Map<string, CampHue>()
  for (const [key, hue] of own) {
    if (out.has(key)) continue
    const least = Math.min(...used.values())
    const start = CAMP_HUES.indexOf(hue)
    let pick = hue
    for (let i = 0; i < CAMP_HUES.length; i++) {
      const h = CAMP_HUES[(start + i) % CAMP_HUES.length]
      if (used.get(h) === least) {
        pick = h
        break
      }
    }
    used.set(pick, (used.get(pick) ?? 0) + 1)
    out.set(key, pick)
  }
  return out
}
