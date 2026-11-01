/**
 * A board's frames as slides: the deck the board on a call's stage moves
 * through (Slides control, meet-14, as Meet's slide controls and Zoom's slide
 * control move a deck for everyone). The deck is the board's frames in the
 * Frames panel's order (lib/board/frames orderFrames: the order the board
 * keeps, then any frame not in it yet, in reading order), so whoever arranged
 * the panel arranged the talk. Pure.
 */
import { orderFrames, type Box } from "@/lib/board/frames"
import { SLIDE_ID } from "./slideId"

/** A frame of the board as a slide: its element id, and its name ("" when it has none). */
export interface Slide {
  id: string
  name: string
}

/** What the deck reads of a scene's elements (Excalidraw's, or a test's). */
export interface SceneFrame extends Box {
  id: string
  type: string
  isDeleted?: boolean
  name?: string | null
}

/**
 * The board's frames as a deck, in the Frames panel's order. Deleted frames
 * are left out, and so is a frame whose id the server wouldn't take as a
 * slide, so nothing offered is refused. Pure.
 */
export function deckOf(elements: readonly SceneFrame[], order: readonly string[] | null | undefined): Slide[] {
  const frames = elements.filter((e) => e.type === "frame" && !e.isDeleted && SLIDE_ID.test(e.id))
  return orderFrames(frames, order).map((f) => ({ id: f.id, name: f.name?.trim() ?? "" }))
}

/**
 * Where a step from `slide` goes: the next slide (by 1) or the previous one
 * (by -1), or null at either end. From the whole board (""), or from a slide
 * no longer in the deck, Next is the first slide and Previous goes nowhere.
 * Pure.
 */
export function stepSlide(deck: readonly Slide[], slide: string, by: 1 | -1): string | null {
  const at = deck.findIndex((s) => s.id === slide)
  if (at < 0) return by > 0 ? (deck[0]?.id ?? null) : null
  return deck[at + by]?.id ?? null
}

/** Where a slide sits in the deck, from 1, with its name; null for the whole board, or a slide no longer in it. Pure. */
export function slidePlace(deck: readonly Slide[], slide: string): { at: number; of: number; name: string } | null {
  const i = slide ? deck.findIndex((s) => s.id === slide) : -1
  return i < 0 ? null : { at: i + 1, of: deck.length, name: deck[i].name }
}
