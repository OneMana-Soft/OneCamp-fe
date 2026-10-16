import { describe, expect, it } from "vitest"

import { pickFitting, roomFor } from "./fitLabel"

describe("pickFitting", () => {
  it("takes the longest wording that fits", () => {
    expect(pickFitting([150, 100, 80], 400)).toBe(0)
    expect(pickFitting([150, 100, 80], 120)).toBe(1)
    expect(pickFitting([150, 100, 80], 90)).toBe(2)
  })
  it("falls back to the shortest, which then truncates, when none fits", () => {
    expect(pickFitting([150, 100, 80], 40)).toBe(2)
  })
  it("allows half a pixel of rounding", () => {
    expect(pickFitting([150.4, 100], 150)).toBe(0)
  })
  it("copes with nothing to measure", () => {
    expect(pickFitting([], 100)).toBe(0)
  })
})

describe("roomFor", () => {
  it("is the row less its neighbours and their gaps", () => {
    // A 600 px row with nav (60), Today (50), and a 6 px gap after the label and each neighbour.
    expect(roomFor({ inner: 600, others: [60, 50], gap: 6 })).toBe(478)
  })
  it("is never negative", () => {
    expect(roomFor({ inner: 100, others: [80, 80], gap: 8 })).toBe(0)
  })
})
