import { hueFor, type CampHue } from "@/lib/campHue"

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

/** A camp hue's strong cut, in the current theme. */
export function campColour(hue: CampHue): string {
  if (typeof document === "undefined") return LIGHT_STRONG[hue]
  const v = getComputedStyle(document.documentElement).getPropertyValue(`--camp-${hue}`).trim()
  return v || LIGHT_STRONG[hue]
}

/**
 * A collaborator's pointer and name tag on a board: their identity hue (the
 * colour their avatar carries everywhere else) with a white edge, keyed by
 * their user id so every screen shows them in the same colour.
 */
export function collaboratorColour(id: string): { background: string; stroke: string } {
  return { background: campColour(hueFor(id)), stroke: "#ffffff" }
}
