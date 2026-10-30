"use client"

import * as React from "react"
import type { Doc } from "yjs"
import type { HocuspocusProvider } from "@hocuspocus/provider"
import { TAG_HUE_KEY, tagKey } from "@/lib/board/sticky"
import { hueFor, type CampHue } from "@/lib/campHue"
import { useBoardMeta, writeBoardMeta } from "@/components/board/boardStyle"

/** A board's tag colours (miro-07 5): a tag's hue, and picking one for everyone. */
export interface TagHues {
  /** A tag's hue: the one picked for it on this board, else its name's, as a task's tag of that name (lib/campHue hueFor). */
  hueOf(tag: string): CampHue
  /** Picks a tag's hue for everyone on the board. Only an editor's write reaches the board. */
  setHue(tag: string, hue: CampHue): void
}

/** The hues picked for tags, by tag lower-cased: each one its own boardMeta key (TAG_HUE_KEY), so two people colouring two tags never undo each other. */
function readTagHues(_: unknown, doc: Doc): ReadonlyMap<string, string> {
  const out = new Map<string, string>()
  doc.getMap<unknown>("boardMeta").forEach((value, key) => {
    if (key.startsWith(TAG_HUE_KEY) && typeof value === "string") out.set(key.slice(TAG_HUE_KEY.length), value)
  })
  return out
}

/**
 * A board's tag colours, kept with the board (its "boardMeta" map) so a tag
 * is one colour on every screen, after a reload and for a late joiner; a tag
 * nobody has coloured takes the hue its name hashes to.
 */
export function useTagHues(provider: HocuspocusProvider | null, synced: boolean): TagHues {
  const [picked] = useBoardMeta(provider, synced, TAG_HUE_KEY, readTagHues)
  return React.useMemo<TagHues>(
    () => ({
      hueOf: (tag) => hueFor(tag, picked?.get(tagKey(tag))),
      setHue: (tag, hue) => writeBoardMeta(provider, TAG_HUE_KEY + tagKey(tag), hue),
    }),
    [picked, provider],
  )
}
