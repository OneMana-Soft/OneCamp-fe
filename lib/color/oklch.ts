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

export interface RGB {
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

/** OKLCH to sRGB, clamped to the gamut. Channels are 0..255. */
export function oklchToRgb(l: number, c: number, h: number): RGB {
  const hr = (h * Math.PI) / 180
  const a = c * Math.cos(hr)
  const bb = c * Math.sin(hr)

  const l_ = l + 0.3963377774 * a + 0.2158037573 * bb
  const m_ = l - 0.1055613458 * a - 0.0638541728 * bb
  const s_ = l - 0.0894841775 * a - 1.291485548 * bb

  const L = l_ * l_ * l_
  const M = m_ * m_ * m_
  const S = s_ * s_ * s_

  const linear = [
    4.0767416621 * L - 3.3077115913 * M + 0.2309699292 * S,
    -1.2684380046 * L + 2.6097574011 * M - 0.3413193965 * S,
    -0.0041960863 * L - 0.7034186147 * M + 1.707614701 * S,
  ]

  const encode = (v: number) => {
    const clamped = Math.max(0, Math.min(1, v))
    const srgb = clamped <= 0.0031308 ? 12.92 * clamped : 1.055 * Math.pow(clamped, 1 / 2.4) - 0.055
    return Math.round(srgb * 255)
  }
  return { r: encode(linear[0]), g: encode(linear[1]), b: encode(linear[2]) }
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
