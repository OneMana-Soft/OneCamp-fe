/**
 * Where things laid from a list go on a board: Add from OneCamp lays its cards with these
 * (components/board/addWorkPanel). A module of its own, so the board page's first load never brings it. Pure.
 */

import { cardSize } from "@/lib/board/cards"
import { NOTE_GAP, nextNoteSpot, overlaps, type Box } from "@/lib/board/sticky"
import type { BoardView } from "@/lib/board/viewport"

/** How many spots nearestFreeSpot tries, nearest first: past these, the middle is far behind anyway. */
const NEAREST_TRIES = 400

/**
 * The free spot nearest `from` for a box of its size, on a grid of steps a box and a gap apart, that `room` holds
 * whole and nothing `taken` is on: `from` itself when it is free. Nearest by distance; at the same distance, below
 * before beside before above, and right before left, so boxes laid at one point fill a column down from it first.
 * Null when none of the nearest spots in the room is free. Pure.
 */
export function nearestFreeSpot(from: Box, taken: readonly Box[], room: Box): { x: number; y: number } | null {
  const sx = from.width + NOTE_GAP
  const sy = from.height + NOTE_GAP
  // The steps that keep the box inside the room, across and down.
  const i0 = Math.ceil((room.x - from.x) / sx)
  const i1 = Math.floor((room.x + room.width - from.width - from.x) / sx)
  const j0 = Math.ceil((room.y - from.y) / sy)
  const j1 = Math.floor((room.y + room.height - from.height - from.y) / sy)
  const steps: [number, number][] = []
  for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) steps.push([i, j])
  steps.sort(([ai, aj], [bi, bj]) => Math.hypot(ai * sx, aj * sy) - Math.hypot(bi * sx, bj * sy) || bj - aj || bi - ai)
  const near = taken.filter((t) => overlaps(t, room))
  for (const [i, j] of steps.slice(0, NEAREST_TRIES)) {
    const box = { x: from.x + i * sx, y: from.y + j * sy, width: from.width, height: from.height }
    if (!near.some((t) => overlaps(box, t))) return { x: box.x, y: box.y }
  }
  return null
}

/**
 * Where a card laid from a list goes, by its middle: the point asked for when
 * nothing on the board is there, else the nearest free spot around it that
 * `room` holds whole (the part of the board the person sees; the caller counts
 * the board's bars and panels as taken), down a column from the point first
 * (lib/board/sticky), so cards laid one after another never land on one
 * another, on what is drawn, or under the board's own bars. When nothing in
 * the room is free, the next free spot below the point, as a run of notes
 * goes, and `shown` is false: the caller brings it into view.
 */
export function freeCardSpot(at: { x: number; y: number }, kind: string, taken: readonly Box[], room: Box): { x: number; y: number; shown: boolean } {
  const size = cardSize(kind)
  const here = { x: at.x - size.width / 2, y: at.y - size.height / 2, ...size }
  const near = nearestFreeSpot(here, taken, room)
  const spot = near ?? (taken.some((t) => overlaps(here, t)) ? nextNoteSpot(here, taken, "below", size) : here)
  return { x: spot.x + size.width / 2, y: spot.y + size.height / 2, shown: near !== null }
}

/** What of the scene a view shows, as a box: the room a card laid in view must fit. */
export function viewBox(v: Pick<BoardView, "scrollX" | "scrollY" | "zoom" | "width" | "height">): Box {
  return { x: -v.scrollX, y: -v.scrollY, width: v.width / v.zoom, height: v.height / v.zoom }
}

/** The scroll that puts a scene point in the middle of what a view shows: lib/board/viewport's viewCentre, inverted. */
export function scrollToCentre(v: Pick<BoardView, "zoom" | "width" | "height">, p: { x: number; y: number }) {
  return { scrollX: v.width / 2 / v.zoom - p.x, scrollY: v.height / 2 / v.zoom - p.y }
}
