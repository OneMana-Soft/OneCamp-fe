// A row that must know what fits before it draws (a note's tag chips: the
// ones that fit whole, then "+2" for the rest): words measured in their font,
// and how many items of a row fit whole.

const measured = new Map<string, number>()
/** Enough for every tag and count a session meets; past it the cache starts again. */
const MEASURED_MOST = 2000
let pen: OffscreenCanvasRenderingContext2D | null | undefined

function canvasPen(): OffscreenCanvasRenderingContext2D | null {
  if (pen === undefined) {
    try {
      pen = typeof OffscreenCanvas === "undefined" ? null : new OffscreenCanvas(1, 1).getContext("2d")
    } catch {
      pen = null
    }
  }
  return pen
}

/**
 * `text`'s width in px in `font`, a CSS font ("510 12px Inter, sans-serif"),
 * measured on a canvas once per font and text. Without a canvas (a test's
 * page, the server) it's estimated from the font's size.
 */
export function textWidth(text: string, font: string): number {
  const key = `${font}\u0000${text}`
  const known = measured.get(key)
  if (known !== undefined) return known
  const p = canvasPen()
  let width: number
  if (p) {
    p.font = font
    width = p.measureText(text).width
  } else {
    const size = Number(/(\d+(?:\.\d+)?)px/.exec(font)?.[1] ?? 16)
    width = text.length * size * 0.6
  }
  // Kept once the page's fonts are in: before that, a canvas measures their stand-in.
  if (!p || typeof document === "undefined" || document.fonts?.status === "loaded") {
    if (measured.size >= MEASURED_MOST) measured.clear()
    measured.set(key, width)
  }
  return width
}

/**
 * How many of a row's items fit whole in `room` px, in order, with `gap`
 * between them, keeping room for a count of the rest (`count(left)` wide)
 * whenever some are left out. At most `most`. 0 when not even the first
 * does: the caller shows it cut short, never drops it.
 */
export function itemsThatFit(widths: readonly number[], room: number, count: (left: number) => number, gap: number, most = Infinity): number {
  const limit = Math.min(most, widths.length)
  let used = 0
  let shown = 0
  while (shown < limit) {
    const next = used + (shown > 0 ? gap : 0) + widths[shown]
    const left = widths.length - shown - 1
    if (next + (left > 0 ? gap + count(left) : 0) > room) break
    used = next
    shown++
  }
  return shown
}
