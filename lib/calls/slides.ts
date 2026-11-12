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

/**
 * Where a deck goes when the slide that's up leaves it (its frame deleted):
 * to the slide that took its place in the order `before` held, the next one
 * still in `deck`, or the one before it when it was the last; "" with none
 * left. A slide still in the deck stays where it is. Pure.
 */
export function slideInPlaceOf(before: readonly Slide[], deck: readonly Slide[], slide: string): string {
  if (deck.some((s) => s.id === slide)) return slide
  const kept = new Set(deck.map((s) => s.id))
  const at = before.findIndex((s) => s.id === slide)
  const around = at < 0 ? [] : [...before.slice(at + 1), ...before.slice(0, at).reverse()]
  return around.find((s) => kept.has(s.id))?.id ?? deck[0]?.id ?? ""
}

/** Where a slide sits in the deck, from 1, with its name; null for the whole board, or a slide no longer in it. Pure. */
export function slidePlace(deck: readonly Slide[], slide: string): { at: number; of: number; name: string } | null {
  const i = slide ? deck.findIndex((s) => s.id === slide) : -1
  return i < 0 ? null : { at: i + 1, of: deck.length, name: deck[i].name }
}
