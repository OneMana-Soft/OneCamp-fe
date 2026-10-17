// A doc's icon and cover as stored (B6, D-2): an emoji or "glyph:<name>[:<hue>]";
// "gallery:<name>" or "<doc>/<file>". Pure; on the doc route's first load.

import { hueFor, type CampHue } from "@/lib/campHue"

export type DocIconOf = { emoji: string } | { glyph: string; hue?: string } | null

export function docIconOf(icon?: string | null): DocIconOf {
  const s = (icon ?? "").trim()
  if (!s) return null
  if (s.startsWith("glyph:")) {
    const [, glyph, hue] = s.split(":")
    return glyph ? { glyph, hue } : null
  }
  return s.includes(":") ? null : { emoji: s }
}

export type DocCoverOf = { gallery: string } | { doc: string; file: string } | null

export function docCoverOf(cover?: string | null): DocCoverOf {
  const s = cover ?? ""
  if (s.startsWith("gallery:")) return { gallery: s.slice(8) }
  const [doc, file] = s.split("/")
  return doc && file ? { doc, file } : null
}

/**
 * The hue a doc wears (INTERACTION_SPEC D13, 15 Oct 2026): the colour its owner
 * gave its glyph, else its id's (lib/campHue hueFor), so its glyph and the rows
 * that list it are one colour on every screen, the tree, the docs home, search,
 * the palette and Later alike. Docs were grey everywhere (0% colour, PG2-09).
 * Grey, picked on purpose, is no hue, and so is a doc nobody named: null.
 */
export function docHue(id?: string | null, icon?: string | null): CampHue | null {
  const of = docIconOf(icon)
  const chosen = of && "glyph" in of ? of.hue : undefined
  if (chosen === "gray" || (!chosen && !(id ?? "").trim())) return null
  return hueFor(id, chosen)
}

/**
 * The icons the app has seen for docs, by id. A doc's icon comes with the
 * tree's levels, the starred places, the docs home and the doc itself, but
 * not with every list that names a doc: Recent, the palette's places and
 * Later drew the id's hue and the page glyph beside the tree's coloured
 * glyph, one doc in two colours (REVIEW-FE-SHELL db2 F7). The sources that
 * know a doc's icon say so here, its absence too, and those lists read it.
 */
const seenIcons = new Map<string, string>()

/** What a source that knows a doc's icon says it is; none clears it. */
export function rememberDocIcon(id: string | null | undefined, icon: string | null | undefined): void {
  if (!id) return
  if (icon) seenIcons.set(id, icon)
  else seenIcons.delete(id)
}

/** The doc's icon, as the app last saw it, for a list that doesn't carry it. */
export function knownDocIcon(id: string | null | undefined): string | undefined {
  return id ? seenIcons.get(id) : undefined
}
