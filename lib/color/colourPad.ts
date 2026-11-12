import { hexToRgb, inSrgb, oklchToRgb, rgbToHex, rgbToOklch } from "@/lib/color/oklch"

/**
 * The colour picker's pad (DESIGN-BUILD-112's More colours): hue across, 0 to
 * 360 degrees, and lightness down, light at the top; each place the most
 * vivid colour sRGB holds there, to a calm 0.19 of chroma. The arrow keys
 * move along it (Shift for a bigger step). Pure.
 */
export const PAD_LIGHTNESS = { top: 0.95, bottom: 0.2 } as const
const MOST_CHROMA = 0.19

export interface PadPlace {
  hue: number
  lightness: number
}

const clampL = (l: number) => Math.min(PAD_LIGHTNESS.top, Math.max(PAD_LIGHTNESS.bottom, Math.round(l * 1000) / 1000))

/** The colour at a place on the pad, as "#rrggbb". */
export function padColour(hue: number, lightness: number): string {
  let c = MOST_CHROMA
  while (c > 0 && !inSrgb(lightness, c, hue)) c = Math.max(0, c - 0.002)
  return rgbToHex(oklchToRgb(lightness, c, hue))
}

/** Where a colour sits on the pad (its hue and lightness, the pad's ends for one past them). */
export function padPlace(hex: string): PadPlace {
  const o = rgbToOklch(hexToRgb(hex) ?? { r: 0, g: 0, b: 0 })
  return { hue: Math.round(o.h) % 360, lightness: clampL(o.l) }
}

/** The place an arrow key moves to, or null for a key that isn't one. */
export function padStep(at: PadPlace, key: string, big = false): PadPlace | null {
  const hue = big ? 30 : 5
  const light = big ? 0.1 : 0.02
  switch (key) {
    case "ArrowRight":
      return { hue: (at.hue + hue) % 360, lightness: at.lightness }
    case "ArrowLeft":
      return { hue: (at.hue - hue + 360) % 360, lightness: at.lightness }
    case "ArrowUp":
      return { hue: at.hue, lightness: clampL(at.lightness + light) }
    case "ArrowDown":
      return { hue: at.hue, lightness: clampL(at.lightness - light) }
    default:
      return null
  }
}
