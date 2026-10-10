import { describe, expect, it } from "vitest"

import { CAMP_HUES, campHueOf, hueFor, isCampHue } from "@/lib/campHue"

/**
 * A thing's hue is part of its identity: a project's colour follows it from
 * the sidebar to the board to the calendar. So the mapping must be stable
 * (the same id is the same hue forever, in the workspace and the storefront,
 * which carry the same file), spread evenly (six hues, each about a sixth of
 * everything), and overridable (a colour the person picked wins).
 */

// A seeded generator, so the distribution checks are the same on every run.
function uuids(n: number): string[] {
  let s = 42
  const next = () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2 ** 32
  const hex = (k: number) => Array.from({ length: k }, () => Math.floor(next() * 16).toString(16)).join("")
  return Array.from({ length: n }, () => `${hex(8)}-${hex(4)}-4${hex(3)}-${"89ab"[Math.floor(next() * 4)]}${hex(3)}-${hex(12)}`)
}

function tally(ids: string[]): Record<string, number> {
  const out: Record<string, number> = Object.fromEntries(CAMP_HUES.map((h) => [h, 0]))
  for (const id of ids) out[hueFor(id)]++
  return out
}

describe("hueFor is stable", () => {
  // Pinned on 10 Oct 2026. If one of these moves, every person, project and
  // channel in every workspace changes colour: change the salt, the hash or
  // the order of CAMP_HUES only on purpose, and in both repos.
  it.each([
    ["0f8e2a6c-1b3d-4c5e-9f7a-2b4d6e8f0a1c", "sun"],
    ["3c9d7e21-5a4b-4f6c-8d2e-1a3b5c7d9e0f", "sky"],
    ["a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d", "lake"],
    ["5e6f7a8b-9c0d-4e1f-a2b3-c4d5e6f7a8b9", "dusk"],
    ["b7c8d9e0-f1a2-4b3c-9d4e-5f6a7b8c9d0e", "berry"],
    ["Maya Chen", "moss"],
  ])("%s is %s", (id, hue) => {
    expect(hueFor(id)).toBe(hue)
  })

  it("gives the same id the same hue every time", () => {
    for (const id of uuids(200)) expect(hueFor(id)).toBe(hueFor(id))
  })

  it("ignores case and surrounding space, so one id from two sources agrees", () => {
    expect(hueFor("  A1B2C3D4-E5F6-4A7B-8C9D-0E1F2A3B4C5D ")).toBe(hueFor("a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d"))
  })

  it("gives the demo's cast three different hues", () => {
    // The first avatar row a buyer sees. Unsalted, all three were dusk.
    const cast = ["Sam Rivera", "Maya Chen", "Jonas Weber"].map((name) => hueFor(name))
    expect(new Set(cast).size).toBe(3)
  })

  it("falls back to the first hue when there is no id at all", () => {
    expect(hueFor(undefined)).toBe("sky")
    expect(hueFor(null)).toBe("sky")
    expect(hueFor("   ")).toBe("sky")
  })
})

describe("hueFor spreads ids evenly", () => {
  it("puts each hue within 10% of a sixth of 6,000 uuids", () => {
    const counts = tally(uuids(6000))
    for (const hue of CAMP_HUES) {
      expect(counts[hue], `${hue}: ${JSON.stringify(counts)}`).toBeGreaterThan(900)
      expect(counts[hue], `${hue}: ${JSON.stringify(counts)}`).toBeLessThan(1100)
    }
  })

  it("spreads ids that differ only in a trailing number", () => {
    // user-1, user-2... landed on two hues before the finaliser.
    const counts = tally(Array.from({ length: 600 }, (_, i) => `user-${i + 1}`))
    for (const hue of CAMP_HUES) {
      expect(counts[hue], `${hue}: ${JSON.stringify(counts)}`).toBeGreaterThan(60)
      expect(counts[hue], `${hue}: ${JSON.stringify(counts)}`).toBeLessThan(140)
    }
  })

  it("only ever answers with one of the six", () => {
    for (const id of uuids(500)) expect(isCampHue(hueFor(id))).toBe(true)
  })
})

describe("a chosen colour wins", () => {
  const id = "0f8e2a6c-1b3d-4c5e-9f7a-2b4d6e8f0a1c"

  it.each(CAMP_HUES)("a camp hue's own name (%s) wins over the id", (hue) => {
    expect(hueFor(id, hue)).toBe(hue)
  })

  it.each([
    ["emerald", "moss"],
    ["Rose", "berry"],
    ["teal", "lake"],
    ["indigo", "dusk"],
    ["amber", "sun"],
    ["blue", "sky"],
    // Orange is the accent, never an identity: it folds onto sun.
    ["orange", "sun"],
  ])("a palette name (%s) folds onto %s", (name, hue) => {
    expect(hueFor(id, name)).toBe(hue)
  })

  it.each([
    ["#3B82F6", "sky"],
    ["#10B981", "moss"],
    ["#06B6D4", "lake"],
    ["#8B5CF6", "dusk"],
    ["#EC4899", "berry"],
    ["#EF4444", "berry"],
    ["#F59E0B", "sun"],
    ["#F97316", "sun"],
    ["#c3f", "dusk"],
  ])("a hex (%s) folds onto the nearest hue, %s", (hex, hue) => {
    expect(hueFor(id, hex)).toBe(hue)
  })

  it.each(["", "  ", "slate", "#888888", "#ffffff", "#000", "not a colour", null, undefined])(
    "a choice that names no hue (%s) leaves the id to decide",
    (chosen) => {
      expect(hueFor(id, chosen)).toBe(hueFor(id))
    },
  )

  it("reads a choice on its own, for a screen that only has the colour", () => {
    expect(campHueOf(" Berry ")).toBe("berry")
    expect(campHueOf("#6EA4F5")).toBe("sky")
    expect(campHueOf("grey")).toBeNull()
  })
})
