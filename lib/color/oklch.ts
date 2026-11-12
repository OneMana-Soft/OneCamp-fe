/**
 * OKLCH to sRGB, and WCAG contrast.
 *
 * The palette is authored in OKLCH because it keeps lightness perceptually even
 * across hues, which is what makes a tinted neutral ramp hold together. The cost
 * is that you cannot read a contrast ratio off the tokens by eye: the brand at
 * L 0.58 looked right and scored 4.43 against its own foreground, which fails AA
 * for body text. It is 0.55 because this maths said so.
 *
 * So the conversion lives here rather than inside a test, and the test uses it.
 * It is small, exact, and the only way to check a palette that no longer
 * contains a single hex value.
 */

// Relative: the e2e specs load this file by its path, where the @ alias isn't known.
import { isHex } from "./hex"

interface RGB {
  r: number
  g: number
  b: number
}

/** Parses `oklch(L C H)` with L as 0..1 or a percentage, and H in degrees. */
export function parseOklch(value: string): { l: number; c: number; h: number } | null {
  const m = /oklch\(\s*([\d.]+%?)\s+([\d.]+)\s+([\d.]+)/i.exec(value)
  if (!m) return null
  const rawL = m[1]
  const l = rawL.endsWith("%") ? parseFloat(rawL) / 100 : parseFloat(rawL)
  return { l, c: parseFloat(m[2]), h: parseFloat(m[3]) }
}

/** OKLCH to linear sRGB, unclamped: a channel outside 0..1 is outside the gamut. */
function linearRgb(l: number, c: number, h: number): number[] {
  const hr = (h * Math.PI) / 180
  const a = c * Math.cos(hr)
  const bb = c * Math.sin(hr)

  const l_ = l + 0.3963377774 * a + 0.2158037573 * bb
  const m_ = l - 0.1055613458 * a - 0.0638541728 * bb
  const s_ = l - 0.0894841775 * a - 1.291485548 * bb

  const L = l_ * l_ * l_
  const M = m_ * m_ * m_
  const S = s_ * s_ * s_

  return [
    4.0767416621 * L - 3.3077115913 * M + 0.2309699292 * S,
    -1.2684380046 * L + 2.6097574011 * M - 0.3413193965 * S,
    -0.0041960863 * L - 0.7034186147 * M + 1.707614701 * S,
  ]
}

/** OKLCH to sRGB, clamped to the gamut. Channels are 0..255. */
export function oklchToRgb(l: number, c: number, h: number): RGB {
  const linear = linearRgb(l, c, h)
  const encode = (v: number) => {
    const clamped = Math.max(0, Math.min(1, v))
    const srgb = clamped <= 0.0031308 ? 12.92 * clamped : 1.055 * Math.pow(clamped, 1 / 2.4) - 0.055
    return Math.round(srgb * 255)
  }
  return { r: encode(linear[0]), g: encode(linear[1]), b: encode(linear[2]) }
}

/** "#rrggbb" (either case) as sRGB channels 0..255, or null. */
export function hexToRgb(hex: string): RGB | null {
  if (!isHex(hex)) return null
  const n = parseInt(hex.slice(1), 16)
  return { r: n >> 16, g: (n >> 8) & 255, b: n & 255 }
}

/** sRGB to OKLCH, the way back from oklchToRgb: L 0..1, C, and H in degrees (0 for a grey). */
export function rgbToOklch({ r, g, b }: RGB): { l: number; c: number; h: number } {
  const linear = (v: number) => {
    const s = v / 255
    return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
  }
  const [R, G, B] = [linear(r), linear(g), linear(b)]
  const l_ = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B)
  const m_ = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B)
  const s_ = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B)
  const l = 0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_
  const a = 1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_
  const bb = 0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_
  const c = Math.hypot(a, bb)
  return { l, c, h: c < 1e-4 ? 0 : ((Math.atan2(bb, a) * 180) / Math.PI + 360) % 360 }
}

/** Whether an OKLCH colour is inside sRGB, so it draws as written rather than clipped. */
export function inSrgb(l: number, c: number, h: number): boolean {
  return linearRgb(l, c, h).every((v) => v >= -1e-4 && v <= 1 + 1e-4)
}

export function rgbToHex({ r, g, b }: RGB): string {
  return "#" + [r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")
}

/** WCAG 2.1 relative luminance. */
function luminance({ r, g, b }: RGB): number {
  const channel = (v: number) => {
    const s = v / 255
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
  }
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

/** WCAG contrast ratio, 1 to 21. */
export function contrastRatio(a: RGB, b: RGB): number {
  const la = luminance(a)
  const lb = luminance(b)
  const [hi, lo] = la > lb ? [la, lb] : [lb, la]
  return (hi + 0.05) / (lo + 0.05)
}
