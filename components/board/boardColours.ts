import { personHue } from "@/lib/utils/getAvatarColor"
import { type CampHue } from "@/lib/campHue"

/**
 * The camp palette as the board's canvas needs it: colours, not classes.
 * Excalidraw draws collaborators' pointers on a canvas, so a hue has to be a
 * colour string, read from the theme's own tokens (app/globals.css) so it
 * follows light and dark. The light values stand in where there is no
 * document (server render, tests without styles).
 */
const LIGHT_STRONG: Record<CampHue, string> = {
  sun: "#B98200",
  moss: "#2F9E5B",
  lake: "#0E97A6",
  sky: "#3B7DDD",
  dusk: "#7B61D9",
  berry: "#D9467C",
}

/** The avatar cut's first stop (design v3 §3.5), the colour a face starts from. */
const LIGHT_A1: Record<CampHue, string> = {
  sun: "#AD7300",
  moss: "#3F945B",
  lake: "#0F919C",
  sky: "#427FD8",
  dusk: "#816BD8",
  berry: "#CA4B85",
}

function token(name: string, fallback: string): string {
  if (typeof document === "undefined") return fallback
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return v || fallback
}

/** A camp hue's strong cut, in the current theme. */
export function campColour(hue: CampHue): string {
  return token(`--camp-${hue}`, LIGHT_STRONG[hue])
}

/** A camp hue's avatar colour (a1), in the current theme. */
export function avatarColour(hue: CampHue): string {
  return token(`--camp-${hue}-a1`, LIGHT_A1[hue])
}

/**
 * A collaborator's pointer and name flag on a board (content.md B07): the
 * colour their avatar starts from (a1), so the cursor, the flag and their face
 * everywhere else are one colour, with a white edge. Keyed by their user id so
 * every screen shows them the same. (The canvas takes one colour, not the
 * avatar's gradient.) Keyed as every person is (personHue): by their name.
 */
export function collaboratorColour(person: string): { background: string; stroke: string } {
  return { background: avatarColour(personHue(person)), stroke: "#ffffff" }
}
