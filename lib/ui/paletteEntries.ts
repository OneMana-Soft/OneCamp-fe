/**
 * What the open surfaces offer the command palette: the open doc's actions,
 * the open task's (linear-28: Linear's ⌘K acts on the issue you are on).
 *
 * A surface offers its actions here while it is open, and the palette lists
 * them under the surface's group ("This doc", "This task"). The palette
 * reads this module alone, never a surface's code, so its first load brings
 * no editor or task code (app/firstLoad.test.ts).
 *
 * An action keeps the surface's own write path: it runs, or it names its
 * choices and the palette asks which on a page of its own, then hands the
 * pick to apply, which is the handler the surface's own control calls. So a
 * task changed from the palette goes through the same checks, the same
 * optimistic paint and the same rollback as one changed on its panel.
 *
 * This module is what a surface's first load carries: the list and the offer.
 * The palette reads the list through lib/ui/paletteSurfaces, a part of its
 * own chunk, and a surface may make its actions in a chunk of its own (load).
 */

import type React from "react"
import type { PaletteMark } from "@/components/ui/paletteMark"

export interface PaletteChoice {
  value: string
  label: string
  /** The value it has now, marked "Current" on its row. */
  current?: boolean
  mark?: PaletteMark
}

export interface PaletteEntry {
  id: string
  label: string
  /** More words it is found by: its aliases and description. */
  keywords: string[]
  icon?: React.ElementType
  /** Its mark when it has no icon: one of the app's, named (a lazy surface's actions). */
  mark?: PaletteMark
  /** Its keys as the palette draws them, space between ("⌘ L"). */
  keys?: string
  /** What it does at once. An entry with choices has apply instead. */
  run?(): void
  /** Its choices (or a read of them), asked for when its page opens, and what takes the one picked. */
  choices?(): PaletteChoice[] | Promise<PaletteChoice[]>
  apply?(value: string): void
}

export interface PaletteSurface<M = undefined> {
  /** Prefixes its rows' values ("doc", "task"); one surface of an id is listed (lib/ui/paletteSurfaces). */
  id: string
  /** The group its actions are listed under. */
  group: string
  /** Listed first with nothing typed: the thing the person is on (a task). */
  lead?: boolean
  /**
   * The code its actions are made with, when that is a chunk of its own (a
   * task's): fetched as the palette opens, once for each id, so the surface's
   * first load carries none of it.
   */
  load?(): Promise<M>
  /** Asked each time the palette needs them, so they are never stale; given what load fetched. */
  entries(code: M): PaletteEntry[]
}

let offered: PaletteSurface<unknown>[] = []

/** A surface offers its actions until the returned function stops; a stop twice does nothing. */
export function offerPaletteEntries<M = undefined>(surface: PaletteSurface<M>): () => void {
  const s = surface as PaletteSurface<unknown>
  offered = [...offered, s]
  return () => {
    offered = offered.filter((o) => o !== s)
  }
}

/** The surfaces offering now, the oldest first. */
export function offeredSurfaces(): readonly PaletteSurface<unknown>[] {
  return offered
}
