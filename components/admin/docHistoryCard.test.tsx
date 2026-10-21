import { describe, expect, it } from "vitest"
import { historyMeaning, lengthWords } from "./DocHistoryCard"

describe("the doc history setting's words (H1)", () => {
  it("says what a length means, and names lengths plainly", () => {
    expect(historyMeaning(365)).toBe("Versions older than 1 year are removed. Named and pinned versions are always kept.")
    expect(historyMeaning(1825)).toContain("older than 5 years")
    expect(historyMeaning(90)).toContain("older than 90 days")
    expect(historyMeaning(400)).toContain("older than 400 days")
    expect([30, 90, 365, 730, 1825].map(lengthWords)).toEqual(["30 days", "90 days", "1 year", "2 years", "5 years"])
  })
})
