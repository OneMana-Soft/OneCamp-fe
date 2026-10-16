import { useSyncExternalStore } from "react"
import { CAMP_HUES, campHueOf, hueFor, type CampHue } from "@/lib/campHue"

/**
 * A project's own hue (owner's decision, 12 Oct 2026): keyed on its id, the
 * same on every screen (its tile, its ring, its timeline bar, its card's
 * edge), and different from the reader's other projects. The two demo
 * projects hashed to the same dusk, so the sidebar, Home and the header
 * showed two purple projects side by side.
 *
 * A hash alone can't keep six hues apart, so the reader's projects share
 * them out, oldest first (the order the sidebar's answer lists them in): each
 * keeps the hue its id hashes to, unless an older project already has it,
 * then it takes the least used hue after its own. An older project never
 * changes colour when a newer one arrives. A project outside the reader's own
 * (a guest's view, another team's project) keeps its hash. A colour someone
 * picked wins over both.
 */

const key = (id: string | null | undefined) => (id ?? "").trim().toLowerCase()

/** Each project's hue, sharing the six out in the order given (oldest first). Pure. */
export function shareProjectHues(ids: readonly string[]): Map<string, CampHue> {
  const used = new Map<CampHue, number>(CAMP_HUES.map((h) => [h, 0]))
  const out = new Map<string, CampHue>()
  for (const raw of ids) {
    const id = key(raw)
    if (!id || out.has(id)) continue
    const least = Math.min(...used.values())
    const start = CAMP_HUES.indexOf(hueFor(id))
    let hue = CAMP_HUES[start]
    for (let i = 0; i < CAMP_HUES.length; i++) {
      const h = CAMP_HUES[(start + i) % CAMP_HUES.length]
      if (used.get(h) === least) {
        hue = h
        break
      }
    }
    used.set(hue, (used.get(hue) ?? 0) + 1)
    out.set(id, hue)
  }
  return out
}

let shared = new Map<string, CampHue>()
let order = ""
const listeners = new Set<() => void>()

/** The reader's projects, oldest first: the shell gives the sidebar's list here as it changes. */
export function setProjectOrder(ids: readonly string[]): void {
  const next = ids.map(key).join(",")
  if (next === order) return
  order = next
  shared = shareProjectHues(ids)
  listeners.forEach((l) => l())
}

/** A project's hue, outside React (a pure helper that colours a project). */
export function projectHue(id: string | null | undefined, chosen?: string | null): CampHue {
  return campHueOf(chosen) ?? shared.get(key(id)) ?? hueFor(id)
}

const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => listeners.delete(l)
}

/** projectHue for a component that colours many projects (a list's rows): drawn again if the reader's projects change. */
export function useProjectHues(): typeof projectHue {
  useSyncExternalStore(subscribe, () => order, () => "")
  return projectHue
}

/** A project's hue in a component, drawn again if the reader's projects change. */
export function useProjectHue(id: string | null | undefined, chosen?: string | null): CampHue {
  return useProjectHues()(id, chosen)
}
