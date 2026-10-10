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
  // The graphite palette of 10 Oct 2026 (design direction, "Palette tokens"):
  // signal orange on cool graphite neutrals.
  light: {
    brand: [204, 74, 11], // #CC4A0B
    "brand-muted": [255, 241, 232], // #FFF1E8
    background: [252, 252, 253], // #FCFCFD bg
    foreground: [20, 22, 26], // #14161A text
    card: [255, 255, 255], // #FFFFFF surface
    muted: [245, 246, 247], // #F5F6F7 surface-2
    "muted-foreground": [95, 100, 112], // #5F6470 text-2
    "faint-foreground": [138, 143, 153], // #8A8F99 text-3
    accent: [245, 246, 247],
    "accent-foreground": [20, 22, 26],
    border: [228, 229, 232], // #E4E5E8 line
    input: [211, 213, 218], // #D3D5DA line-strong
    "agent": [79, 91, 213], // #4F5BD5
    "agent-foreground": [255, 255, 255],
    "agent-muted": [238, 240, 253], // #EEF0FD
    success: [31, 138, 76],
    warning: [178, 107, 0],
    destructive: [209, 41, 61],
    info: [47, 111, 219],
    // The meanings as text (the storefront's "-ink" cuts).
    "success-ink": [23, 107, 58], // #176B3A
    "warning-ink": [138, 83, 0], // #8A5300
    "info-ink": [34, 87, 181], // #2257B5
    "danger-ink": [174, 31, 51], // #AE1F33
  },
  dark: {
    brand: [255, 122, 51], // #FF7A33
    "brand-foreground": [14, 15, 17],
    "brand-muted": [42, 26, 16], // #2A1A10
    background: [14, 15, 17], // #0E0F11
    foreground: [237, 238, 240], // #EDEEF0
    card: [22, 24, 28], // #16181C
    muted: [29, 32, 37], // #1D2025
    "muted-foreground": [155, 160, 170], // #9BA0AA
    "faint-foreground": [107, 112, 122], // #6B707A
    accent: [29, 32, 37],
    "accent-foreground": [237, 238, 240],
    border: [38, 40, 45], // #26282D
    input: [51, 54, 61], // #33363D
    "agent": [163, 171, 245], // #A3ABF5
    "agent-foreground": [14, 15, 17],
    "agent-muted": [30, 33, 64], // #1E2140
    success: [76, 195, 138],
    warning: [240, 180, 76],
    destructive: [242, 85, 90],
    info: [110, 164, 245],
    // On the dark ground the inks are the fills, but for danger.
    "success-ink": [76, 195, 138],
    "warning-ink": [240, 180, 76],
    "info-ink": [110, 164, 245],
    "danger-ink": [255, 128, 134], // #FF8086
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
