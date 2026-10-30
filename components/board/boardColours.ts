import { personHue } from "@/lib/utils/getAvatarColor"
import { type CampHue } from "@/lib/campHue"

/**
 * A collaborator's live cursor on a board (content.md B07): their pointer and
 * name tag, in their avatar's camp hue, so the cursor and their face everywhere
 * else are one colour. Keyed as every person is (personHue): by their name.
 *
 * The cursors are drawn over the canvas (boardCursors.tsx), not on it: the
 * canvas takes a dark board through a filter that turns every colour on it
 * dark, and Excalidraw colours its own cursors by a hash of the id, never the
 * person's colour (27 Oct, M7: 2.48:1 on the call's stage). So the colours are
 * the camp's own inks (app/globals.css), chosen by the board the cursor sits
 * on:
 *   - a dark board (#121212 on screen, as on a call's stage): the hue's light
 *     ink, with its dark ink for the name (at least 12:1 on the board, 4.6:1
 *     for the name);
 *   - a light board: the hue's dark ink, with white for the name (at least
 *     6.6:1 both).
 */

/** The camp inks, as app/globals.css has them: dark (light theme) and light (dark theme). */
const DARK_INK: Record<CampHue, string> = {
  sun: "#7A5200",
  moss: "#1D6A3C",
  lake: "#0B5C65",
  sky: "#1E4E9A",
  dusk: "#4B3699",
  berry: "#962556",
}
const LIGHT_INK: Record<CampHue, string> = {
  sun: "#FBE29C",
  moss: "#A6E7C4",
  lake: "#A3E6EC",
  sky: "#B9D3FB",
  dusk: "#D4CBFB",
  berry: "#F9C2D6",
}

/** What a board looks like behind the cursors, on screen. */
export const BOARD_ON_SCREEN = { dark: "#121212", light: "#FFFFFF" } as const

export interface CursorColours {
  /** The pointer and the name tag. */
  fill: string
  /** The name on the tag. */
  text: string
  /** The pointer's edge, so it reads over a drawing as well as the board. */
  edge: string
}

/** A person's cursor colours on a dark board or a light one. */
export function cursorColours(person: string, dark: boolean): CursorColours {
  const hue = personHue(person)
  return dark
    ? { fill: LIGHT_INK[hue], text: DARK_INK[hue], edge: BOARD_ON_SCREEN.dark }
    : { fill: DARK_INK[hue], text: "#FFFFFF", edge: BOARD_ON_SCREEN.light }
}
