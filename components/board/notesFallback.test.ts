import { describe, expect, it } from "vitest"

import { hueFor } from "@/lib/campHue"
import { fallbackNotes } from "./notesFallback"

// content.md B01: a board without a picture draws three stickies. Every
// board drew the same three, so a list of five read as one picture five
// times. Seeded by the board's id, each has its own, and keeps it.
describe("a board's fallback notes", () => {
  it("are the board's own, and the same each time", () => {
    const a = fallbackNotes("b0a1d000-0000-4000-8000-000000000002")
    const b = fallbackNotes("b0a1d000-0000-4000-8000-000000000003")
    expect(a).toEqual(fallbackNotes("b0a1d000-0000-4000-8000-000000000002"))
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(b))
  })

  it("use three different camp tints", () => {
    for (const id of ["one", "two", "three", "launch-retro"]) {
      const tints = fallbackNotes(id).map((n) => n.tint)
      expect(new Set(tints).size).toBe(3)
      for (const t of tints) expect(t).toMatch(/^var\(--camp-(sun|sky|berry|moss|dusk|lake)-tint\)$/)
    }
  })

  it("lead with the board's own hue, the one lib/campHue gives it everywhere else", () => {
    for (const id of ["b0a1d000-0000-4000-8000-000000000002", "launch-retro"]) {
      expect(fallbackNotes(id)[0].tint).toBe(`var(--camp-${hueFor(id)}-tint)`)
    }
  })

  it("tilt their own way on boards numbered one after another", () => {
    // Ids that differ in their last character: a hash that leaves them close
    // in its low bits gave eight boards the same tilts.
    const ids = Array.from({ length: 8 }, (_, i) => `b0a1d000-0000-4000-8000-00000000000${i}`)
    const tilts = new Set(ids.map((id) => fallbackNotes(id).map((n) => `${n.rot}/${n.y}`).join(" ")))
    expect(tilts.size).toBeGreaterThanOrEqual(7)
  })

  it("keep sun, sky and berry without an id", () => {
    expect(fallbackNotes().map((n) => n.tint)).toEqual(["var(--camp-sun-tint)", "var(--camp-sky-tint)", "var(--camp-berry-tint)"])
  })
})
