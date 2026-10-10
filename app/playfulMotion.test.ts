import { readFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

/**
 * The playful layer's motion (PLAYFUL_LAYER.md, "Motion"): checks and toggles
 * land with a springy 1 -> 1.12 -> 1 over 220 ms with a slight overshoot, and
 * everything decorative stands still for prefers-reduced-motion.
 */
const CSS = readFileSync(join(__dirname, "globals.css"), "utf8")
const theme = CSS.slice(CSS.indexOf("@theme inline {"), CSS.indexOf("\n}", CSS.indexOf("@theme inline {")))

function block(head: string): string {
  const at = CSS.indexOf(head)
  expect(at, `${head} is defined`).toBeGreaterThan(-1)
  return CSS.slice(at, CSS.indexOf("\n}", at))
}

describe("the spring", () => {
  it("bounces a check 1 -> 1.12 -> 1", () => {
    const keyframes = block("@keyframes spring-pop {")
    expect(keyframes).toMatch(/0%, 100% \{ scale: 1; \}/)
    expect(keyframes).toMatch(/45% \{ scale: 1\.12; \}/)
  })

  it("takes 220 ms on the house curve", () => {
    expect(theme).toMatch(/--animate-spring:\s*spring-pop 220ms cubic-bezier\(0\.2, 0\.8, 0\.2, 1\);/)
  })

  it("lets a travelling thumb overshoot slightly, also in 220 ms", () => {
    const m = /--ease-spring:\s*cubic-bezier\(([\d.]+), ([\d.]+), ([\d.]+), ([\d.]+)\);/.exec(theme)
    expect(m, "--ease-spring is a cubic-bezier").not.toBeNull()
    const y1 = Number(m![2])
    // An overshoot, but a slight one: past 1, not a cartoon bounce.
    expect(y1).toBeGreaterThan(1)
    expect(y1).toBeLessThanOrEqual(1.5)
    const util = block("@utility transition-spring {")
    expect(util).toMatch(/transition-duration:\s*220ms;/)
    expect(util).toMatch(/transition-timing-function:\s*var\(--ease-spring\);/)
    expect(util).not.toMatch(/\ball\b/)
  })

  it("is what the switch's thumb travels on", () => {
    const sw = readFileSync(join(__dirname, "../components/ui/switch.tsx"), "utf8")
    expect(sw).toMatch(/transition-spring/)
  })
})

describe("reduced motion", () => {
  it("stills every animation and transition, the spring included", () => {
    const at = CSS.lastIndexOf("@media (prefers-reduced-motion: reduce) {")
    const reduced = CSS.slice(at, CSS.indexOf("\n}", at))
    expect(reduced).toMatch(/animation-duration:\s*0\.01ms !important;/)
    expect(reduced).toMatch(/transition-duration:\s*0\.01ms !important;/)
  })
})
