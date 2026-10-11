import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

/**
 * The workspace and the storefront (onemana.dev) are one product to a visitor:
 * the page read before paying must look like the app used after. Design v3
 * (11 Oct 2026) writes its surfaces, inks and lines as the spec's hex and
 * rgba() and keeps the accent and the status colours in OKLCH; the storefront
 * pins the same table in its lib/appSystem.ts (and its sharedTokens.test.ts).
 * Change a shared colour in both repos, or neither.
 */
const SHARED: Record<"light" | "dark", Record<string, string>> = {
  // Design v3 of 11 Oct 2026 (DESIGN_V3.md §3.2 to §3.5): neutral graphite
  // surfaces, four ink tiers, alpha lines, and the accent wave 1 solved.
  light: {
    frame: "#F3F4F6",
    sheet: "#FFFFFF",
    sunken: "#F8F9FA",
    raised: "#FFFFFF",
    pop: "#FFFFFF",
    ink: "#16171B",
    "ink-2": "#5B5D65",
    "ink-3": "#8A8C92",
    "ink-4": "#B9BBC0",
    line: "rgba(20, 22, 30, 0.075)",
    "line-2": "rgba(20, 22, 30, 0.12)",
    "line-3": "rgba(20, 22, 30, 0.18)",
    hover: "rgba(20, 22, 30, 0.04)",
    press: "rgba(20, 22, 30, 0.07)",
    sel: "rgba(20, 22, 30, 0.055)",
    brand: "#CC4A0B",
    "brand-text": "#C2410C",
    "brand-foreground": "#FFFFFF",
    "brand-muted": "#FCEFE6",
    agent: "#5B63D6",
    "agent-muted": "#EEEFFC",
    "agent-ink": "#3B3FA6",
    success: "#1F8A4C",
    warning: "#B26B00",
    destructive: "#D1293D",
    info: "#2F6FDB",
    // The meanings as text (the storefront's "-ink" cuts).
    "success-ink": "#176B3A",
    "warning-ink": "#8A5300",
    "info-ink": "#2257B5",
    "danger-ink": "#AE1F33",
  },
  dark: {
    frame: "#0B0C0E",
    sheet: "#131416",
    sunken: "#0F1012",
    raised: "#1B1C1F",
    pop: "#1F2024",
    ink: "#EEEEF0",
    "ink-2": "#A8ABB1",
    "ink-3": "#72747B",
    "ink-4": "#4A4C52",
    line: "rgba(255, 255, 255, 0.065)",
    "line-2": "rgba(255, 255, 255, 0.10)",
    "line-3": "rgba(255, 255, 255, 0.16)",
    hover: "rgba(255, 255, 255, 0.04)",
    press: "rgba(255, 255, 255, 0.07)",
    sel: "rgba(255, 255, 255, 0.06)",
    brand: "#FF7A33",
    "brand-text": "#FF8A4C",
    "brand-foreground": "#0B0C0E",
    "brand-muted": "#2A1A10",
    agent: "#9AA2F6",
    "agent-muted": "#1E2040",
    "agent-ink": "#C9CDFB",
    success: "#4CC38A",
    warning: "#F0B44C",
    destructive: "#F2555A",
    info: "#6EA4F5",
    // On the dark ground the inks are the fills, but for danger.
    "success-ink": "#4CC38A",
    "warning-ink": "#F0B44C",
    "info-ink": "#6EA4F5",
    "danger-ink": "#FF8086",
  },
}

/**
 * The shadcn names are aliases of the v3 surfaces and inks, in both modes, so
 * the hundreds of components that say bg-background or text-muted-foreground
 * paint the v3 values, and the storefront's names (its lib/appSystem.ts)
 * point at the same ones.
 */
const ALIASES: Record<string, string> = {
  background: "sheet",
  foreground: "ink",
  card: "raised",
  popover: "pop",
  muted: "sunken",
  secondary: "sunken",
  "muted-foreground": "ink-2",
  "faint-foreground": "ink-3",
  accent: "hover",
  "sidebar-accent": "press",
  border: "line",
  input: "line-3",
  canvas: "frame",
  sidebar: "frame",
}

/**
 * The camp palette (the playful layer of 10 Oct 2026): six identity hues in
 * three cuts, the design direction's table verbatim. Both repos write these
 * as exact values (hex here, the same numbers as sRGB triples there) and pin
 * this same table (the storefront's lib/palette.ts CAMP), so they match
 * exactly, with no rounding allowance: a person's colour on onemana.dev is
 * the colour they get in the app.
 */
