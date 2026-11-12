import { isHex } from "@/lib/color/hex"
import { hexToRgb, oklchToRgb, rgbToHex, rgbToOklch } from "@/lib/color/oklch"

/**
 * A colour of one's own (calendar head B, gcal-1a; DESIGN-BUILD-112's More
 * colours) as the calendar draws it in each theme: a solid (a block's edge, a
 * dot, a swatch), the tint a block is filled with, and the ink its words are
 * in, the three parts a camp hue has. The grid draws them in CSS, from the
 * colour alone (globals.css .hue-own, relative colour), so an event paints in
 * its own colour at once; this is the same rule in numbers, for the picker's
 * preview and the tests, and app/globals.css is held to OWN_CUT by a test.
 *
 * The tint and the ink are cut in the colour's own hue at fixed lightness,
 * their chroma capped so every hue stays inside sRGB: the words keep AA on
 * every fill the grid draws (33% to 100% of the tint over the sheet) in both
 * themes, whatever was picked. The solid is the colour itself while it stands
 * out on the theme's sheet; a lighter one is drawn darker on a light screen
 * (a near white), a darker one lighter on a dark screen (a near black): that
 * is the clamp, which the picker shows. The text colour is never stored.
 */
export interface OwnTones {
  solid: string
  tint: string
  ink: string
}

export interface OwnColour {
  hex: string
  light: OwnTones
  dark: OwnTones
  /** The solid was moved to stand out in that theme. */
  clamped: { light: boolean; dark: boolean }
}

/** Each theme's cut: the solid's lightness bound, and the tint's and the ink's lightness and most chroma. */
export const OWN_CUT = {
  light: { solidMax: 0.72, tintL: 0.955, tintC: 0.02, inkL: 0.4, inkC: 0.065 },
  dark: { solidMin: 0.52, tintL: 0.28, tintC: 0.04, inkL: 0.88, inkC: 0.05 },
} as const

/** The sheet each theme draws on (globals.css --sheet). */
export const SHEET = { light: "#ffffff", dark: "#131416" } as const
/** Words on a fill keep WCAG AA. */
export const TEXT_AA = 4.5
/** A solid stands out on its sheet: a mark seen beside the words it marks. */
export const MARK_MIN = 2
/** The tint's strengths the grid fills a block with (HueBlock's --fill). */
export const FILLS = [0.33, 0.35, 0.6, 0.8, 1] as const

const at = (l: number, c: number, h: number) => rgbToHex(oklchToRgb(l, c, h))

/** Lower-case "#rrggbb" from what was typed ("#3B7DDD", "3b7ddd"), or null. Pure. */
export function hexOf(text: string): string | null {
  const t = text.trim().toLowerCase()
  const hex = t.startsWith("#") ? t : `#${t}`
  return isHex(hex) ? hex : null
}

/** A "#rrggbb" colour's two cuts, or null for anything else (a camp hue's name, nothing). Pure. */
export function ownColour(hex: string | null | undefined): OwnColour | null {
  if (!isHex(hex)) return null
  const key = hex.toLowerCase()
  const { l, c, h } = rgbToOklch(hexToRgb(key)!)
  const { light: L, dark: D } = OWN_CUT
  const lightMoved = l > L.solidMax
  const darkMoved = l < D.solidMin
  return {
    hex: key,
    light: { solid: lightMoved ? at(L.solidMax, c, h) : key, tint: at(L.tintL, Math.min(c, L.tintC), h), ink: at(L.inkL, Math.min(c, L.inkC), h) },
    dark: { solid: darkMoved ? at(D.solidMin, c, h) : key, tint: at(D.tintL, Math.min(c, D.tintC), h), ink: at(D.inkL, Math.min(c, D.inkC), h) },
    clamped: { light: lightMoved, dark: darkMoved },
  }
}

/** a mixed t (0 to 1) into b in OKLab, as CSS's color-mix(in oklab, a t%, b) draws it. Pure. */
export function mixOklab(a: string, b: string, t: number): string {
  const lab = (hex: string) => {
    const o = rgbToOklch(hexToRgb(hex)!)
    const r = (o.h * Math.PI) / 180
    return [o.l, o.c * Math.cos(r), o.c * Math.sin(r)]
  }
  const [x, y] = [lab(a), lab(b)]
  const [l, p, q] = x.map((v, i) => v * t + y[i] * (1 - t))
  return at(l, Math.hypot(p, q), (Math.atan2(q, p) * 180) / Math.PI)
}
