import { describe, expect, it } from "vitest"
import { browserTZ, localDay } from "./timeZone"

describe("localDay", () => {
  it("is the day where the viewer is, padded", () => {
    expect(localDay(new Date(2026, 0, 5, 23, 59))).toBe("2026-01-05")
    expect(localDay(new Date(2026, 9, 31, 0, 1))).toBe("2026-10-31")
  })
  it("defaults to today", () => {
    expect(localDay()).toBe(localDay(new Date()))
  })
})

describe("browserTZ", () => {
  it("names a zone", () => {
    expect(browserTZ()).toMatch(/\S/)
  })
})
