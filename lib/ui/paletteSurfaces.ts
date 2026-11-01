/**
 * The palette's side of lib/ui/paletteEntries: what the open surfaces offer,
 * read as the palette opens. Only the palette imports it, so it rides in the
 * palette's own chunk and on no first screen (app/firstLoad.test.ts).
 *
 * A surface whose actions are made in a chunk of their own (a task's:
 * linear-28) names it as load. loadPaletteSurfaces fetches it the first time
 * the palette opens with that surface offered, and the surface is listed from
 * then on: a moment after the rest on that first open, at once on every later
 * one, including for the next task, since one id's code is fetched once.
 */

import { offeredSurfaces, type PaletteEntry } from "@/lib/ui/paletteEntries"

export interface OfferedSurface {
  id: string
  group: string
  lead: boolean
  entries: PaletteEntry[]
}

/** What each surface id's load fetched, once it has come. */
const fetched = new Map<string, { code: unknown }>()

/**
 * Fetches the code of every open surface that names some its id hasn't
 * fetched yet; true when any came, so the palette lists again. A fetch that
 * fails is logged, and its surface offers nothing until an open asks again.
 */
export async function loadPaletteSurfaces(): Promise<boolean> {
  const wanted = offeredSurfaces().filter((s) => s.load && !fetched.has(s.id))
  const came = await Promise.all(
    wanted.map(async (s) => {
      try {
        const code = await s.load!()
        fetched.set(s.id, { code })
        return true
      } catch (e) {
        console.error(`The palette actions of "${s.group}" didn't load`, e)
        return false
      }
    }),
  )
  return came.includes(true)
}

/**
 * The open surfaces' actions, the newest offered first: a task opened over
 * a doc comes before the doc. One surface of an id is listed, the newest with
 * something to offer: two task panels open at once (the page, the right
 * panel, a split pane) list one task, the one the person used last, which
 * offered again (CR-127), and a doc that isn't the one used last offers
 * nothing (commandBus), so the one that is still lists. A surface with
 * nothing to offer now is left out, and so is one whose code hasn't come yet,
 * or whose actions fail, which is logged.
 */
export function paletteSurfaces(): OfferedSurface[] {
  const surfaces = offeredSurfaces()
  const out: OfferedSurface[] = []
  const listed = new Set<string>()
  for (let i = surfaces.length - 1; i >= 0; i--) {
    const s = surfaces[i]
    if (listed.has(s.id)) continue
    const got = fetched.get(s.id)
    if (s.load && !got) continue
    let entries: PaletteEntry[]
    try {
      entries = s.entries(got?.code)
    } catch (e) {
      console.error(`The palette actions of "${s.group}" failed`, e)
      continue
    }
    if (!entries.length) continue
    listed.add(s.id)
    out.push({ id: s.id, group: s.group, lead: s.lead === true, entries })
  }
  return out
}

/** Forgets what was fetched (tests). */
export function forgetPaletteCode(): void {
  fetched.clear()
}
