import type { DocColour } from "@/lib/docColours"

/**
 * What a paste is, before it goes in (editor.md P0-5, R6; small-details L3,
 * L11, L12). Pure: the doc's paste handling (smartPaste.ts) asks these.
 */

/** Lines Markdown reads as blocks: a heading, a list item, a to-do, a quote, a rule. */
const BLOCK_LINE = [/^#{1,6}\s+\S/, /^[-*+]\s+\S/, /^\d{1,9}[.)]\s+\S/, /^>\s?\S/, /^(\*{3,}|-{3,}|_{3,})$/]
const FENCE = /^(`{3,}|~{3,})/
const TABLE_RULE = /^\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)+\|?$/

/**
 * How many Markdown block signals a text has: one a line that reads as a
 * block, two a closed code fence or a table's rule row. A paste becomes blocks
 * at two or more (R6), so a line of prose that starts with "-" stays itself.
 */
export function markdownSignals(text: string): number {
  let n = 0
  let fence: string | null = null
  for (const raw of text.split(/\r\n?|\n/)) {
    const line = raw.replace(/^ {0,3}/, "").trimEnd()
    const f = FENCE.exec(line)
    if (fence) {
      if (f && f[1][0] === fence[0] && f[1].length >= fence.length && line.slice(f[1].length).trim() === "") {
        n += 2
        fence = null
      }
      continue
    }
    if (f) fence = f[1]
    else if (TABLE_RULE.test(line)) n += 2
    else if (BLOCK_LINE.some((re) => re.test(line))) n += 1
  }
  return n
}

/** The pasted text when it is one web address and nothing else, else null. */
export function bareUrl(text: string): string | null {
  const t = text.trim()
  if (!/^https?:\/\/\S+$/i.test(t)) return null
  try {
    return new URL(t).hostname ? t : null
  } catch {
    return null
  }
}

/** The doc's colour names (B2's DocColour). */
type Ink = DocColour

const NAMED: Record<string, string> = {
  red: "#ff0000", darkred: "#8b0000", crimson: "#dc143c", maroon: "#800000", pink: "#ffc0cb", hotpink: "#ff69b4", magenta: "#ff00ff", fuchsia: "#ff00ff",
  orange: "#ffa500", darkorange: "#ff8c00", gold: "#ffd700", yellow: "#ffff00", brown: "#a52a2a", olive: "#808000",
  green: "#008000", lime: "#00ff00", darkgreen: "#006400", seagreen: "#2e8b57", teal: "#008080", cyan: "#00ffff", aqua: "#00ffff",
  turquoise: "#40e0d0", blue: "#0000ff", navy: "#000080", royalblue: "#4169e1", dodgerblue: "#1e90ff", steelblue: "#4682b4",
  purple: "#800080", indigo: "#4b0082", violet: "#ee82ee", blueviolet: "#8a2be2", gray: "#808080", grey: "#808080",
  darkgray: "#a9a9a9", darkgrey: "#a9a9a9", dimgray: "#696969", dimgrey: "#696969", slategray: "#708090", black: "#000000", white: "#ffffff",
}

/** A CSS colour as hue (degrees), saturation and lightness (0 to 1), or null when it isn't a plain colour. */
export function hslOf(css: string): [number, number, number] | null {
  let c = css.trim().toLowerCase()
  if (NAMED[c]) c = NAMED[c]
  let r: number, g: number, b: number
  const hex = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/.exec(c)
  const fn = /^(rgba?|hsla?)\(([^)]*)\)$/.exec(c)
  if (hex) {
    const h = hex[1].length <= 4 ? hex[1].slice(0, 3).split("").map((x) => x + x).join("") : hex[1].slice(0, 6)
    ;[r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255)
  } else if (fn) {
    const parts = fn[2].split(/[\s,/]+/).filter(Boolean)
    if (parts.length < 3) return null
    const num = (s: string, scale: number) => (s.endsWith("%") ? parseFloat(s) / 100 : parseFloat(s) / scale)
    if (fn[1].startsWith("hsl")) {
      const v = [parseFloat(parts[0]), num(parts[1], 100), num(parts[2], 100)]
      return v.some(Number.isNaN) ? null : [((v[0] % 360) + 360) % 360, v[1], v[2]]
    }
    ;[r, g, b] = parts.slice(0, 3).map((p) => num(p, 255))
  } else return null
  if ([r, g, b].some((v) => Number.isNaN(v))) return null
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  const d = max - min
  if (d === 0) return [0, 0, l]
  const s = d / (1 - Math.abs(2 * l - 1))
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4
  return [(h * 60 + 360) % 360, s, l]
}

/**
 * The camp ink a pasted text colour comes nearest to, or null to drop it:
 * black and white, and greys at either end, are the other app's default ink,
 * not a colour anyone chose.
 */
export function inkFor(css: string): Ink | null {
  const hsl = hslOf(css)
  if (!hsl) return null
  const [h, s, l] = hsl
  if (l < 0.12 || l > 0.92) return null
  if (s < 0.15) return l > 0.3 && l < 0.8 ? "gray" : null
  if (h < 15 || h >= 330) return "berry"
  if (h < 65) return "sun"
  if (h < 160) return "moss"
  if (h < 195) return "lake"
  if (h < 250) return "sky"
  return "dusk"
}

/**
 * Pasted HTML with its colours brought onto the doc's palette (L12), in the
 * doc's stored form (N15, B2): a text colour becomes the nearest colour's
 * name, <span data-color="sky">, and a background the nearest one's mark,
 * <mark data-color="sky">. One that is only the other app's default is
 * dropped. A colour the doc wrote itself (data-color) is left as it is.
 */
/** A colour in the doc's old stored form (var(--camp-sky-ink), the grey's var(--ink-2) or var(--press)), as its name. */
function named(css: string): Ink | null {
  const m = /var\(--camp-(sun|moss|lake|sky|dusk|berry)-(?:ink|tint)\)/.exec(css)
  return m ? (m[1] as Ink) : /var\(--(ink-2|press)\)/.test(css) ? "gray" : null
}

export function campColours(html: string): string {
  if (!/color\s*:|background\s*:/i.test(html) || typeof DOMParser === "undefined") return html
  const doc = new DOMParser().parseFromString(html, "text/html")
  let changed = false
  const wrap = (el: HTMLElement, tag: "span" | "mark", ink: Ink) => {
    const w = doc.createElement(tag)
    w.setAttribute("data-color", ink)
    while (el.firstChild) w.appendChild(el.firstChild)
    el.appendChild(w)
  }
  for (const el of Array.from(doc.body.querySelectorAll<HTMLElement>("[style]"))) {
    const text = el.style.getPropertyValue("color")
    const back = el.style.getPropertyValue("background-color") || el.style.getPropertyValue("background").split(/\s+/)[0]
    if (!text && !back) continue
    el.style.removeProperty("color")
    el.style.removeProperty("background-color")
    el.style.removeProperty("background")
    changed = true
    const textInk = text ? (named(text) ?? inkFor(text)) : null
    const backInk = back ? (named(back) ?? inkFor(back)) : null
    if (textInk) wrap(el, "span", textInk)
    if (backInk) wrap(el, "mark", backInk)
  }
  return changed ? doc.body.innerHTML : html
}
