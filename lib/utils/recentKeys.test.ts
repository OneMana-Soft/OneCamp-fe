import { describe, expect, it } from "vitest"
import { recentKeys } from "./recentKeys"

describe("recentKeys", () => {
  it("reports a repeat inside the window and forgets it after", () => {
    const keys = recentKeys(4000)
    expect(keys.seen("a", 1000)).toBe(false)
    expect(keys.seen("a", 4999)).toBe(true)
    expect(keys.seen("a", 5000)).toBe(false)
  })

  it("keeps different keys apart", () => {
    const keys = recentKeys(4000)
    expect(keys.seen("a", 0)).toBe(false)
    expect(keys.seen("b", 0)).toBe(false)
    expect(keys.seen("a", 1)).toBe(true)
  })

  it("holds no more than one window of keys, however long the tab stays open", () => {
    const keys = recentKeys(1000)
    for (let i = 0; i < 10_000; i++) keys.seen(`message ${i}`, i * 100)
    expect(keys.size).toBeLessThanOrEqual(10)
  })
})
