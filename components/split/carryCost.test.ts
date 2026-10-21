import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

// Split view's fluid-21 at 4x: a carry restyles only its own elements.
// Lifting a view hid what it held (the shared placeholder's rule over its
// children, [data-drag-state="placeholder"] > *) and took the views' pointer
// (data-arranging on the row, inherited by everything in it): each restyled
// every element in the views as a view was lifted and again as it was set
// down, 30 to 110 ms a time on a split Home (a Chrome trace, 21 Oct). The held
// view's sheet turns see-through by a rule on itself, and the carry's surface
// takes the pointer (components/split/SplitArrange).
const css = ["app/globals.css", "app/interaction.css"].map((f) => readFileSync(f, "utf8").replace(/\/\*[\s\S]*?\*\//g, "")).join("\n")

describe("a carry's states", () => {
  it("restyle the element that carries them, and nothing under or beside it", () => {
    const rules = [...css.matchAll(/([^{};]*\[data-split-held[^{};]*)\{/g)].flatMap((m) => m[1].split(","))
    expect(rules.length).toBeGreaterThan(0)
    expect(rules.filter((r) => /\[data-split-held\]\s*[\s>+~]\s*\S/.test(r.trim()))).toEqual([])
    expect(css).not.toMatch(/\[data-arranging\]/)
  })

  it("leave the shared placeholder off the views: a held view says data-split-held", () => {
    const src = readFileSync("components/split/SplitArrange.tsx", "utf8")
    expect(src).not.toMatch(/"data-drag-state", "placeholder"/)
    expect(src).toMatch(/setAttribute\("data-split-held"/)
  })
})