const CAMP: Record<"light" | "dark", Record<string, string>> = {
  light: {
    "camp-sun": "#B98200", "camp-sun-tint": "#FFF6D6", "camp-sun-ink": "#7A5200",
    "camp-moss": "#2F9E5B", "camp-moss-tint": "#E6F6EC", "camp-moss-ink": "#1D6A3C",
    "camp-lake": "#0E97A6", "camp-lake-tint": "#E1F5F6", "camp-lake-ink": "#0B5C65",
    "camp-sky": "#3B7DDD", "camp-sky-tint": "#E7EFFC", "camp-sky-ink": "#1E4E9A",
    "camp-dusk": "#7B61D9", "camp-dusk-tint": "#EFEBFC", "camp-dusk-ink": "#4B3699",
    "camp-berry": "#D9467C", "camp-berry-tint": "#FCE8EF", "camp-berry-ink": "#962556",
  },
  dark: {
    "camp-sun": "#F5C542", "camp-sun-tint": "#2E2712", "camp-sun-ink": "#FBE29C",
    "camp-moss": "#4CC38A", "camp-moss-tint": "#14291F", "camp-moss-ink": "#A6E7C4",
    "camp-lake": "#3CC6D2", "camp-lake-tint": "#10292F", "camp-lake-ink": "#A3E6EC",
    "camp-sky": "#6EA4F5", "camp-sky-tint": "#152238", "camp-sky-ink": "#B9D3FB",
    "camp-dusk": "#A795F5", "camp-dusk-tint": "#211B38", "camp-dusk-ink": "#D4CBFB",
    "camp-berry": "#F07AA6", "camp-berry-tint": "#33161F", "camp-berry-ink": "#F9C2D6",
  },
}

/** The avatar cut (§3.5): the two gradient stops, the same in both modes. */
const AVATAR: Record<string, string> = {
  "camp-sun-a1": "#AD7300", "camp-sun-a2": "#855500",
  "camp-moss-a1": "#3F945B", "camp-moss-a2": "#0E7344",
  "camp-lake-a1": "#0F919C", "camp-lake-a2": "#006E7D",
  "camp-sky-a1": "#427FD8", "camp-sky-a2": "#315CB0",
  "camp-dusk-a1": "#816BD8", "camp-dusk-a2": "#6749AC",
  "camp-berry-a1": "#CA4B85", "camp-berry-a2": "#A32B5E",
  "agent-a1": "#6572E4", "agent-a2": "#5050B9",
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

const hex = (rgb: [number, number, number]) => "#" + rgb.map((v) => v.toString(16).padStart(2, "0")).join("").toUpperCase()

/** A value as the table writes it: hex upper-case, rgba() normalised, oklch() converted. */
function normalise(value: string): string {
  const v = value.trim()
  const ok = v.match(/^oklch\(([\d.]+)\s+([\d.]+)\s+([\d.]+)\)$/)
  if (ok) return hex(oklchToRgb(Number(ok[1]), Number(ok[2]), Number(ok[3])))
  const a = v.match(/^rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)$/)
  if (a) return `rgba(${a[1]}, ${a[2]}, ${a[3]}, ${Number(a[4])})`
  return v.toUpperCase()
}

/** Within one step of rounding per channel, for the values the app writes in OKLCH. */
function same(got: string, want: string): boolean {
  if (got === normalise(want)) return true
  const p = (h: string) => (/^#[0-9A-F]{6}$/.test(h) ? [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) : null)
  const [g, w] = [p(got), p(normalise(want))]
  return !!g && !!w && g.every((v, i) => Math.abs(v - w[i]) <= 1)
}

describe("shared tokens", () => {
  const css = readFileSync(resolve(__dirname, "globals.css"), "utf8")
  for (const [theme, selector] of [["light", ":root"], ["dark", ".dark"]] as const) {
    const got = tokens(css, selector)
    const resolveVar = (name: string): string | undefined => {
      const v = got[name]
      const ref = v?.match(/^var\(--([\w-]+)\)$/)
      return ref ? resolveVar(ref[1]) : v
    }

    it(`${theme} matches the storefront`, () => {
      for (const [name, want] of Object.entries(SHARED[theme])) {
        const value = resolveVar(name)
        expect(value, `--${name} is missing`).toBeTruthy()
        const n = normalise(value!)
        expect(same(n, want), `--${name} is ${n}, the shared table says ${want}`).toBe(true)
      }
    })

    it(`${theme}: the shadcn names are aliases of the v3 tokens`, () => {
      for (const [alias, v3] of Object.entries(ALIASES)) {
        expect(got[alias], `--${alias}`).toBe(`var(--${v3})`)
      }
    })

    it(`${theme} camp palette is the storefront's, exactly`, () => {
      const want = CAMP[theme]
      expect(Object.keys(want)).toHaveLength(18)
      for (const [name, hex] of Object.entries(want)) {
        expect(got[name]?.toUpperCase(), `--${name}`).toBe(hex)
      }
    })
  }

  it("the avatar cut is the storefront's, exactly, and the same in both modes", () => {
    const root = tokens(css, ":root")
    for (const [name, want] of Object.entries(AVATAR)) expect(root[name]?.toUpperCase(), `--${name}`).toBe(want)
    const dark = tokens(css, ".dark")
    for (const name of Object.keys(AVATAR)) expect(dark[name], `--${name} is redefined in dark`).toBeUndefined()
  })
})
