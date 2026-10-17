import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

// The phone layer's stylesheet (design v3, mobile.md F1, F4, F5, C1 and §7).

const ROOT = join(__dirname, "..")
const CSS = readFileSync(join(ROOT, "app/phone.css"), "utf8")
const read = (p: string) => readFileSync(join(ROOT, p), "utf8")

/** The rule bodies of every selector containing `needle`. */
function rules(needle: string): string[] {
  const out: string[] = []
  const re = /([^{}]+)\{([^{}]*)\}/g
  let m: RegExpExecArray | null
  while ((m = re.exec(CSS))) if (m[1].includes(needle)) out.push(m[2])
  return out
}

describe("the phone layer is loaded", () => {
  it("after globals.css, so it outranks the shell's phone block", () => {
    const layout = read("app/layout.tsx")
    const g = layout.indexOf('import "./globals.css"')
    const p = layout.indexOf('import "./phone.css"')
    expect(g).toBeGreaterThan(-1)
    expect(p).toBeGreaterThan(g)
  })

  it("is plain CSS, never run through the utility compiler", () => {
    expect(CSS).not.toMatch(/@apply|@theme|@import "tailwindcss"/)
  })
})

describe("F1. phone tokens", () => {
  it("declares the phone's sizes, the bar shadow, the sheet radius and the push curve", () => {
    for (const [name, value] of [
      ["--m-gutter", "16px"],
      ["--m-bar", "52px"],
      ["--m-tab", "56px"],
      ["--m-row", "64px"],
      ["--m-row-sm", "48px"],
      ["--m-row-task", "60px"],
      ["--m-hit", "44px"],
      ["--r-sheet", "20px"],
      ["--t-push", "380ms"],
      ["--t-sheet", "420ms"],
      ["--t-tap", "90ms"],
    ]) {
      expect(CSS, name).toMatch(new RegExp(`${name}:\\s*${value};`))
    }
    expect(CSS).toMatch(/--e-bar: 0 -1px 0 rgb\(16 18 26 \/ 0\.07\), 0 -8px 24px -16px rgb\(16 18 26 \/ 0\.18\);/)
    expect(CSS).toMatch(/\.dark \{\s*--e-bar: inset 0 1px 0 rgb\(255 255 255 \/ 0\.06\), 0 -8px 24px -12px rgb\(0 0 0 \/ 0\.7\);/)
  })
})

describe("F4. a phone on its side", () => {
  it("keeps the gutters clear of the notch with the safe-area insets", () => {
    expect(CSS).toMatch(/@media \(max-width: 1023\.98px\) and \(orientation: landscape\)[\s\S]*?padding-left: max\(var\(--phone-inline, 0px\), env\(safe-area-inset-left\)\);[\s\S]*?padding-right: max\(var\(--phone-inline, 0px\), env\(safe-area-inset-right\)\);/)
  })
})

describe("F5. the theme's glow on a tab's root", () => {
  it("is the theme's --glow, scrolling away with the page, and never on a pushed page", () => {
    const body = rules('[data-app-scroller][data-glow="true"]')[0]
    expect(body).toMatch(/rgb\(var\(--glow\) \/ 0\.2\)/)
    expect(body).toMatch(/background-attachment: local/)
    expect(body).toMatch(/background-size: 100% 220px/)
    const shell = read("components/navigationBar/mobile/mobileNavigationBar.tsx")
    expect(shell).toMatch(/data-glow=\{tabRoot \|\| undefined\}/)
    expect(shell).toMatch(/const tabRoot = isTabRoot\(pathname\)/)
  })

  it("is fainter in dark (.14)", () => {
    expect(rules('.dark [data-app-scroller][data-glow="true"]')[0]).toMatch(/rgb\(var\(--glow\) \/ 0\.14\)/)
  })
})

describe("C1. the tab bar's material", () => {
  it("is raised and translucent with the bar shadow and no border, solid without transparency", () => {
    const bar = rules(".phone-tabbar ")[0] ?? rules(".phone-tabbar")[0]
    expect(bar).toMatch(/color-mix\(in srgb, var\(--raised\) 92%, transparent\)/)
    expect(bar).toMatch(/backdrop-filter: saturate\(1\.6\) blur\(16px\)/)
    expect(bar).toMatch(/box-shadow: var\(--e-bar\)/)
    expect(bar).not.toMatch(/border/)
    expect(CSS).toMatch(/@media \(prefers-reduced-transparency: reduce\) \{\s*\.phone-tabbar,\s*\.dark \.phone-tabbar \{\s*background: var\(--raised\);/)
  })

  it("puts the glyph in a 44x28 capsule that fills with the accent at 10% when current", () => {
    const cap = rules(".phone-tab-cap {")[0] ?? rules(".phone-tab-cap")[0]
    expect(cap).toMatch(/width: 44px;\s*height: 28px;/)
    expect(CSS).toMatch(/\.phone-tab-cap::before \{[^}]*color-mix\(in oklab, var\(--brand\) 10%, transparent\)/)
  })

  it("counts in an 18px pill and marks plain unread with an ink-2 dot", () => {
    expect(rules(".phone-tabbar .phone-tab-badge")[0]).toMatch(/min-width: 18px;\s*height: 18px;/)
    expect(rules(".phone-tabbar .phone-tab-dot")[0]).toMatch(/background: var\(--ink-2\)/)
  })
})

describe("C2. the large title", () => {
  it("holds the bar's own title back, faded and 4px low, until the large one has gone up under the bar", () => {
    expect(CSS).toMatch(/\[data-phone-topbar\]\[data-large="true"\]:not\(\[data-large-passed="true"\]\) \[data-phone-bar\] > :nth-child\(2\) \{\s*opacity: 0;\s*translate: 0 4px;/)
    expect(CSS).toMatch(/transition: opacity 180ms var\(--ease-out\), translate 180ms var\(--ease-out\)/)
  })
})

describe("L4. a pull is not a press", () => {
  it("takes the press fill off the row under the finger while the content follows a pull", () => {
    expect(CSS).toMatch(/\[data-pulling\] \[data-pressed="true"\],\s*\[data-pulling\] \[data-press\]:active \{\s*background-color: transparent !important;/)
    expect(read("components/ui/pullToRefresh.tsx")).toMatch(/el\.setAttribute\("data-pulling", ""\)/)
  })
})

describe("§7. the phone's motion rules", () => {
  it("moves only transform, opacity, scale, translate, rotate, a filter and small colours", () => {
    // --ix-a is the interaction layer's tint alpha (app/interaction.css): a colour.
    const allowed = new Set(["transform", "opacity", "scale", "translate", "rotate", "background-color", "color", "box-shadow", "filter", "stroke-dashoffset", "border-radius", "--ix-a"])
    for (const m of CSS.matchAll(/transition(?:-property)?:\s*([^;]+);/g)) {
      for (const part of m[1].split(",")) {
        const prop = part.trim().split(/\s+/)[0].replace("!important", "")
        if (/^\d/.test(prop)) continue
        expect(allowed.has(prop), `transition on ${prop}`).toBe(true)
      }
    }
    expect(CSS).not.toMatch(/transition:\s*all\b/)
  })

  it("uses only the house curves", () => {
    const curves = new Set(["cubic-bezier(0.32, 0.72, 0, 1)"])
    for (const m of CSS.matchAll(/cubic-bezier\([^)]*\)/g)) expect(curves.has(m[0]), m[0]).toBe(true)
  })

  it("keeps every duration on the scale", () => {
    const scale = new Set([0, 90, 120, 140, 160, 180, 200, 220, 240, 260, 300, 320, 340, 380, 420, 900, 1800])
    for (const m of CSS.matchAll(/(\d+)ms/g)) expect(scale.has(Number(m[1])), `${m[1]}ms`).toBe(true)
  })

  it("stills the decoration under reduced motion", () => {
    expect(CSS).toMatch(/prefers-reduced-motion: no-preference/)
    expect(CSS).toMatch(/prefers-reduced-motion: reduce/)
    // The spinning ring and the shake are behind no-preference.
    const safe = CSS.split("@media (prefers-reduced-motion: no-preference)").slice(1).join("")
    expect(safe).toMatch(/phone-spin/)
    expect(safe).toMatch(/phone-shake/)
  })
})

describe("the installed app", () => {
  it("has no tap flash, no callout on the chrome, and no rubber band past the frame", () => {
    expect(CSS).toMatch(/-webkit-tap-highlight-color: transparent/)
    expect(CSS).toMatch(/@media \(display-mode: standalone\)[\s\S]*?overscroll-behavior: none[\s\S]*?-webkit-touch-callout: none/)
  })
})
