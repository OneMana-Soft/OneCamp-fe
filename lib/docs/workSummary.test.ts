import { describe, expect, it } from "vitest"
import { workSummary } from "./workSummary"

// A person's work in words, as business/Departed Work says it (miro-32: a
// departed owner's boards are handed on with their docs, V-972).
describe("a person's work in words", () => {
  it("counts boards with docs and links", () => {
    expect(workSummary(12, 2, 3)).toBe("12 docs, 2 boards and 3 links")
    expect(workSummary(1, 1, 0)).toBe("1 doc and 1 board")
  })
  it("says a board-only leaver's boards, not 0 links", () => {
    expect(workSummary(0, 1, 0)).toBe("1 board")
    expect(workSummary(0, 4, 0)).toBe("4 boards")
  })
  it("says docs and links as before", () => {
    expect(workSummary(12, 0, 3)).toBe("12 docs and 3 links")
    expect(workSummary(0, 0, 1)).toBe("1 link")
    expect(workSummary(0, 0, 0)).toBe("0 links")
  })
})
