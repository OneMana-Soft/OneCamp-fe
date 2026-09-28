import { describe, expect, it } from "vitest"
import { changedAtStart } from "./listShift"

const k = (...keys: string[]) => keys.map((key) => ({ key }))

describe("changedAtStart", () => {
  it("is true when older messages load above", () => {
    expect(changedAtStart(k("d2", "b", "c"), k("d1", "a", "d2", "b", "c"))).toBe(true)
  })
  it("is true when the oldest messages are dropped", () => {
    expect(changedAtStart(k("a", "b", "c"), k("b", "c"))).toBe(true)
  })
  it("is false when a message arrives at the end", () => {
    expect(changedAtStart(k("a", "b"), k("a", "b", "c"))).toBe(false)
  })
  it("is false when both ends change, so every row re-measures", () => {
    expect(changedAtStart(k("b", "c"), k("a", "b", "c", "d"))).toBe(false)
  })
  it("is false for a different conversation, an edit in the middle, or no history", () => {
    expect(changedAtStart(k("a", "b"), k("x", "y"))).toBe(false)
    expect(changedAtStart(k("a", "b", "c"), k("a", "c"))).toBe(false)
    expect(changedAtStart(null, k("a"))).toBe(false)
    expect(changedAtStart(k("a"), [])).toBe(false)
  })
})
