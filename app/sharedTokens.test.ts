import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

/**
 * The workspace and the storefront (onemana.dev) are one product to a visitor:
 * the page read before paying must look like the app used after. This app
 * writes its palette in OKLCH; the storefront writes the same colours as sRGB
 * triples and pins the same table in its app/sharedTokens.test.ts. Change a
 * shared colour in both repos, or neither.
 */
const SHARED: Record<"light" | "dark", Record<string, [number, number, number]>> = {
  light: {
    brand: [185, 74, 0],
    background: [254, 253, 252],
    foreground: [22, 19, 16],
    card: [255, 255, 254],
    muted: [246, 244, 241],
    "muted-foreground": [111, 105, 99],
    accent: [246, 243, 240],
    "accent-foreground": [29, 26, 22],
    border: [230, 227, 224],
    "agent": [81, 82, 193],
    "agent-foreground": [251, 251, 255],
    "agent-muted": [236, 239, 255],
  },
  dark: {
    brand: [242, 140, 92],
    background: [18, 15, 12],
    foreground: [248, 247, 244],
    card: [25, 22, 18],
    muted: [41, 38, 34],
    "muted-foreground": [168, 162, 155],
    accent: [44, 40, 36],
    "accent-foreground": [248, 247, 244],
    border: [42, 39, 35],
    "agent": [167, 176, 253],
    "agent-foreground": [18, 20, 40],
    "agent-muted": [38, 41, 68],
  },
}

// OKLCH to 8-bit sRGB (Björn Ottosson's OKLab matrices, then the sRGB curve).
function oklchToRgb(L: number, C: number, H: number): [number, number, number] {
  const h = (H * Math.PI) / 180
  const a = C * Math.cos(h)
  const b = C * Math.sin(h)
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3
  const lin = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ]
  const [r, g, bl] = lin.map((x) => {
    const c = Math.min(1, Math.max(0, x))
    return Math.round(255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055))
  })
  return [r, g, bl]
}

function tokens(css: string, selector: string): Record<string, string> {
  const at = css.search(new RegExp(`^${selector.replace(".", "\\.")}\\s*\\{`, "m"))
  if (at < 0) return {}
  const body = css.slice(at, css.indexOf("\n}", at))
  const out: Record<string, string> = {}
  for (const m of body.matchAll(/--([\w-]+):\s*([^;]+);/g)) if (!(m[1] in out)) out[m[1]] = m[2].trim()
  return out
}

describe("shared tokens", () => {
  const css = readFileSync(resolve(__dirname, "globals.css"), "utf8")
  for (const [theme, selector] of [["light", ":root"], ["dark", ".dark"]] as const) {
    it(`${theme} matches the storefront`, () => {
      const got = tokens(css, selector)
      for (const [name, want] of Object.entries(SHARED[theme])) {
        const m = got[name]?.match(/^oklch\(([\d.]+)\s+([\d.]+)\s+([\d.]+)\)$/)
        expect(m, `--${name} is ${got[name]}`).toBeTruthy()
        const rgb = oklchToRgb(Number(m![1]), Number(m![2]), Number(m![3]))
        // One step of rounding either way is the same colour on screen.
        rgb.forEach((v, i) => expect(Math.abs(v - want[i]), `--${name} ${rgb} vs ${want}`).toBeLessThanOrEqual(1))
      }
    })
  }
})
